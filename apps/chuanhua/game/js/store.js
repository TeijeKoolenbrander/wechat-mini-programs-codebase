/**
 * Persistent client state (wx storage) with GUARDED PARSING: whatever is in storage (an older build, a half-written value,
 * a hand-edited or hostile string) is checked field by field and replaced by the default when it is not of the expected
 * shape; it can never throw and never reach the game as an unvalidated object. Holds only what must survive a kill:
 * the unsent turn of 17.21 (strokes/text per claimId), display and sound settings, first-run flags, subscribe flags, ad caps,
 * the local reveal counter and the cached 我的接龙 list (read-only offline). Never an openid, group id or token.
 */

const strokesLib = require('../core/strokes');
const text = require('../core/text');

const KEY = 'chuanhua_state_v1';
const VERSION = 1;
const MAX_MAP = 200;
const ALBUM_STATUS = ['revealed', 'playing', 'lobby', 'open', 'pending', 'expired', 'blocked', 'removed'];

function fresh() {
  return {
    v: VERSION,
    installId: null,
    firstDate: null,
    lastSessionAt: 0,
    muted: false,
    howtoSeen: false,
    coachSeen: false,
    explainerSeen: false, // the first-time line on 已传出
    display: null, // { largeText, highContrast }; null until the first launch decides
    lifetimeReveals: 0, // reveals this device has opened (interstitial gate, 11)
    revealsSeen: {}, // chainId / roomId -> true: counted once toward the lifetime reveals (interstitial gate), and a seen chain has no dot
    interstitial: { day: '', count: 0, lastAt: 0 },
    subscribe: { banned: false, granted: {}, declined: {} },
    paletteDay: '', // Beijing dateKey on which 今日彩笔 was unlocked (server value wins)
    noFill: { day: '', start: false, palette: false }, // 11: a no-fill reward is granted once per day per placement
    turn: null, // the unsent draw/describe turn (17.21): keyed by claim (慢慢传) or room + round (live)
    albumCache: null, // { at, streakText, items[], cursor } for offline 我的接龙
  };
}

// ---- field guards ----------------------------------------------------------------------------------------------

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const bool = (v, d) => (typeof v === 'boolean' ? v : d);
const str = (v, d, max) => (typeof v === 'string' && v.length <= (max || 200) ? v : d);
const int = (v, d, lo, hi) => (typeof v === 'number' && Number.isFinite(v) && Math.floor(v) === v && v >= lo && v <= hi ? v : d);
const dateKey = (v, d) => (typeof v === 'string' && /^\d{8}$/.test(v) ? v : d);
const chainIdOk = (v) => typeof v === 'string' && /^[A-Za-z0-9]{6,20}$/.test(v);

function flagMap(v) {
  const out = {};
  if (!isObj(v)) return out;
  const keys = Object.keys(v).filter((k) => chainIdOk(k) && v[k] === true);
  keys.slice(-MAX_MAP).forEach((k) => {
    out[k] = true;
  });
  return out;
}

/**
 * The unsent turn (17.21, spec 15). Two shapes: a 慢慢传 turn keyed by its claim `{mode:'chain', chainId, claimId, step}` and a live turn
 * keyed by room and round `{mode:'live', roomId, round}`. A draft written by an older build has no `mode` and is a chain turn.
 */
function turnOf(v) {
  if (!isObj(v)) return null;
  const mode = v.mode === 'live' ? 'live' : 'chain';
  let step;
  let ids;
  if (mode === 'live') {
    if (!chainIdOk(v.roomId)) return null;
    step = int(v.round, 0, 1, 6);
    ids = { roomId: v.roomId, round: step };
  } else {
    if (!chainIdOk(v.chainId) || typeof v.claimId !== 'string' || !v.claimId || v.claimId.length > 60) return null;
    step = int(v.step, 0, 1, 6);
    ids = { chainId: v.chainId, claimId: v.claimId, step };
  }
  if (!step) return null;
  const kind = step % 2 === 1 ? 'draw' : 'describe';
  if (v.kind !== kind) return null;
  const out = Object.assign({
    mode,
    kind,
    gridH: int(v.gridH, 1024, 768, 2048),
    colorIdx: int(v.colorIdx, 0, 0, 11),
    sizeIdx: int(v.sizeIdx, 1, 0, 2),
    undoCount: int(v.undoCount, 0, 0, 100000),
    startedAt: int(v.startedAt, 0, 0, 4e12),
    savedAt: int(v.savedAt, 0, 0, 4e12),
    strokes: null,
    text: '',
  }, ids);
  if (kind === 'draw' && v.strokes) {
    if (!strokesLib.validate(v.strokes, { requireStroke: false }).ok) return null;
    out.strokes = v.strokes;
  }
  if (kind === 'describe' && typeof v.text === 'string') out.text = text.inputFilter(v.text.slice(0, 80), 'describe').text;
  return out;
}

