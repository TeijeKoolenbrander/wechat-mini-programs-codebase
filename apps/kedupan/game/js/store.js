/**
 * Persistent client state (wx storage). Everything that must survive a kill: the pending (unsent) card, the reveal
 * being viewed, local archive plays, counters for interstitials / bonus cards, mute, first-run flags, privacy status,
 * display modes. Parsing is GUARDED: a missing, corrupt or hand-edited value never throws and never half-loads; each
 * field falls back to its default on its own (storage is untrusted input).
 *
 * Nothing here is worth money and none of it is trusted for scores: archive plays are device-only and unranked,
 * the daily positions live on the server (spec 2.3, 11, AC 37, 81).
 */

const { isInt, isDateKey } = require('./util');

const KEY = 'kd_state_v1';
const MAX_PLAYED_ITEMS = 60; // getBonusCard exclude cap (TD-10)
const MAX_ARCHIVE_PLAYS = 400;

function fresh() {
  return {
    v: 1,
    installId: null,
    firstDate: null,
    lastSessionAt: 0,
    muted: false,
    howtoSeen: false,
    coachSeen: false,
    display: null, // { largeText, highContrast }; null until the player changes it
    pending: null, // { dateKey, idx, pos }: a confirmed position the server has not accepted yet (spec 15.2)
    viewing: null, // { dateKey, idx }: the reveal on screen, so a kill during it resumes on it (edge 25)
    lifetimeSets: 0, // completed dailies + archive sets (interstitial gate, spec 9)
    archivePlays: {}, // dateKey -> { total, positions[5], at }
    playedItems: [], // item ids played in the archive or as bonus (exclude list, <= 60)
    archiveCache: null, // { items, bestStreak, hasMore, at } first page, for the offline list
    interstitial: { day: '', count: 0, lastAt: 0 },
    adNoFill: { day: '', keys: {} }, // placements that already got their free no-fill grant today
    bonus: { day: '', used: 0 },
    unlocks: { day: '', keys: {} }, // 全国分布 unlocked sets today
    privacy: { privacy: 'unknown', friendScope: 'unknown', markerPending: null, markerDay: '' }, // markerPending: { d, s } | null; markerDay = last day the marker was written
    subscribe: { banned: false, granted: {}, declined: {} },
    rulesAgreedVersion: null, // 发言规则 version the server last confirmed for this player (cache; the server is authoritative, D-2)
  };
}

const str = (v, d) => (typeof v === 'string' ? v : d);
const bool = (v, d) => (typeof v === 'boolean' ? v : d);
const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
const oneOf = (v, list, d) => (list.indexOf(v) >= 0 ? v : d);
const plain = (v) => v && typeof v === 'object' && !Array.isArray(v);
const dayBox = (v, shape) => {
  const out = Object.assign({ day: '' }, shape);
  if (!plain(v)) return out;
  out.day = str(v.day, '');
  return out;
};

