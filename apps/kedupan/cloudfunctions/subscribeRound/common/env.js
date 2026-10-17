'use strict';
// Environment gate for typed clues (spec 11.6, AC 90). ENV_KIND / MODERATION_MODE are read ONLY here.
// Copied from 传画接龙 common/env.js (text half).
const { core, CONFIG } = require('./coreapi');
const { fail } = require('./util');

function envState() {
  return core.MOD.resolveEnv({ envKind: process.env.ENV_KIND, mode: process.env.MODERATION_MODE });
}

/**
 * Every typed-clue call runs this before any WeChat call. A configuration the moderation rules do not allow (mock in
 * production, an unknown mode) refuses the call with SERVER_CONFIG and logs [ALERT]: fail closed, never a silent fallback.
 * Unset ENV_KIND means prod (safe); unset MODERATION_MODE means live.
 * @returns {{ok:true, envKind:string, mode:string}}
 */
function ugcGuard() {
  const e = envState();
  if (!e.ok) {
    console.error(e.alert);
    fail('SERVER_CONFIG', 'moderation configuration');
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
const mockSyncDelayMs = () => intEnv('MOCK_SYNC_DELAY_MS', CONFIG.moderation.mockSyncDelayMs, 0, 20000);

/** comma/space separated allow-list of admin openids (ADMIN_OPENIDS); empty = nobody with an OPENID */
function adminOpenids() {
  return String(process.env.ADMIN_OPENIDS || '').split(/[\s,;]+/).filter(Boolean);
}

module.exports = { envState, ugcGuard, textDailyBudget, mockSyncDelayMs, adminOpenids };
