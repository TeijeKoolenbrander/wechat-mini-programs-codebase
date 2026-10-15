'use strict';
// Shared by the client-contract tests: the game wired to the REAL cloud functions, and a text sanity check.
const assert = require('node:assert/strict');

/**
 * A `cloud` function for the game's test harness: wx.cloud.callFunction -> the backend harness `h`, as `who.id`.
 * The platform's cloudID decryption is emulated by the game harness (wx.cloud.CloudID returns {cloudID, data}).
 */
function wire(h, who) {
  const calls = [];
  const cloud = async (name, data) => {
    const r = await h.call(name, data, { openid: who.id });
    calls.push({ name, data, who: who.id, res: JSON.parse(JSON.stringify(r)) });
    return r;
  };
  return { cloud, calls };
}

const BAD_TEXT = /undefined|\bnull\b|NaN|\[object|Infinity/;

/** every string the renderer drew in the current frame is free of undefined / null / NaN / [object */
function assertCleanText(g, where) {
  g.frame();
  const bad = g.log.text.filter((s) => BAD_TEXT.test(s));
  assert.deepEqual(bad, [], 'bad text on ' + where);
}

module.exports = { wire, assertCleanText, BAD_TEXT };
