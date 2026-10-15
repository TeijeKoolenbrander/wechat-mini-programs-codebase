'use strict';
// createChain (spec 3.2, 4.3, 6.2): creates the chain and gives the starter an immediate claim on 第 1 棒.
// The start is only CONSUMED when 第 1 棒 is submitted (submitStep). A custom prompt is moderated
// BEFORE anything is created: a blocked prompt creates no chain (AC 40).
const store = require('./common/store');
const chainLib = require('./common/chain');
const players = require('./common/players');
const moderation = require('./common/moderation');
const lifecycle = require('./common/lifecycle');
const core = require('./common/coreapi');
const input = require('./common/input');
const groups = require('./common/groups');
const { checkLocalText } = require('./common/localcheck');
const { ugcContext } = require('./common/guard');
const { fail, newChainId, newClaimId, randomBase32 } = require('./common/util');

exports.main = store.handler(async (event, { openid }) => {
  const { nowMs, dateKey } = await ugcContext({ create: true });
  await store.rateLimit(openid, 'create', 1, 6);

  const hasPreset = event.promptId !== undefined && event.promptId !== null;
  const hasCustom = event.customText !== undefined && event.customText !== null;
  if (hasPreset === hasCustom) fail('BAD_INPUT', 'exactly one of promptId or customText');
  const groupRef = input.optGroupRef(event.groupRef);

  const p = await players.loadPlayer(openid, nowMs);
  players.assertMayParticipate(p, nowMs);
  if (players.startsLeft(p, dateKey) < 1) fail('START_LIMIT', 'no starts left today');
  await moderation.assertImageCapacity({ forCreate: true });

  let promptId = null;
  let promptText;
  let custom = false;
  if (hasPreset) {
    const pr = core.promptById(input.promptId(event.promptId));
    if (!pr) fail('BAD_INPUT', 'unknown prompt');
    promptId = pr.id;
    promptText = pr.text;
  } else {
    custom = true;
    const v = checkLocalText(event.customText, 'prompt');
    if (!v.ok) fail('TEXT_REJECTED', 'rejected locally'); // no API call, no strike (AC 34/35)
    const chk = await moderation.checkText(openid, v.text); // throws MODERATION_BUSY
    await moderation.writeModLog({
      stepId: `prompt_${randomBase32(8)}`, author: openid, kind: 'text', textCopy: v.text, suggest: chk.suggest, label: chk.label, source: chk.source,
    });
    if (chk.suggest !== 'pass') {
      if (chk.suggest === 'risky') await lifecycle.strikePlayer(openid, `prompt_${nowMs}`, 'verdict', nowMs);
      await store.writeEvent(openid, 'custom_prompt_result', { result: chk.suggest });
      fail('TEXT_BLOCKED', 'prompt not accepted');
    }
    promptText = v.text;
  }

  const openGId = groupRef ? await groups.resolveGroupRef(openid, groupRef, dateKey) : null;
  let chainId;
  let chain;
  for (let i = 0; i < 4; i++) {
    chainId = newChainId();
    chain = chainLib.newChain({
      id: chainId, starter: openid, openGId, groupRef: openGId ? groupRef : null,
      promptId, promptText, custom, nowMs, dateKey, claimId: newClaimId(),
    });
    if (await store.addIfAbsent('chains', chain)) break;
    chain = null;
  }
  if (!chain) fail('INTERNAL', 'could not allocate a chain id');
  await store.writeEvent(openid, 'chain_create', { bound: !!openGId });
  return {
    ok: true,
    chainId,
    bound: !!openGId,
    claim: { claimId: chain.claim.claimId, step: 1, kind: 'draw', expiresAt: chain.claim.expiresAt, sourceText: promptText },
  };
});
