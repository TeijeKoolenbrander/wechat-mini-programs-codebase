/**
 * Persistent client state (wx storage). Everything that must survive a kill: today's progress,
 * the pending (unsent) card, archive results, interstitial counters, display settings, flags.
 * Nothing here is trusted by the server (spec 11.5): it is a cache and a few local-only records.
 */

const KEY = 'kd_state_v1';

function fresh() {
  return {
    v: 1,
    installId: null,
    firstDate: null,
    lastSessionAt: 0,
    muted: false,
    howtoSeen: false,
    coachSeen: false,
    largeText: false,
    highContrast: false,
    lifetimeSets: 0, // completed sets, daily or archive (interstitial gate)
    daily: null, // { dateKey, issueNo, cards[5], pos[5], answered, complete, total, refs[5], divisiveIdx, yesterday, streak, offsetMs }
    pending: null, // { dateKey, idx, pos } a card confirmed while offline
    archive: { results: {}, page: null }, // results[dateKey] = { total, positions[5], finals[5] }; page = cached first page
    bonus: { day: '', used: 0 },
    dist: {}, // dateKey -> { hist: [5][21] } unlocked 全国分布
    adFail: { day: '', placements: {} }, // no-fill grants already used today
    interstitial: { day: '', count: 0, lastAt: 0 },
    subscribeBanned: false,
    subscribedRounds: {},
    markerDay: null,
    features: null,
    privacy: { privacy: 'unknown', friendScope: 'unknown', markerPending: null },
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

module.exports = { createStore, KEY, fresh };
