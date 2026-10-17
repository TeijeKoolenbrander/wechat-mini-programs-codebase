'use strict';
// createRound: a host starts a draft round on a spectrum (spec 11.2, AC 26, 35). The hidden target is drawn from
// crypto randomness (core drawTarget) and is returned to the host only.
// D-2: the response carries the host's typed-clue state, `ugc`, which drives the clue step (spec 6.5): the kill switch,
// the 发言规则 agreement, a restriction, and the one-time strike warning (read once: this call clears it).
const store = require('./common/store');
const { fail, now, newRoundId, newSalt, randomFloat } = require('./common/util');
const { core, CONFIG, content, dateKeyAt, rateOf } = require('./common/coreapi');
const groups = require('./common/groups');
const players = require('./common/players');

/** the host's typed-clue state; a pending warning is consumed here (one transaction, so two calls never both show it) */
async function ugcState(openid) {
  const fl = await groups.ugcFlags();
  const nowMs = now();
  const pv = core.U.playerView(await players.read(openid), nowMs);
  let warnPending = pv.warnPending;
  if (warnPending) {
    warnPending = await players.mutate(openid, (p) => ({ player: { ...p, warnPending: false, updatedAt: nowMs }, result: p.warnPending === true }));
  }
  return {
    createEnabled: fl.createEnabled,
    rulesVersion: pv.rulesVersion,
    rulesRequiredVersion: CONFIG.ugc.rulesVersion,
    rulesAgreed: pv.rulesAgreed,
    restriction: pv.restriction ? { until: pv.restriction.until, permanent: pv.restriction.permanent } : null,
    warnPending,
  };
}

exports.main = store.handler(async (event, { openid }) => {
  const v = core.V.createRound(event);
  if (!v.ok) fail('INVALID_INPUT', 'invalid input');
  const c = content();
  const sp = c.spectrumById[v.v.spectrumId];
  if (!sp) fail('INVALID_INPUT', 'unknown spectrum');
  await store.dayLimit(openid, 'createRound', CONFIG.limits.createRoundPerDay, dateKeyAt(now()));
  const target = core.R.drawTarget(randomFloat());
  for (let attempt = 0; attempt < 5; attempt++) {
    const roundId = newRoundId();
    const doc = core.SV.newRound({ roundId, hostOpenid: openid, spectrum: sp, target, salt: newSalt(), nowMs: now(), contentVersion: c.contentVersion });
    if (await store.addIfAbsent('rounds', doc)) return { ok: true, roundId, target, left: sp.left, right: sp.right, ugc: await ugcState(openid) };
  }
  fail('INTERNAL', 'could not allocate a round id');
}, { rate: rateOf('createRound') });
