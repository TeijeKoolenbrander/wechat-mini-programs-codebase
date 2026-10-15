/**
 * Persistent client state (wx storage): settings, first-run flags, the in-progress turn (so a kill resumes,
 * spec 17.21), the last album list (offline read-only), ad counters, subscribe refusals.
 * Everything here is non-sensitive; drawings are kept only until the turn ends.
 */

const KEY = 'chuanhua_state_v1';

function fresh() {
  return {
    v: 1,
    installId: null,
    firstDate: null,
    lastSessionAt: 0,
    muted: false,
    largeText: false,
    highContrast: false,
    howtoSeen: false,
    coachSeen: false, // first-ever draw turn coach line
    sentExplainerSeen: false, // first 已传出 explanation
    rulesVersion: 0, // last agreed 接龙公约 version (the server is the truth; this only avoids a flash)
    lifetimeReveals: 0,
    seenReveals: {}, // chainId -> true (opened at least once, for auto-play-once)
    turn: null, // { chainId, claimId, step, kind, startedAt, expiresAt, source, strokes (compact), text, undoCount }
    homeCache: null, // last getHome (for offline display)
    albumCache: null, // { at, items }
    paletteDay: '', // Beijing dateKey on which 今日彩笔 was unlocked
    interstitial: { day: '', count: 0, lastAt: 0 },
    noFillGranted: {}, // `${dateKey}|${placement}` -> true
    subscribe: { declined: {}, bannedDevice: false },
  };
}

function createStore(wx) {
  let state = fresh();
  try {
    const raw = wx && wx.getStorageSync ? wx.getStorageSync(KEY) : null;
    if (raw) {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (parsed && parsed.v === 1) state = Object.assign(fresh(), parsed);
    }
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

module.exports = { createStore, KEY };
