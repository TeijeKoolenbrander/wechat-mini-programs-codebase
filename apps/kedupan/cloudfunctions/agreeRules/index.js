'use strict';
// agreeRules: record that the player agreed to the current 发言规则 version (spec 6.12, 11.2, AC 85). Identity from the
// context only. The version must equal CONFIG.ugc.rulesVersion (INVALID_INPUT otherwise). Idempotent: an agreement at the
// current version is kept as it is (rulesAt is the FIRST agreement). Stored in player_stats (created on first need).
const store = require('./common/store');
const { fail, now } = require('./common/util');
const { core, rateOf } = require('./common/coreapi');
const players = require('./common/players');

exports.main = store.handler(async (event, { openid }) => {
  const v = core.V.agreeRules(event);
  if (!v.ok) fail('INVALID_INPUT', 'invalid input');
  const changed = await players.mutate(openid, (p) => {
    const r = core.U.agreeRules(p, openid, now());
    return { player: r.player, result: r.changed };
  });
  return { ok: true, rulesVersion: v.v.rulesVersion, changed };
}, { rate: rateOf('agreeRules') });
