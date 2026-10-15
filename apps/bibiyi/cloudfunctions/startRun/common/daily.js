'use strict';
// Daily deck creation, shared by genDaily (timer) and getDaily/startRun (lazy fallback). Spec 4.4, 5.2.
// No seed bank: generation is rules-based and cheap. A deck that fails the analytic gates is discarded;
// when no candidate passes we publish NOTHING (DAILY_UNAVAILABLE), never a relaxed deck.
const crypto = require('crypto');
const core = require('./coreapi');
const store = require('./store');
const pool = require('./pool');
const { AppError, isDateKey, daysBetween, addDaysKey, randomSeed, now, DECK_LEN } = require('./util');

const BUDGET_FRACTION = 0.7;
const MIN_POOL = 30;

/** Launch date key: env override, else the first deck ever created (stored once in `meta`). */
async function launchKey(dateKey) {
  const env = process.env.LAUNCH_DATE_KEY;
  if (isDateKey(env)) return env;
  let m = await store.getDoc('meta', 'launch');
  if (!m) {
    await store.addIfAbsent('meta', { _id: 'launch', dateKey });
    m = await store.getDoc('meta', 'launch');
  }
  return m.dateKey;
}
async function issueNoFor(dateKey) {
  const launch = await launchKey(dateKey);
  return Math.max(1, daysBetween(launch, dateKey) + 1);
}

/** fact ids used by published decks within the repeat window around dateKey (both directions) */
async function recentFactIds(dateKey) {
  const w = core.repeatWindowDays();
  const ids = new Set();
  for (let d = 1; d < w; d++) {
    for (const key of [addDaysKey(dateKey, -d), addDaysKey(dateKey, d)]) {
      const deck = await store.getDoc('daily_decks', key);
      if (deck) for (const q of deck.questions) { ids.add(q.a); ids.add(q.b); }
    }
  }
  return ids;
}

/** Get a published deck (cached; decks are immutable). null if none. */
const deckCache = new Map();
async function getDeck(dateKey) {
  const hit = deckCache.get(dateKey);
  if (hit && now() - hit.at < 5 * 60 * 1000) return hit.doc;
  const doc = await store.getDoc('daily_decks', dateKey);
  if (doc) {
    if (deckCache.size > 60) deckCache.clear();
    deckCache.set(dateKey, { at: now(), doc });
  }
  return doc;
}
function clearDeckCache() {
  deckCache.clear();
}

function alertFailed(dateKey, why, attempts, t0) {
  console.error(`[ALERT] no daily deck for ${dateKey}: ${why} (${attempts} candidates). Check daily_facts / difficulty gates.`);
  return store.writeEvent('server', 'daily_gen', { dateKey, attempts, genMs: now() - t0, failed: true });
}

/**
 * Returns {doc, created}. Idempotent per dateKey: the deck is created with `add` of the fixed _id, so a
 * double-fired timer or a racing lazy getDaily creates exactly one document.
 * @param startedAt handler start (ms); the candidate loop stops at 70% of the configured timeout from here
 */
async function ensureDaily(dateKey, { startedAt = now(), timeoutMs = 60000 } = {}) {
  const existing = await getDeck(dateKey);
  if (existing) return { doc: existing, created: false };
  const t0 = now();
  const v = core.currentVersions();
  const [all, overrides, recent] = await Promise.all([pool.loadDailyPool(v.contentVersion), pool.getOverrides(), recentFactIds(dateKey)]);
  const suspended = new Set(overrides.suspended.map((s) => s.factId));
  const facts = all.filter((f) => f.status === 'active' && !suspended.has(f.id) && !recent.has(f.id));
  if (facts.length < MIN_POOL) {
    await alertFailed(dateKey, `only ${facts.length} usable daily facts`, 0, t0);
    throw new AppError('DAILY_UNAVAILABLE', 'daily fact pool too small');
  }
  const seed = randomSeed();
  const max = core.maxCandidates();
  const budget = BUDGET_FRACTION * timeoutMs;
  let attempts = 0;
  let chosen = null;
  while (attempts < max && now() - startedAt < budget) {
    const q = core.buildDailyDeck({ facts, seed, attempt: attempts, dateKey, configVersion: v.configVersion });
    attempts++;
    if (!q || q.length !== DECK_LEN) continue;
    const g = core.evaluateDeck(q, v.configVersion);
    if (g && g.pass) { chosen = { q, g }; break; }
  }
  if (!chosen) {
    await alertFailed(dateKey, 'no candidate passed the gates', attempts, t0);
    throw new AppError('DAILY_UNAVAILABLE', 'no accepted daily deck');
  }
  const theme = core.themeFor(dateKey);
  const doc = {
    _id: dateKey, issueNo: await issueNoFor(dateKey), theme: theme.key, themeLabel: theme.label, seed,
    contentVersion: v.contentVersion, configVersion: v.configVersion, gateVersion: v.gateVersion,
    questions: chosen.q.map((x) => ({ a: x.a.id, b: x.b.id })),
    gates: { median: chosen.g.median, p20: chosen.g.p20, p40: chosen.g.p40, pass: true },
    attempts, genMs: now() - t0, boardSalt: crypto.randomBytes(16).toString('hex'), createdAt: now(),
  };
  const added = await store.addIfAbsent('daily_decks', doc);
  if (!added) return { doc: await getDeck(dateKey) || await store.getDoc('daily_decks', dateKey), created: false };
  deckCache.set(dateKey, { at: now(), doc });
  return { doc, created: true };
}

module.exports = { ensureDaily, issueNoFor, getDeck, clearDeckCache, recentFactIds };