/** Build a valid state from any parsed value. Exported for tests. */
function sanitize(raw) {
  const s = fresh();
  if (!plain(raw) || raw.v !== 1) return s;
  s.installId = str(raw.installId, null);
  s.firstDate = isDateKey(raw.firstDate) ? raw.firstDate : null;
  s.lastSessionAt = Math.max(0, num(raw.lastSessionAt, 0));
  s.muted = bool(raw.muted, false);
  s.howtoSeen = bool(raw.howtoSeen, false);
  s.coachSeen = bool(raw.coachSeen, false);
  if (plain(raw.display)) s.display = { largeText: raw.display.largeText === true, highContrast: raw.display.highContrast === true };
  const p = raw.pending;
  if (plain(p) && isDateKey(p.dateKey) && isInt(p.idx, 0, 4) && isInt(p.pos, 0, 100)) s.pending = { dateKey: p.dateKey, idx: p.idx, pos: p.pos };
  const vw = raw.viewing;
  if (plain(vw) && isDateKey(vw.dateKey) && isInt(vw.idx, 0, 4)) s.viewing = { dateKey: vw.dateKey, idx: vw.idx };
  s.lifetimeSets = isInt(raw.lifetimeSets, 0, 1e6) ? raw.lifetimeSets : 0;
  if (plain(raw.archivePlays)) {
    Object.keys(raw.archivePlays)
      .filter(isDateKey)
      .slice(0, MAX_ARCHIVE_PLAYS)
      .forEach((k) => {
        const a = raw.archivePlays[k];
        if (plain(a) && isInt(a.total, 0, 500) && Array.isArray(a.positions) && a.positions.length === 5 && a.positions.every((x) => isInt(x, 0, 100))) {
          s.archivePlays[k] = { total: a.total, positions: a.positions.slice(), at: num(a.at, 0) };
        }
      });
  }
  if (Array.isArray(raw.playedItems)) s.playedItems = raw.playedItems.filter((x) => typeof x === 'string' && /^s\d{3}i\d{2}$/.test(x)).slice(-MAX_PLAYED_ITEMS);
  const ac = raw.archiveCache;
  if (plain(ac) && Array.isArray(ac.items)) {
    const items = ac.items.filter((it) => plain(it) && isDateKey(it.dateKey) && isInt(it.issueNo, 1, 1e6)).slice(0, 60);
    s.archiveCache = { items, bestStreak: isInt(ac.bestStreak, 0, 1e5) ? ac.bestStreak : 0, hasMore: ac.hasMore === true, at: num(ac.at, 0) };
  }
  const it = raw.interstitial;
  if (plain(it)) s.interstitial = { day: str(it.day, ''), count: isInt(it.count, 0, 1e5) ? it.count : 0, lastAt: Math.max(0, num(it.lastAt, 0)) };
  const nf = dayBox(raw.adNoFill, { keys: {} });
  if (plain(raw.adNoFill) && plain(raw.adNoFill.keys)) Object.keys(raw.adNoFill.keys).forEach((k) => (nf.keys[k] = raw.adNoFill.keys[k] === true));
  s.adNoFill = nf;
  const bn = dayBox(raw.bonus, { used: 0 });
  if (plain(raw.bonus) && isInt(raw.bonus.used, 0, 1000)) bn.used = raw.bonus.used;
  s.bonus = bn;
  const un = dayBox(raw.unlocks, { keys: {} });
  if (plain(raw.unlocks) && plain(raw.unlocks.keys)) Object.keys(raw.unlocks.keys).filter(isDateKey).forEach((k) => (un.keys[k] = raw.unlocks.keys[k] === true));
  s.unlocks = un;
  const pv = raw.privacy;
  if (plain(pv)) {
    s.privacy.privacy = oneOf(pv.privacy, ['unknown', 'agreed', 'denied'], 'unknown');
    s.privacy.friendScope = oneOf(pv.friendScope, ['unknown', 'granted', 'denied'], 'unknown');
    const mp = pv.markerPending;
    s.privacy.markerDay = isDateKey(pv.markerDay) ? pv.markerDay : '';
    s.privacy.markerPending = plain(mp) && isDateKey(mp.d) && isInt(mp.s, 0, 500) ? { d: mp.d, s: mp.s } : null;
  }
  s.rulesAgreedVersion = isInt(raw.rulesAgreedVersion, 1, 1000) ? raw.rulesAgreedVersion : null;
  const sb = raw.subscribe;
  if (plain(sb)) {
    s.subscribe.banned = sb.banned === true;
    ['granted', 'declined'].forEach((f) => {
      if (plain(sb[f])) Object.keys(sb[f]).slice(0, 200).forEach((k) => /^[A-Z2-7]{8}$/.test(k) && (s.subscribe[f][k] = sb[f][k] === true));
    });
  }
  return s;
}

function createStore(wx) {
  let state = fresh();
  try {
    const raw = wx && wx.getStorageSync ? wx.getStorageSync(KEY) : null;
    if (raw) state = sanitize(typeof raw === 'string' ? JSON.parse(raw) : raw);
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
      state = fresh();
      save();
    },
  };
}

module.exports = { createStore, sanitize, fresh, KEY, MAX_PLAYED_ITEMS };
