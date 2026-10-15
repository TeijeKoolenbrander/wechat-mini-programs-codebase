/**
 * Deck engine (spec 4). Pair rules, difficulty bands, the free deck builder
 * (client and server, deterministic) and the daily deck builder + gate loop
 * (server, nightly). Pure JS, no wx; copied into the cloud functions.
 *
 * A deck is { kind, length, questions: [{k, a, b, m, seg, segStart}] } where
 * a / b are fact ids (a = top card, b = bottom card). Inside a segment the
 * top card of question k+1 is the bottom card of question k.
 */

const { sub, int, shuffle, hash32 } = require('./rng');
const { BY_KEY, DAILY_THEME, MEASURES } = require('./measures');
const { getConfig, bandAt } = require('./config');
const { displayNumber } = require('./format');
const { getContent, isActive } = require('./content');
const { deckStats, passesGates } = require('./gates');

// ---------------------------------------------------------------- pair rules (spec 4.1)

/** Raw gap of a pair: max/min for ratio kind, |delta years| for year kind. */
function gapOf(m, a, b) {
  if (m.kind === 'year') return Math.abs(b.value - a.value);
  return Math.max(a.value, b.value) / Math.min(a.value, b.value);
}

/**
 * Smallest legal gap of a pair. Ratio: the measure's minGap, or minGap^1.5
 * (in log space) when either fact is approximate. Year: max(30, 2 x the larger
 * uncertainty).
 */
function effMinGap(config, m, a, b) {
  if (m.kind === 'year') return Math.max(config.yearMinDelta, config.yearUncertaintyMul * Math.max(a.uncertainty || 0, b.uncertainty || 0));
  if (a.approx || b.approx) return Math.exp(Math.log(m.minGap) * config.approxGapFactor);
  return m.minGap;
}

/** The legal gap range of question position k for this pair: [lo, hi]. */
function bandRange(config, m, k, a, b) {
  const band = bandAt(config, k);
  const range = m.kind === 'year' ? band.year : band.ratio;
  const em = effMinGap(config, m, a, b);
  const lo = Math.max(range[0], em);
  const hi = range[1] < em ? em * config.boundStretch : range[1];
  return [lo, hi];
}

/** Distance outside the band, 0 when inside (log scale for ratios). */
function bandDistance(m, gap, range) {
  if (gap < range[0]) return m.kind === 'year' ? (range[0] - gap) / range[0] : Math.log(range[0] / gap);
  if (gap > range[1]) return m.kind === 'year' ? (gap - range[1]) / range[1] : Math.log(gap / range[1]);
  return 0;
}

function mentions(f, id) {
  return !!(f.noPairWith && f.noPairWith.indexOf(id) >= 0);
}

/**
 * Rules 1-4 of spec 4.1 (rule 5, no repeats, belongs to the deck builders).
 * opts.suspended: Set of fact ids treated as suspended.
 */
function pairLegal(config, a, b, opts) {
  if (!a || !b || a.id === b.id || a.label === b.label || a.measure !== b.measure) return false;
  const m = BY_KEY[a.measure];
  if (!m) return false;
  const susp = opts && opts.suspended;
  if (!isActive(a) || !isActive(b) || (susp && (susp.has(a.id) || susp.has(b.id)))) return false;
  if (mentions(a, b.id) || mentions(b, a.id)) return false;
  if (gapOf(m, a, b) < effMinGap(config, m, a, b) - 1e-12) return false;
  // the displayed (rounded) values must differ in the same direction as the raw values
  const da = displayNumber(m, a.value);
  const db = displayNumber(m, b.value);
  if (da === db || a.value < b.value !== da < db) return false;
  return true;
}

// ---------------------------------------------------------------- builder internals

/** Split `total` into segment lengths in [lo, hi]. */
function partition(rng, total, lo, hi) {
  const out = [];
  let rem = total;
  while (rem > 0) {
    if (rem <= hi && rem >= lo) {
      out.push(rem);
      break;
    }
    const maxX = Math.min(hi, rem - lo);
    const x = lo + int(rng, maxX - lo + 1);
    out.push(x);
    rem -= x;
  }
  return out;
}

