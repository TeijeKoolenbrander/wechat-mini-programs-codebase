'use strict';
// Preamble for every UGC-touching function: environment guard (mock never in prod), remote config,
// kill switches. Returns what the handler needs.
const cfgLib = require('./config');
const { fail, now, dateKeyAt } = require('./util');

/**
 * @param {{create?:boolean}} o create:true -> UGC_PAUSED when creation is off (switch or breaker).
 */
async function ugcContext({ create = true } = {}) {
  const env = cfgLib.moderationEnv();
  const cfg = await cfgLib.getConfig();
  const ugc = cfgLib.ugcState(cfg);
  if (create && !ugc.createOk) fail('UGC_PAUSED', 'ugc paused');
  const nowMs = now();
  return { env, cfg, ugc, nowMs, dateKey: dateKeyAt(nowMs) };
}

module.exports = { ugcContext };
