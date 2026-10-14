'use strict';
// TEST DOUBLE of core/gates.js. Tests steer it with globals:
//   global.__DJ_GATES = (seed) => boolean         default: seed is even
//   global.__DJ_GATES_REACH12 = (seed) => boolean whether optimal reaches 12-0 (default true)
//   global.__DJ_GATES_LOG = []                    every candidate seed is pushed here
// (a test can advance its mocked clock inside __DJ_GATES to exercise the 70% time cut-off)
function acceptDailySeed(seed) {
  if (global.__DJ_GATES_LOG) global.__DJ_GATES_LOG.push(seed);
  const accept = global.__DJ_GATES ? !!global.__DJ_GATES(seed) : seed % 2 === 0;
  const reaches12 = global.__DJ_GATES_REACH12 ? !!global.__DJ_GATES_REACH12(seed) : true;
  return {
    ok: accept,
    gates: {
      optimal: { w: reaches12 ? 12 : 9, l: reaches12 ? 0 : 3 },
      greedyRate: 0.02, randomRate: 0, K: 400, gateVersion: 1, relaxed: false,
    },
  };
}
module.exports = { acceptDailySeed };
