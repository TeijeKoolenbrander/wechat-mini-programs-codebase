'use strict';
// getChain: the chain-entry screen (spec 8.7). NEVER returns the prompt, any 棒 text or strokes
// (AC 10): only counts, kinds and states. Content flows only through claimStep and getReveal.
const store = require('./common/store');
const cfgLib = require('./common/config');
const chainLib = require('./common/chain');
const players = require('./common/players');
const groups = require('./common/groups');
const activity = require('./common/activity');
const input = require('./common/input');
const { LIMITS } = cfgLib;
const { now, dateKeyAt, kindOfStep, CHAIN_LENGTH } = require('./common/util');

function entry(state, chain, extra) {
  return {
    ok: true,
    state,
    passed: chain ? chain.passed : 0,
    length: CHAIN_LENGTH,
    nextStep: chain && chain.nextStep ? chain.nextStep : null,
    nextKind: chain && chain.nextStep ? kindOfStep(chain.nextStep) : null,
    ...extra,
  };
}

exports.main = store.handler(async (event, { openid }) => {
  const chainId = input.chainId(event.chainId);
  const groupRef = input.optGroupRef(event.groupRef);
  const nowMs = now();
  const dateKey = dateKeyAt(nowMs);
  const chain = await store.getDoc('chains', chainId);
  if (!chain || chain.state === 'abandoned') return entry('notFound', null);

  const isParticipant = chainLib.isParticipant(chain, openid);
  const isStarter = chain.starter === openid;
  const base = {
    isParticipant,
    isStarter,
    timeLeftMs: Math.max(0, chain.expiresAt - nowMs),
    canSameAgain: !chain.custom && !!chain.promptId && !chain.hidden && ['revealed', 'expired'].includes(chain.state),
  };
  if (chain.state === 'removed' || chain.hidden) return entry('removed', null, { ...base, canSameAgain: false });
  if (chain.state === 'revealed') return entry(isParticipant ? 'revealedParticipant' : 'revealedTeaser', chain, base);
  if (chain.state === 'expired') return entry('expired', chain, base);

  const cfg = await cfgLib.getConfig();
  const ugc = cfgLib.ugcState(cfg, nowMs);
  const player = await players.loadPlayer(openid, nowMs);
  players.dayOf(player, dateKey);
  const ctxOpenGId = await groups.resolveGroupRef(openid, groupRef, dateKey);
  const member = await groups.isFreshMember(openid, chain.openGId, dateKey);
  const ev = chainLib.evaluateClaim({
    chain, player, openid, nowMs, ugc, group: { memberOfChainGroup: member, ctxOpenGId }, restricted: players.restriction(player, nowMs),
  });
  let state;
  const extra = { ...base };
  if (ev.ok) state = 'claimable';
  else if (ev.code === 'CHAIN_CLOSED') state = 'notFound';
  else state = chainLib.ENTRY_STATE[ev.code] || 'error';
  if (!ev.ok && ev.code === 'RESTRICTED') extra.restrictedUntil = ev.extra.until;
  if (state === 'taken') extra.takenEtaSec = Math.max(1, Math.ceil((chain.claim.expiresAt - nowMs) / 1000));
  extra.canRevealNow = isStarter && chainLib.canRevealNow(chain, openid, nowMs).ok;
  const sub = await store.getDoc('sub_grants', `${chainId}_${openid}`);
  extra.subscribed = !!sub;
  if (event.wantActivity === true && isParticipant && !chain.hidden) {
    const id = await activity.ensureActivity(chain);
    if (id) extra.activityId = id;
  }
  extra.rulesRequired = (player.rulesVersion || 0) < LIMITS.rulesVersion;
  return entry(state, chain, extra);
});
