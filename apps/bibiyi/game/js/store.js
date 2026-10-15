/**
 * Persistent client state (wx storage). Everything that must survive a kill:
 * the in-progress run (spec 6.3 resume, AC 8, 26), submits waiting for the
 * network, stored results, interstitial counters, settings, first-run flags,
 * privacy status. No fact values of future questions are ever stored.
 */

const KEY = 'bby_state_v1';

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
    coachSeen: false,
    lifetimeRuns: 0, // completed runs, any mode
    freeGroup: 'all', // category chip (spec 6.14)
    bestFree: 0, // local best, merged with the server's
    dailyCache: null, // { dateKey, issueNo, themeLabel, myStatus, myRun, myResult, myDays, bests }
    active: null, // the in-progress run, see controller.persistActive
    pendingSubmits: [], // finished free runs waiting for submitRun
    results: {}, // stored result view by dateKey (daily) / challenge id
    reported: {}, // factId -> reason keys the player reported
    interstitial: { day: '', count: 0, lastAt: 0 },
    privacy: { privacy: 'unknown', friendScope: 'unknown', markerPending: [] },
    markerKeys: [], // dateKeys written to cloud storage (to remove after 7 days)
    notes: { finalizedSeen: {} }, // dateKey -> true once the "finalized by window" note was shown
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
