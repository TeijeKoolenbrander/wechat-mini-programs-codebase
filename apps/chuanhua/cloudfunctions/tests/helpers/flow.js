'use strict';
// Scenario helpers on top of the harness: players, groups, chains and moderation steps.

const PEOPLE = ['oAlice0000000000000001', 'oBob00000000000000000002', 'oCara0000000000000000003', 'oDan00000000000000000004', 'oEve00000000000000000005'];
const GROUP_A = 'gOpenGroupAAAAAAAAAAAAAAAA';
const GROUP_B = 'gOpenGroupBBBBBBBBBBBBBBBB';

function strokes(n = 3, color = 0) {
  const s = [];
  for (let i = 0; i < n; i++) s.push([color, 1, 100 + i * 40, 100 + i * 20, 10, 5, 12, 8, -4, 20]);
  return { v: 1, s };
}

async function agree(h, openid) {
  const r = await h.call('agreeRules', { version: 1 }, { openid });
  if (!r.ok) throw new Error('agree failed ' + JSON.stringify(r));
}
async function join(h, openid, openGId = GROUP_A) {
  const r = await h.call('joinGroup', { groupData: { cloudID: 'x', data: { opengid: openGId, chat_type: 3 } } }, { openid });
  if (!r.ok) throw new Error('join failed ' + JSON.stringify(r));
  return r.groupRef;
}
/** agree + join; returns groupRef */
async function player(h, openid, openGId = GROUP_A) {
  await agree(h, openid);
  return join(h, openid, openGId);
}

async function create(h, openid, o = {}) {
  const r = await h.call('createChain', o.customText ? { customText: o.customText, groupRef: o.groupRef } : { promptId: o.promptId || 'A01', groupRef: o.groupRef }, { openid });
  if (!r.ok) throw new Error('create failed ' + JSON.stringify(r));
  return r;
}
async function claim(h, openid, chainId, groupRef) {
  return h.call('claimStep', { chainId, groupRef }, { openid });
}
async function submit(h, openid, chainId, claimId, body) {
  return h.call('submitStep', { chainId, claimId, ...body }, { openid });
}

/** let the mock moderation resolve every pending drawing (waits out MOCK_MEDIA_DELAY_SEC, runs modSweeper) */
async function sweep(h, advanceMs = 61000) {
  h.advance(advanceMs);
  return h.call('modSweeper', {});
}

/** starter draws 第 1 棒 and it passes moderation */
async function startAndPassFirst(h, starter, groupRef, o = {}) {
  const c = await create(h, starter, { groupRef, promptId: o.promptId });
  const s = await submit(h, starter, c.chainId, c.claim.claimId, { strokes: strokes(o.strokes || 3) });
  if (!s.ok) throw new Error('submit 1 failed ' + JSON.stringify(s));
  await sweep(h);
  return c.chainId;
}

/** claim + submit the next 棒 as `who`; drawings are swept to passed. returns the submit response */
async function play(h, who, chainId, groupRef, o = {}) {
  const cl = await claim(h, who, chainId, groupRef);
  if (!cl.ok) throw new Error('claim failed ' + JSON.stringify(cl));
  const body = cl.kind === 'draw' ? { strokes: strokes(o.strokes || 3) } : { text: o.text || `猜测${cl.step}号` };
  const s = await submit(h, who, chainId, cl.claimId, body);
  if (!s.ok) throw new Error('submit failed ' + JSON.stringify(s));
  if (cl.kind === 'draw') await sweep(h);
  return { claim: cl, submit: s };
}

/** play a chain to completion with two alternating players (A: 1,3,5; B: 2,4,6) */
async function completeChain(h, a, b, groupRef, o = {}) {
  const chainId = await startAndPassFirst(h, a, groupRef, o);
  const order = [b, a, b, a, b];
  for (const who of order) await play(h, who, chainId, groupRef);
  return chainId;
}

let seedSeq = 0;
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
/**
 * Insert a ready-made open chain: steps 1..passed already `passed`, authored by o.authors[0..].
 * Bypasses the API on purpose (fast fixtures for lock races, expiry, caps).
 */
function seedChain(h, o) {
  const chainLib = h.mod('common/chain.js');
  seedSeq += 1;
  const id = o.id || `SEED${B32[(seedSeq >> 5) & 31]}${B32[seedSeq & 31]}AAAA`;
  const nowMs = o.nowMs || h.now();
  const chain = chainLib.newChain({
    id, starter: o.authors[0], openGId: o.openGId === undefined ? GROUP_A : o.openGId, groupRef: o.groupRef || null,
    promptId: 'A01', promptText: '题目1号', custom: false, nowMs, dateKey: '20261103', claimId: 'CLAIMSEED000',
  });
  const passed = o.passed === undefined ? o.authors.length : o.passed;
  chain.claim = null;
  chain.state = passed ? 'open' : 'starting';
  chain.passed = passed;
  chain.nextStep = passed + 1;
  chain.attempts = passed;
  for (let n = 1; n <= passed; n++) {
    const author = o.authors[n - 1];
    const stepId = `${id}_${n}_1`;
    chain.stepIds[n] = stepId;
    chain.authors[n] = author;
    chain.perPersonCount[author] = (chain.perPersonCount[author] || 0) + 1;
    if (!chain.involved.includes(author)) chain.involved.push(author);
    h.db.put('steps', {
      _id: stepId, chainId: id, n, attempt: 1, kind: n % 2 ? 'draw' : 'describe', author, laughs: 0, state: 'passed', createdAt: nowMs, dateKey: '20261103',
      ...(n % 2 ? { strokes: strokes(2 + n), fileID: null } : { text: `猜测${n}号` }), mod: { kind: n % 2 ? 'image' : 'text', suggest: 'pass', traceIds: [] },
    });
  }
  const set = new Set([chain.starter, ...chain.authors.filter(Boolean)]);
  chain.participants = [...set];
  Object.assign(chain, o.patch || {});
  h.db.put('chains', chain);
  return id;
}

function allStrings(v, out = []) {
  if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => allStrings(x, out));
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => allStrings(x, out));
  return out;
}
function allKeys(v, out = []) {
  if (Array.isArray(v)) v.forEach((x) => allKeys(x, out));
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { out.push(k); allKeys(x, out); }
  return out;
}

module.exports = {
  PEOPLE, GROUP_A, GROUP_B, seedChain, strokes, agree, join, player, create, claim, submit, sweep, startAndPassFirst, play, completeChain, allStrings, allKeys,
};
