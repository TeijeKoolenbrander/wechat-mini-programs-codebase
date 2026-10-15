'use strict';
// getMyChains (spec 8.11): the album. List mode pages chains the caller started or authored a 棒 in;
// detail mode ({chainId}) returns ONLY the caller's own 棒 of that chain (open/expired), with their
// moderation state (pending 审核中, blocked, void) visible to the author alone.
// Responses carry chain ids and the caller's own content only; no openids.
const store = require('./common/store');
const players = require('./common/players');
const input = require('./common/input');
const { fail, now, dateKeyAt, kindOfStep } = require('./common/util');

const PAGE = 20;

/** The prompt is shown only where the viewer already knows it: participants of a revealed chain, the starter of an expired one. */
function promptView(c, status, openid) {
  const participant = c.participants.includes(openid);
  const show = !c.hidden && ((status === 'revealed' && participant) || (status === 'expired' && c.starter === openid));
  return { promptText: show ? c.promptText : null, promptId: show && c.promptId && !c.custom ? c.promptId : null };
}

function modState(s) {
  return { passed: 'passed', pending: 'pending', blocked: 'blocked', void: 'void', hidden: 'hidden', deleted: 'deleted' }[s.state] || s.state;
}

exports.main = store.handler(async (event, { openid }) => {
  const nowMs = now();
  const dateKey = dateKeyAt(nowMs);
  const player = await players.loadPlayer(openid, nowMs);

  if (event.chainId !== undefined) {
    const chainId = input.chainId(event.chainId);
    const chain = await store.getDoc('chains', chainId);
    if (!chain || !chain.involved.includes(openid)) fail('CHAIN_NOT_FOUND', 'chain not found');
    const r = await store.db().collection('steps').where({ chainId, author: openid }).orderBy('createdAt', 'asc').limit(50).get();
    const mine = r.data.map((s) => ({
      n: s.n,
      kind: kindOfStep(s.n),
      modState: modState(s),
      strokes: s.kind === 'draw' && ['passed', 'pending', 'blocked'].includes(s.state) ? s.strokes : undefined,
      text: s.kind === 'describe' && s.state === 'passed' ? s.text : undefined,
      canDelete: s.state === 'passed',
    }));
    const status = chain.state === 'removed' || chain.hidden ? 'removed' : chain.state;
    const blocked = mine.filter((m) => m.modState === 'blocked' && m.n >= chain.nextStep)[0];
    return {
      ok: true,
      items: [{
        chainId, status, passed: chain.passed, length: chain.length,
        mySteps: mine.filter((m) => ['passed', 'pending'].includes(m.modState)).map((m) => m.n),
        blockedStep: blocked ? blocked.n : null,
        at: chain.lastActivityAt, unseen: false, ...promptView(chain, status, openid), mine,
      }],
    };
  }

  const cursor = input.optInt(event.cursor, 0, 100000, 0);
  const rows = await store.db().collection('chains').where({ involved: openid }).orderBy('lastActivityAt', 'desc').skip(cursor).limit(PAGE).get();
  const ids = rows.data.map((c) => c._id);
  let myByChain = {};
  if (ids.length) {
    const sr = await store.db().collection('steps').where({ author: openid, chainId: store._().in(ids) }).orderBy('createdAt', 'desc').limit(100).get();
    myByChain = sr.data.reduce((m, s) => { (m[s.chainId] = m[s.chainId] || []).push(s); return m; }, {});
  }
  const items = rows.data.map((c) => {
    const mine = myByChain[c._id] || [];
    const myNs = [...new Set(mine.filter((s) => ['passed', 'pending'].includes(s.state)).map((s) => s.n))].sort();
    let status;
    if (c.state === 'removed' || c.hidden) status = 'removed';
    else if (c.state === 'revealed') status = 'revealed';
    else if (c.state === 'expired') status = 'expired';
    else if (mine.some((s) => s.state === 'pending')) status = 'pending';
    else if (mine.length && !mine.some((s) => s.state === 'passed')) status = 'blocked';
    else status = 'open';
    const participant = c.participants.includes(openid);
    const blocked = mine.filter((s) => s.state === 'blocked' && s.n >= c.nextStep)[0];
    return {
      chainId: c._id,
      status,
      passed: c.passed,
      length: c.length,
      mySteps: myNs,
      at: c.lastActivityAt,
      unseen: status === 'revealed' && participant && !(player.seen || []).includes(c._id),
      blockedStep: blocked ? blocked.n : null,
      ...promptView(c, status, openid),
    };
  });
  return {
    ok: true,
    items,
    cursor: rows.data.length === PAGE ? cursor + PAGE : null,
    streak: players.streakNow(player, dateKey),
  };
});
