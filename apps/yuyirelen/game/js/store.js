/**
 * Persistent client state (wx storage): first-run flags, display settings, mute, privacy
 * status, ad counters, and a small cache of finished puzzles for the home card.
 * Play state itself lives on the server (spec 18.11), so a kill never loses a ladder.
 */

const KEY = 'yyrl_state_v1';
const MAX_FINISHED = 80;

function fresh() {
  return {
    v: 1,
    installId: null,
    firstDate: null,
    lastSessionAt: 0,
    muted: false,
    howtoSeen: false,
    coachSeen: false,
    lifetimeFinished: 0, // finished puzzles of any kind (interstitial gating)
    display: { largeText: false, highContrast: false },
    dailyCache: null, // last getDaily payload
    finished: {}, // puzzleId -> { outcome, steps, hints, temps, bands, best, kind, issueNo, practiceNo, answer }
    interstitial: { day: '', count: 0, lastAt: 0 },
    privacy: { privacy: 'unknown', friendScope: 'unknown', markerPending: [] },
    markerKeys: [], // dateKeys written to cloud storage (to remove after 7 days)
  };
}

function createStore(wx) {
  let state = fresh();
  try {
    const raw = wx && wx.getStorageSync ? wx.getStorageSync(KEY) : null;
    if (raw) {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (parsed && parsed.v === 1) {
        state = Object.assign(fresh(), parsed);
        state.display = Object.assign(fresh().display, parsed.display || {});
      }
    }
  } catch (e) {
    state = fresh();
  }
  function save() {
    try {
      const keys = Object.keys(state.finished);
      if (keys.length > MAX_FINISHED) for (const k of keys.slice(0, keys.length - MAX_FINISHED)) delete state.finished[k];
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
