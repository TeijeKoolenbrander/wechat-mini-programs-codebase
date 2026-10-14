'use strict';
// TEST DOUBLE of game/core/config.js
module.exports = {
  CONTENT_VERSION: 1,
  CONFIG_VERSION: 1,
  GATE_VERSION: 1,
  getConfig() { return { boardListCap: global.__DJ_BOARD_CAP || 3000 }; },
};
