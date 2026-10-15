'use strict';
// getGroupChains (spec 8.10, AC 98): the current group's waiting / in-progress / recently revealed
// chains plus aggregate stats. Membership is checked server-side (the groupRef alone proves nothing).
// No per-person data, no drawings; revealed rows carry the already-moderated prompt and final text.
const store = require('./common/store');
const cfgLib = require('./common/config');
const chainLib = require('./common/chain');
const players = require('./common/players');
const groups = require('./common/groups');
const input = require('./common/input');
const { fail, now, dateKeyAt, kindOfStep, CHAIN_LENGTH } = require('./common/util');

const REASON = {
  PENDING: 'pending', TAKEN: 'taken', PREV_MINE: 'prevMine', CAP_REACHED: 'cap', STEP_LIMIT: 'limit',
  CLAIM_LIMIT: 'limit', RESTRICTED: 'restricted', RULES_REQUIRED: 'rules', UGC_PAUSED: 'paused', CHAIN_CLOSED: 'closed',
  NEED_GROUP: 'group', WRONG_GROUP: 'group',
};

exports.main = store.handler(async (event, { openid }) => {
  const groupRef = input.groupRef(event.groupRef);
  const nowMs = now();
  const dateKey = dateKeyAt(nowMs);
  const openGId = await groups.resolveGroupRef(openid, groupRef, dateKey);
  if (!openGId) fail('NOT_MEMBER', 'not a member of this group');

  const cfg = await cfgLib.getConfig();
  const ugc = cfgLib.ugcState(cfg, nowMs);
  const player = await players.loadPlayer(openid, nowMs);
  players.dayOf(player, dateKey);
  const restricted = players.restriction(player, nowMs);
  const _ = store._();

  const live = await store.db().collection('chains').where({ openGId, state: _.in(['open', 'pending']) })
    .orderBy('lastActivityAt', 'desc').limit(50).get();
  const waiting = [];
  const inProgress = [];
  for (const c of live.data) {
    if (c.hidden || c.passed < 1) continue;
    const ev = chainLib.evaluateClaim({ chain: c, player, openid, nowMs, ugc, group: { memberOfChainGroup: true, ctxOpenGId: openGId }, restricted });
    const base = { chainId: c._id, passed: c.passed, length: CHAIN_LENGTH };
    if (ev.ok) waiting.push({ ...base, nextStep: ev.step, nextKind: kindOfStep(ev.step) });
    else inProgress.push({ ...base, nextStep: c.nextStep, nextKind: c.nextStep ? kindOfStep(c.nextStep) : null, reason: REASON[ev.code] || 'closed' });
  }

  const rv = await store.db().collection('chains').where({ openGId, state: 'revealed' }).orderBy('revealedAt', 'desc').limit(20).get();
  const revealed = [];
  for (const c of rv.data) {
    if (c.hidden) continue;
    let finalText = null;
    for (let n = CHAIN_LENGTH; n >= 2 && finalText === null; n -= 2) {
      const sid = c.stepIds[n];
      const s = sid ? await store.getDoc('steps', sid) : null;
      if (s && s.state === 'passed') finalText = s.text;
    }
    revealed.push({
      chainId: c._id,
      participant: chainLib.isParticipant(c, openid),
      passed: c.passed,
      promptText: ugc.viewOk ? c.promptText : null,
      finalText: ugc.viewOk ? finalText : null,
    });
  }
  const gs = (await store.getDoc('group_stats', openGId)) || {};
  return {
    ok: true,
    stats: { revealed: gs.revealed || 0, drawings: gs.drawings || 0 },
    waiting,
    inProgress,
    revealed,
    ugc: { createEnabled: ugc.createOk, viewEnabled: ugc.viewOk },
  };
});