/** 我的接龙 cache rows (rev. 2: rooms and chains in one list). A row written by v1 (no kind / id) is dropped. */
function albumOf(v) {
  if (!isObj(v) || !Array.isArray(v.items)) return null;
  const items = [];
  for (const it of v.items.slice(0, 60)) {
    if (!isObj(it) || (it.kind !== 'room' && it.kind !== 'chain') || !chainIdOk(it.id) || !ALBUM_STATUS.includes(it.status)) continue;
    items.push({ kind: it.kind, id: it.id, status: it.status, line: str(it.line, '', 80), timeText: str(it.timeText, '', 30), unseen: it.unseen === true });
  }
  return { at: int(v.at, 0, 0, 4e12), streakText: str(v.streakText, null, 30) || null, items, cursor: str(v.cursor, null, 20) || null };
}

/** raw storage value (string, object or garbage) -> a complete, validated state. Never throws. */
function parseState(raw) {
  const s = fresh();
  let p = raw;
  try {
    if (typeof raw === 'string') {
      if (raw.length > 400 * 1024) return s;
      p = JSON.parse(raw);
    }
  } catch (e) {
    return s;
  }
  if (!isObj(p) || p.v !== VERSION) return s;
  try {
    s.installId = str(p.installId, null, 60) || null;
    s.firstDate = dateKey(p.firstDate, null);
    s.lastSessionAt = int(p.lastSessionAt, 0, 0, 4e12);
    s.muted = bool(p.muted, false);
    s.howtoSeen = bool(p.howtoSeen, false);
    s.coachSeen = bool(p.coachSeen, false);
    s.explainerSeen = bool(p.explainerSeen, false);
    s.display = isObj(p.display) ? { largeText: bool(p.display.largeText, false), highContrast: bool(p.display.highContrast, false) } : null;
    s.lifetimeReveals = int(p.lifetimeReveals, 0, 0, 1e6);
    s.revealsSeen = flagMap(p.revealsSeen);
    if (isObj(p.interstitial)) s.interstitial = { day: dateKey(p.interstitial.day, ''), count: int(p.interstitial.count, 0, 0, 1000), lastAt: int(p.interstitial.lastAt, 0, 0, 4e12) };
    if (isObj(p.subscribe)) s.subscribe = { banned: bool(p.subscribe.banned, false), granted: flagMap(p.subscribe.granted), declined: flagMap(p.subscribe.declined) };
    s.paletteDay = dateKey(p.paletteDay, '');
    if (isObj(p.noFill)) s.noFill = { day: dateKey(p.noFill.day, ''), start: bool(p.noFill.start, false), palette: bool(p.noFill.palette, false) };
    s.turn = turnOf(p.turn);
    s.albumCache = albumOf(p.albumCache);
  } catch (e) {
    return fresh();
  }
  return s;
}

function createStore(wx) {
  let state = fresh();
  try {
    const raw = wx && wx.getStorageSync ? wx.getStorageSync(KEY) : null;
    if (raw) state = parseState(raw);
  } catch (e) {
    state = fresh();
  }
  function save() {
    try {
      if (wx && wx.setStorageSync) wx.setStorageSync(KEY, JSON.stringify(state));
    } catch (e) {
      /* storage full or unavailable: play continues */
    }
  }
  return {
    get state() {
      return state;
    },
    save,
    reset() {
      // in place, so everyone holding `store.state` sees the reset
      Object.keys(state).forEach((k) => delete state[k]);
      Object.assign(state, fresh());
      save();
    },
  };
}

module.exports = { createStore, parseState, fresh, KEY, VERSION };