/** Search budget (nodes) for one segment: a depth-first search with backtracking, so a tight pool still chains. */
const SEGMENT_BUDGET = 600;
const TOP_TRIES = 6;
/** The first (all gaps in band) pass of a free deck gives up sooner, so a phone never stalls on starting a run. */
const STRICT_BUDGET = 300;

/**
 * Build one segment (a chain of `len` questions of measure m starting at
 * position k0). Returns the question list, or null. Tracks usage in
 * `S.lastPos` (free: fact id -> last question position) or `S.used` (daily).
 * Depth-first with a node budget, so dead ends back up instead of failing the deck.
 */
function buildSegment(S, m, len, k0, segIdx, relax, strict) {
  const config = S.config;
  const facts = S.byMeasure[m.key];
  const free = S.kind === 'free';
  let local = {};

  const usable = (f, k) => {
    if (S.suspended && S.suspended.has(f.id)) return false;
    if (free) {
      if (relax) return true;
      const lp = local[f.id] !== undefined ? local[f.id] : S.lastPos[f.id];
      return lp === undefined || k - lp > config.freeRecency;
    }
    return !S.used.has(f.id) && local[f.id] === undefined && !(S.exclude && S.exclude.has(f.id));
  };

  /** Ordered candidate bottom cards for top card a at position k. */
  const candidates = (a, k) => {
    const inBand = [];
    const outBand = [];
    for (let j = 0; j < facts.length; j++) {
      const b = facts[j];
      if (b === a || !usable(b, k)) continue;
      if (!pairLegal(config, a, b, S)) continue;
      const d = bandDistance(m, gapOf(m, a, b), bandRange(config, m, k, a, b));
      if (d === 0) inBand.push(b);
      else if (free && !strict) outBand.push({ b, d });
    }
    if (inBand.length) return shuffle(S.rng, inBand);
    if (!outBand.length) return [];
    let best = Infinity;
    outBand.forEach((o) => {
      if (o.d < best) best = o.d;
    });
    return shuffle(S.rng, outBand.filter((o) => o.d <= best * 1.05 + 1e-9).map((o) => o.b));
  };

  const topsAll = facts.filter((f) => usable(f, k0));
  const tops = shuffle(S.rng, topsAll.slice()).slice(0, TOP_TRIES);
  for (let t = 0; t < tops.length; t++) {
    local = {};
    local[tops[t].id] = k0;
    const path = [];
    let budget = strict ? STRICT_BUDGET : SEGMENT_BUDGET;
    const dfs = (a, i) => {
      if (i === len) return true;
      if (--budget < 0) return false;
      const k = k0 + i;
      const cs = candidates(a, k);
      for (let c = 0; c < cs.length; c++) {
        const b = cs[c];
        local[b.id] = k;
        path.push({ k, a: a.id, b: b.id, m: m.key, seg: segIdx, segStart: i === 0 });
        if (dfs(b, i + 1)) return true;
        path.pop();
        delete local[b.id];
        if (budget < 0) return false;
      }
      return false;
    };
    if (dfs(tops[t], 0)) {
      Object.keys(local).forEach((id) => {
        if (free) S.lastPos[id] = local[id];
        else S.used.add(id);
      });
      return path;
    }
  }
  return null;
}

function measuresWithFacts(byMeasure, keys, minFacts) {
  return keys.filter((k) => byMeasure[k] && byMeasure[k].length >= minFacts);
}

// ---------------------------------------------------------------- free deck (spec 4.5)

/**
 * buildFreeDeck(seed, contentVersion, configVersion, group[, source])
 * Deterministic: the same inputs give the same deck on the client and on the
 * server. `group` is 'all' or a category key. `source` is a fact index (see
 * content.indexFacts); default is the bundled free pool for `contentVersion`.
 */
