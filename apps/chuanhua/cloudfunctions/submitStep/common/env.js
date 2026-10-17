'use strict';
// Environment gate (spec 6.6, AC 51, 52). ENV_KIND / MODERATION_MODE are read ONLY here.
const mod = require('../core/moderation');
const { CONFIG } = require('../core/config');
const { bad } = require('./errors');

function envState() {
  return mod.resolveEnv({ envKind: process.env.ENV_KIND, mode: process.env.MODERATION_MODE });
}

/**
 * Every UGC function runs this first. A configuration the moderation rules do not allow (mock in production, an unknown
 * mode) refuses the call with SERVER_CONFIG and logs [ALERT]: fail closed, never a silent fallback.
 * @returns {{ok:true, envKind:string, mode:string}}
 */
function ugcGuard() {
  const e = envState();
  if (!e.ok) {
    console.error(e.alert);
    bad('SERVER_CONFIG');
  }
  return e;
}

function intEnv(name, dflt, min, max) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return dflt;
  const n = Number(raw);
  return Number.isInteger(n) && n >= min && n <= max ? n : dflt;
}
const textDailyBudget = () => intEnv('MOD_TEXT_DAILY_BUDGET', CONFIG.moderation.devTextDailyBudget, 0, 100000);
const imageDailyBudget = () => intEnv('MOD_IMAGE_DAILY_BUDGET', CONFIG.moderation.devImageDailyBudget, 0, 10000000);
const mockSyncDelayMs = () => intEnv('MOCK_SYNC_DELAY_MS', CONFIG.moderation.mockSyncDelayMs, 0, 20000);
const mockMediaDelayMs = () => intEnv('MOCK_MEDIA_DELAY_SEC', CONFIG.moderation.mockMediaDelaySec, 0, 86400) * 1000;

/** comma/space separated allow-list of admin openids (ADMIN_OPENIDS); empty = nobody with an OPENID */
function adminOpenids() {
  return String(process.env.ADMIN_OPENIDS || '').split(/[\s,;]+/).filter(Boolean);
}

module.exports = { envState, ugcGuard, textDailyBudget, imageDailyBudget, mockSyncDelayMs, mockMediaDelayMs, adminOpenids };
