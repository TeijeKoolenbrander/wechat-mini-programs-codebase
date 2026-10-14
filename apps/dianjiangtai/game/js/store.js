/**
 * Persistent client state (wx storage). Everything that must survive a kill:
 * in-progress runs (spec 18.2, AC 25), pending daily submits, stored results
 * (18.13), interstitial counters, mute, first-run flags, privacy status.
 */

const KEY = 'djt_state_v1';

function fresh() {
  return {
    v: 1,
    installId: null,
    firstDate: null,
    lastSessionAt: 0,
    muted: false,
    howtoSeen: false,
    coachSeen: false,
    lifetimeRuns: 0,
    dailyCache: null, // { dateKey, issueNo, rounds, offsetMs, myStatus, myRecord }
    active: null, // in-progress run, see controller
    pending: null, // finished daily/challenge awaiting submit
    results: {}, // dailyResult by dateKey: stored submit response + lineup
    lastResult: null, // result shown last (so a kill during the reveal shows the verdict)
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