function buildFreeDeck(seed, contentVersion, configVersion, group, source) {
  const config = getConfig(configVersion);
  const index = source || getContent(contentVersion);
  if (!index) throw new Error('unknown contentVersion ' + contentVersion);
  const g = group || 'all';
  const rng = sub(seed, 'free:' + contentVersion + ':' + configVersion + ':' + g);
  const S = { kind: 'free', rng, config, byMeasure: index.byMeasure, lastPos: {}, suspended: null };
  const keys = MEASURES.filter((m) => g === 'all' || m.category === g).map((m) => m.key);
  const measures = measuresWithFacts(index.byMeasure, keys, 2);
  if (!measures.length) throw new Error('NO_LEGAL_PAIRS: no measure with two facts for group ' + g);
  const total = config.deckLen.free;
  const lens = partition(rng, total, config.segment.free[0], config.segment.free[1]);
  const questions = [];
  let prev = null;
  let k = 1;
  for (let si = 0; si < lens.length; si++) {
    let order = shuffle(rng, measures.slice());
    if (order.length > 1 && prev) order = order.filter((x) => x !== prev).concat([prev]);
    let seg = null;
    // pass 0: every gap inside its band; pass 1: nearest legal gap; pass 2: also allow nearby repeats
    for (let pass = 0; pass < 3 && !seg; pass++) {
      for (let oi = 0; oi < order.length && !seg; oi++) {
        seg = buildSegment(S, BY_KEY[order[oi]], lens[si], k, si, pass === 2, pass === 0);
      }
    }
    if (!seg) {
      // shorten: a segment of a single question cannot fail on band grounds, only on legality
      throw new Error('NO_LEGAL_PAIRS: cannot extend the free deck at question ' + k);
    }
    seg.forEach((q) => questions.push(q));
    prev = seg[0].m;
    k += lens[si];
  }
  return { kind: 'free', seed, group: g, contentVersion, configVersion, length: total, questions };
}

// ---------------------------------------------------------------- daily deck (spec 4.3, 5.2)

function dailySeed(dateKey) {
  return hash32('bibiyi:daily:' + dateKey);
}

/** The theme of a Beijing date key. v1 has no weekday themes: every day is the same mixed theme. */
function themeOf(dateKey) {
  void dateKey;
  return DAILY_THEME;
}

/**
 * One candidate daily deck, or null when the pools cannot supply it.
 * opts: { dateKey, seed?, attempt, index (daily facts), contentVersion, configVersion,
 *         exclude?: Set of fact ids (repeat window), suspended?: Set }
 */
function buildDailyDeck(opts) {
  const config = getConfig(opts.configVersion);
  const seed = opts.seed === undefined ? dailySeed(opts.dateKey) : opts.seed;
  const theme = themeOf(opts.dateKey);
  const rng = sub(seed, 'deck:' + opts.attempt);
  const byMeasure = {};
  MEASURES.forEach((m) => {
    byMeasure[m.key] = (opts.index.byMeasure[m.key] || []).filter((f) => f.pool === 'daily');
  });
  const S = { kind: 'daily', rng, config, byMeasure, used: new Set(), exclude: opts.exclude || null, suspended: opts.suspended || null };
  const allKeys = measuresWithFacts(byMeasure, MEASURES.map((m) => m.key), config.minDailyFactsPerMeasure);
  if (!allKeys.length) return null;

  const total = config.deckLen.daily;
  const [lo, hi] = config.segment.daily;
  const lens = partition(rng, total, lo, hi);

  const mixedCount = {};
  const questions = [];
  let prev = null;
  let k = 1;
  for (let si = 0; si < lens.length; si++) {
    const cap = opts.attempt > config.relaxSegmentCapAfter ? config.mixedSegmentsRelaxed : config.mixedSegmentsPerMeasure;
    const pool = allKeys.filter((key) => (mixedCount[key] || 0) < cap);
    let order = shuffle(rng, pool.slice());
    if (order.length > 1 && prev) order = order.filter((x) => x !== prev).concat(order.filter((x) => x === prev));
    let seg = null;
    let used = null;
    for (let oi = 0; oi < order.length && !seg; oi++) {
      for (let tries = 0; tries < 3 && !seg; tries++) seg = buildSegment(S, BY_KEY[order[oi]], lens[si], k, si, false);
      if (seg) used = order[oi];
    }
    if (!seg) return null;
    mixedCount[used] = (mixedCount[used] || 0) + 1;
    seg.forEach((q) => questions.push(q));
    prev = used;
    k += lens[si];
  }
  return {
    kind: 'daily', dateKey: opts.dateKey, seed, theme: { key: theme.key, label: theme.label },
    contentVersion: opts.contentVersion, configVersion: opts.configVersion, gateVersion: config.gateVersion,
    attempt: opts.attempt, length: total, questions,
  };
}

