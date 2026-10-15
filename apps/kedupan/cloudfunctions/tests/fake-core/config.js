'use strict';
// TEST DOUBLE of apps/kedupan/game/core/config.js (assumed shape; see common/coreapi.js).
const CONFIG = {
  score: { priorVotes: 10, agreeMin: 30, agreeRadius: 10 },
  boardListCap: 3000,
  groupRowCap: 500,
};
function getConfig() {
  return CONFIG;
}
module.exports = { getConfig, CONFIG };
