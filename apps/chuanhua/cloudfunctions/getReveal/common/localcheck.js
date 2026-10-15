'use strict';
// The local text gate used by createChain (custom prompts) and submitStep (descriptions): the server's
// own rules (common/text.js, with the core blocklist) AND the game core's text.check, so anything the
// client already rejects is rejected here too and a modified client gains nothing. No API call, no strike.
const text = require('./text');
const core = require('./coreapi');
const { LIMITS } = require('./config');

/** @param {*} raw @param {'prompt'|'desc'} kind @returns {{ok:true,text:string}|{ok:false,reason:string}} */
function checkLocalText(raw, kind) {
  const [min, max] = kind === 'prompt' ? [LIMITS.promptMin, LIMITS.promptMax] : [LIMITS.describeMin, LIMITS.describeMax];
  const v = text.validateText(raw, { min, max, blocklist: core.blocklist() });
  if (!v.ok) return v;
  const c = core.coreTextCheck(v.text, kind);
  return c.ok ? v : { ok: false, reason: `core:${c.reason}` };
}

module.exports = { checkLocalText };