/**
 * The nightly generation loop (spec 4.4): candidates until one passes the
 * gates. Never relaxes anything: on failure returns { ok:false, code:'DAILY_UNAVAILABLE' }.
 * Returns { ok:true, deck, attempts, stats } on success (deck.gates = {median, p20, p40}).
 */
function generateDaily(opts) {
  const config = getConfig(opts.configVersion);
  const max = opts.maxAttempts || config.maxAttempts;
  let built = 0;
  for (let attempt = 1; attempt <= max; attempt++) {
    const deck = buildDailyDeck(Object.assign({}, opts, { attempt }));
    if (!deck) continue;
    built++;
    const stats = deckStats(deck, opts.index.byId, config);
    const g = passesGates(stats, config);
    if (g.pass) {
      deck.gates = { median: stats.median, p20: stats.p20, p40: stats.pFull, pass: true };
      return { ok: true, deck, attempts: attempt, built, stats };
    }
  }
  return { ok: false, code: 'DAILY_UNAVAILABLE', attempts: max, built };
}

/**
 * The fact ids introduced by a deck (segment-start top cards plus every
 * bottom card). A chained top card is the previous bottom card, not a new fact.
 */
function deckFactIds(deck) {
  const ids = [];
  deck.questions.forEach((q) => {
    if (q.segStart) ids.push(q.a);
    ids.push(q.b);
  });
  return ids;
}

/**
 * Check a deck against the spec 4.1 / 4.2 rules. Returns a list of problem
 * strings (empty = fine). opts: { suspended, strictBands (default true: gap
 * must be inside the band; free decks may relax) }.
 */
function validateDeck(deck, byId, config, opts) {
  const o = opts || {};
  const problems = [];
  const lastPos = {};
  const seen = new Set();
  deck.questions.forEach((q, i) => {
    const a = byId[q.a];
    const b = byId[q.b];
    if (q.k !== i + 1) problems.push('q' + (i + 1) + ': bad k');
    if (!a || !b) return problems.push('q' + q.k + ': unknown fact');
    const m = BY_KEY[a.measure];
    if (!pairLegal(config, a, b, o)) problems.push('q' + q.k + ': illegal pair ' + a.id + ' / ' + b.id);
    if (i > 0 && !q.segStart && deck.questions[i - 1].b !== q.a) problems.push('q' + q.k + ': chain broken');
    if (q.segStart && i > 0 && deck.questions[i - 1].b === q.a) problems.push('q' + q.k + ': segment start repeats the previous bottom card');
    if (o.strictBands !== false) {
      const range = bandRange(config, m, q.k, a, b);
      const gap = gapOf(m, a, b);
      if (bandDistance(m, gap, range) > 1e-9) problems.push('q' + q.k + ': gap ' + gap.toFixed(3) + ' outside band ' + range[0].toFixed(2) + '-' + range[1].toFixed(2));
    }
    const intro = q.segStart ? [q.a, q.b] : [q.b];
    intro.forEach((id) => {
      if (deck.kind === 'daily') {
        if (seen.has(id)) problems.push('q' + q.k + ': fact ' + id + ' twice in a daily deck');
        seen.add(id);
      } else {
        if (lastPos[id] !== undefined && q.k - lastPos[id] <= config.freeRecency && !o.allowRepeats) problems.push('q' + q.k + ': fact ' + id + ' repeats within ' + config.freeRecency);
        lastPos[id] = q.k;
      }
    });
  });
  if (deck.questions.length !== deck.length) problems.push('length ' + deck.questions.length + ' != ' + deck.length);
  return problems;
}

/** Segment sizes of a deck, in order. */
function segmentSizes(deck) {
  const sizes = [];
  deck.questions.forEach((q) => {
    if (q.segStart) sizes.push(0);
    sizes[sizes.length - 1]++;
  });
  return sizes;
}

module.exports = {
  gapOf, effMinGap, bandRange, bandDistance, pairLegal, partition,
  buildFreeDeck, buildDailyDeck, generateDaily, dailySeed, themeOf, deckFactIds, validateDeck, segmentSizes,
};
