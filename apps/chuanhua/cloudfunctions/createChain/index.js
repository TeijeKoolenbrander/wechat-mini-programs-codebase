'use strict';
// createChain: start a chain (spec 3.2, 6.2). Checks rules, restriction, kill switches, image quota, start allowance
// (consumed at 棒 1 submit, not here), the prompt (a preset id must come from the caller's current server roll, F-2; custom text goes through moderation FIRST: a blocked prompt creates
// no chain, AC 40) and binds the group when the caller has a fresh membership for the given groupRef.
const { CONFIG } = require('./core/config');
const chainLib = require('./core/chain');
const allowance = require('./core/allowance');
const strikes = require('./core/strikes');
const prompts = require('./core/prompts');
const text = require('./core/text');
const store = require('./common/store');
const players = require('./common/players');
const groups = require('./common/groups');
const appconfig = require('./common/appconfig');
const modio = require('./common/modio');
const env = require('./common/env');
const ops = require('./common/roomops');
const { bad } = require('./common/errors');
const { now, newChainId, newClaimId } = require('./common/util');

exports.main = store.handler(async (event, { openid }) => {
  env.ugcGuard();
  await store.rateLimit(openid, 'create', 1, 5);
  const p = await players.touch(openid);
  if (p.rulesVersion < CONFIG.rulesVersion) bad('RULES_REQUIRED');
  const r = strikes.restrictionOf(p, now());
  if (r) bad('RESTRICTED', { until: r.until });
  const c = await appconfig.get();
  if (!appconfig.createAllowed(c).ok) bad('UGC_PAUSED');
  const lvl = await modio.imageLevel();
  if (lvl === 'pauseCreate' || lvl === 'failClosed') bad('UGC_BUSY');
  const lim = allowance.checkStart(p, players.dateKey());
  if (lim) bad(lim.code);

  const seated = await ops.playingRoomOf(p);
  if (seated) bad('IN_ROOM'); // a claim and a running game at once is not possible (3A.9)
  const hasId = typeof event.promptId === 'string';
  const hasCustom = typeof event.customText === 'string';
  if (hasId === hasCustom) bad('BAD_REQUEST');
  let prompt;
  if (hasId) {
    // AC 119: only an id from the caller's CURRENT roll (and its rollId) is accepted; the roll is spent by the start
    const ok = await players.mutate(openid, (pl) => {
      const rl = pl.roll;
      const valid = !!rl && rl.ctx === 'chain' && !rl.used && rl.rollId === event.rollId && typeof event.rollId === 'string' && rl.ids.includes(event.promptId);
      return valid ? { player: Object.assign({}, pl, { roll: Object.assign({}, rl, { used: true }) }), result: true } : { player: pl, result: false };
    });
    if (!ok) bad('BAD_REQUEST');
    const pr = prompts.promptById(event.promptId);
    if (!pr || pr.retired) bad('BAD_REQUEST');
    prompt = { id: pr.id, text: pr.text, custom: false };
  } else {
    const v = text.validate(event.customText, 'prompt');
    if (!v.ok) bad('TEXT_REJECTED', { reason: v.reason });
    const m = await modio.checkText({ openid, text: v.text, stepId: null });
    if (!m.ok) bad(m.code);
    prompt = { id: null, text: v.text, custom: true };
  }

  const gOpen = await groups.groupContext(openid, event.groupRef);
  let chain;
  for (let i = 0; i < 3; i++) {
    chain = chainLib.newChain({
      chainId: newChainId(), starter: openid, claimId: newClaimId(), now: now(), dateKey: players.dateKey(), prompt,
      openGId: gOpen, groupRef: gOpen ? event.groupRef : null,
    });
    if (await store.addIfAbsent('chains', chain)) break;
    chain = null;
  }
  if (!chain) bad('INTERNAL');
  await players.mutate(openid, (pl) => Object.assign({}, pl, { claimRef: { chainId: chain._id, claimId: chain.claim.claimId, expiresAt: chain.claim.expiresAt }, roll: pl.roll ? Object.assign({}, pl.roll, { used: true }) : null }));
  await store.writeEvent(openid, 'chain_create', { chainId: chain._id, bound: !!gOpen });
  return {
    ok: true,
    chainId: chain._id,
    serverNow: now(),
    claim: { claimId: chain.claim.claimId, step: 1, kind: 'draw', expiresAt: chain.claim.expiresAt, sourceText: prompt.text, timerSec: c.config.timers.drawSec },
  };
});
