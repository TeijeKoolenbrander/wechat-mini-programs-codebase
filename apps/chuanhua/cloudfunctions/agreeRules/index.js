'use strict';
// agreeRules: record that the player agreed to the current 接龙公约 version (spec 8.2).
const { CONFIG } = require('./core/config');
const store = require('./common/store');
const players = require('./common/players');
const { bad } = require('./common/errors');

exports.main = store.handler(async (event, { openid }) => {
  await store.rateLimit(openid, 'rules', 1, 20);
  if (event.version !== CONFIG.rulesVersion) bad('BAD_REQUEST');
  await players.mutate(openid, (p) => Object.assign({}, p, { rulesVersion: event.version }));
  await store.writeEvent(openid, 'rules_agree', { version: event.version });
  return { ok: true };
});
