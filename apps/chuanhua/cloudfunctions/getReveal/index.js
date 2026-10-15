'use strict';
// getReveal (spec 3.7, 8.8, 8.9, AC 80-82): full content ONLY for participants (starter + authors of
// passed 棒) of a revealed chain. Everyone else in the chain's group gets NOT_PARTICIPANT plus the
// teaser fields (prompt text, final sentence, count): both are already-moderated text.
// Hidden/deleted 棒 and the viewEnabled kill switch produce placeholders, never content.
const store = require('./common/store');
const cfgLib = require('./common/config');
const chainLib = require('./common/chain');
const groups = require('./common/groups');
const input = require('./common/input');
const { fail, now, dateKeyAt, kindOfStep, CHAIN_LENGTH } = require('./common/util');

const NATIONAL_MIN = 30;

async function loadSteps(chain) {
  const out = {};
  for (let n = 1; n <= CHAIN_LENGTH; n++) {
    if (chain.stepIds[n]) out[n] = await store.getDoc('steps', chain.stepIds[n]);
  }
  return out;
}
function placeholderOf(step, viewOk) {
  if (!viewOk) return 'paused';
  if (!step) return 'reported';
  if (step.state === 'hidden') return 'reported';
  if (step.state === 'deleted') return 'deleted';
  if (step.state !== 'passed') return 'reported';
  return null;
}

exports.main = store.handler(async (event, { openid }) => {
  const chainId = input.chainId(event.chainId);
  const nowMs = now();
  const dateKey = dateKeyAt(nowMs);
  const cfg = await cfgLib.getConfig();
  const ugc = cfgLib.ugcState(cfg, nowMs);
  const chain = await store.getDoc('chains', chainId);
  if (!chain || chain.state === 'abandoned') fail('CHAIN_NOT_FOUND', 'chain not found');
  if (chain.state === 'removed') fail('CHAIN_REMOVED', 'chain removed');
  if (chain.hidden) fail('CHAIN_HIDDEN', 'chain hidden');
  if (chain.state !== 'revealed') fail('NOT_REVEALED', 'not revealed yet');

  const steps = await loadSteps(chain);
  const participant = chainLib.isParticipant(chain, openid);
  const canSameAgain = !chain.custom && !!chain.promptId;

  if (!participant) {
    // teaser: only for members of the chain's group (PO-7); texts only, never drawings
    if (!(await groups.isFreshMember(openid, chain.openGId, dateKey))) fail('NOT_MEMBER', 'not a member of the chain group');
    let finalText = null;
    for (let n = CHAIN_LENGTH; n >= 2 && finalText === null; n -= 2) {
      const s = steps[n];
      if (s && s.state === 'passed' && kindOfStep(n) === 'describe') finalText = s.text;
    }
    fail('NOT_PARTICIPANT', 'full reveal is for participants only', {
      teaser: {
        promptText: ugc.viewOk ? chain.promptText : null,
        finalText: ugc.viewOk ? finalText : null,
        passed: chain.passed,
        canSameAgain,
        paused: !ugc.viewOk,
      },
    });
  }

  const mine = await store.db().collection('reactions').where({ chainId, openid }).limit(100).get();
  const myLaughs = new Set(mine.data.map((r) => r.stepId));
  const list = [];
  for (let n = 1; n <= chain.passed; n++) {
    const s = steps[n];
    const placeholder = placeholderOf(s, ugc.viewOk);
    const item = { n, kind: kindOfStep(n), mine: chain.authors[n] === openid, placeholder, laughs: 0, myLaugh: false, canReport: false };
    if (!placeholder) {
      if (item.kind === 'draw') item.strokes = s.strokes; else item.text = s.text;
      item.laughs = s.laughs || 0;
      item.myLaugh = myLaughs.has(s._id);
      item.canReport = !item.mine;
    }
    list.push(item);
  }
  let national = null;
  if (!chain.custom && chain.promptId) {
    const st = await store.getDoc('daily_stats', dateKey);
    const c = st && st.byPrompt ? st.byPrompt[chain.promptId] || 0 : 0;
    national = c >= NATIONAL_MIN ? c : null;
  }
  // remember the reveal as seen for the 我的接龙 dot (best effort)
  try {
    const me = await store.getDoc('players', openid);
    if (me && !(me.seen || []).includes(chainId)) {
      await store.db().collection('players').doc(openid).update({ data: { seen: [...(me.seen || []), chainId].slice(-100) } });
    }
  } catch (e) { /* best effort */ }
  return {
    ok: true,
    state: ugc.viewOk ? 'ready' : 'paused',
    chainId,
    early: chain.revealReason !== 'complete',
    passed: chain.passed,
    participantCount: chain.participants.length,
    durationMin: Math.max(0, Math.round(((chain.revealedAt || nowMs) - chain.createdAt) / 60000)),
    prompt: { text: ugc.viewOk ? chain.promptText : null, custom: chain.custom },
    steps: list,
    nationalCount: national,
    canSameAgain,
  };
});
