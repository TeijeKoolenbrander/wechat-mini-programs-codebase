'use strict';
// Error helpers: the player-facing message always comes from core/codes.js (same text as the mock server).
const { textFor } = require('../core/codes');
const { AppError } = require('./util');

/** throw a coded error; the handler turns it into {ok:false, code, message, ...extra} */
function bad(code, extra) {
  throw new AppError(code, textFor(code), extra || null);
}
/** the same as a plain response object (for code paths that return instead of throw) */
function errResp(code, extra) {
  return Object.assign({ ok: false, code, message: textFor(code) }, extra || {});
}

module.exports = { bad, errResp };
