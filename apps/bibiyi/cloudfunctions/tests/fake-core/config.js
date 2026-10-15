'use strict';
// TEST DOUBLE of core/config.js (bands, model, gates, ads, boardListCap...). Versioned by configVersion.
const CONFIG = {
  configVersion: 1,
  gateVersion: 1,
  boardListCap: 3000,
  bands: {
    ratio: [[1, 5, 2.0, 1e9], [6, 12, 1.5, 4.0], [13, 20, 1.25, 2.5], [21, 30, 0, 1.8], [31, 60, 0, 1.4]],
    year: [[1, 5, 400, 1e9], [6, 12, 150, 800], [13, 20, 80, 400], [21, 30, 40, 200], [31, 60, 30, 120]],
  },
  model: {
    pMin: 0.5,
    pMax: 0.96,
    scales: {
      city_pop: 0.35, prov_pop: 0.35, mountain: 0.2, river: 0.3, lake: 0.45, year: 1.5, animal_weight: 0.6,
      animal_life: 0.6, space_diameter: 0.5, structure_len: 0.4, structure_height: 0.4, food_kcal: 0.5, distance: 0.25,
    },
  },
  gates: { median: [6, 12], p20: [0.02, 0.15], p40Max: 0.005 },
  daily: { repeatWindowDays: 3, maxCandidates: 500 },
  ads: { interstitial: { enabled: true, everyNRuns: 3, minLifetimeRuns: 4, minGapSec: 120, maxPerDay: 5 } },
};
module.exports = {
  LATEST_CONFIG_VERSION: 1,
  getConfig: (v) => (v === 1 ? CONFIG : null),
};
