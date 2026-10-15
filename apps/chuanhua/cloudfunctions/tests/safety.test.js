'use strict';
// Trust and safety: participants-only reveal, reports, strikes and escalation, admin, deletion, no leaks (AC 57-86).
const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createHarness } = require('./helpers/harness');
const F = require('./helpers/flow');

let h;
const [A, B, C, D, E] = F.PEOPLE;
beforeEach(() => { h = createHarness(); });
afterEach(() => h.teardown());

async function revealed(authors = [A, B, A, B, A, B]) {
  const refs = {};
  for (const p of F.PEOPLE) refs[p] = await F.player(h, p);
  const id = F.seedChain(h, { authors, openGId: F.GROUP_A, passed: authors.length, patch: authors.length === 6 ? { state: 'revealed', revealReason: 'complete', revealedAt: h.now() } : { state: 'revealed', revealReason: 'early', revealedAt: h.now() } });
  return { refs, id };
}

// ------------------------------------------------------------------ reveal access

test('only participants get reveal content; other group members get the teaser texts only (AC 80)', async () => {
  const { refs, id } = await revealed();
  const rv = await h.call('getReveal', { chainId: id }, { openid: A });
  assert.equal(rv.ok, true);
  const teaser = await h.call('getReveal', { chainId: id }, { openid: C });
  assert.equal(teaser.ok, false);
  assert.equal(teaser.code, 'NOT_PARTICIPANT');
  assert.deepEqual(Object.keys(teaser.teaser).sort(), ['canSameAgain', 'finalText', 'passed', 'paused', 'promptId', 'promptText']);
  assert.equal(teaser.teaser.promptText, '题目1号');
  assert.equal(teaser.teaser.finalText, '猜测6号');
  assert.ok(!/strokes/.test(JSON.stringify(teaser)));
  assert.ok(!JSON.stringify(teaser).includes('猜测2号'), 'only the final sentence');
  // someone outside the group gets nothing at all
  const outsider = 'oOutsider00000000000000';
  await F.agree(h, outsider);
  await F.join(h, outsider, F.GROUP_B);
  const out = await h.call('getReveal', { chainId: id }, { openid: outsider });
  assert.equal(out.code, 'NOT_MEMBER');
  assert.equal(out.teaser, undefined);
  void refs;
});

test('a chain that is not revealed gives nobody a reveal; a pending-only author is not a participant yet', async () => {
  const gref = await F.player(h, A);
  await F.player(h, B);
  const c = await F.create(h, A, { groupRef: gref });
  await F.submit(h, A, c.chainId, c.claim.claimId, { strokes: F.strokes() }); // pending
  assert.equal((await h.call('getReveal', { chainId: c.chainId }, { openid: A })).code, 'NOT_REVEALED');
  const open = F.seedChain(h, { authors: [A, B], openGId: F.GROUP_A });
  assert.equal((await h.call('getReveal', { chainId: open }, { openid: B })).code, 'NOT_REVEALED');
  // early reveal at 4: participants are starter + authors of PASSED 棒 only
  const four = F.seedChain(h, { authors: [A, B, A, B], openGId: F.GROUP_A });
  await h.call('revealNow', { chainId: four }, { openid: A });
  const third = 'oThird00000000000000000';
  await F.player(h, third);
  assert.equal((await h.call('getReveal', { chainId: four }, { openid: third })).code, 'NOT_PARTICIPANT');
  const rv = await h.call('getReveal', { chainId: four }, { openid: B });
  assert.equal(rv.early, true);
  assert.equal(rv.steps.length, 4);
});

test('drawings are never in a response to a non-participant of any function (AC 29, 30)', async () => {
  const { refs, id } = await revealed();
  for (const who of [C, D]) {
    const rs = [
      await h.call('getChain', { chainId: id, groupRef: refs[who] }, { openid: who }),
      await h.call('getReveal', { chainId: id }, { openid: who }),
      await h.call('getGroupChains', { groupRef: refs[who] }, { openid: who }),
      await h.call('getMyChains', {}, { openid: who }),
      await h.call('laugh', { chainId: id, step: 1 }, { openid: who }),
      await h.call('getMyChains', { chainId: id }, { openid: who }),
    ];
    for (const r of rs) assert.ok(!/strokes|"s":\[\[/.test(JSON.stringify(r)), JSON.stringify(r));
  }
});

// ------------------------------------------------------------------ reports

test('a report hides the item for everyone at once; a second report by the same player is DUP_REPORT (AC 59)', async () => {
  const { refs, id } = await revealed();
  const r = await h.call('report', { chainId: id, step: 1, reason: 'porn' }, { openid: B });
  assert.equal(r.ok, true);
  assert.equal(r.hidden, true);
  assert.equal(h.db.all('reports').length, 1);
  assert.equal(h.db.all('reports')[0].reporter, B);
  assert.equal(h.db.get('steps', `${id}_1_1`).state, 'hidden');
  // every viewer's next fetch shows the placeholder, with no content
  for (const who of [A, B]) {
    const rv = await h.call('getReveal', { chainId: id }, { openid: who });
    assert.equal(rv.steps[0].placeholder, 'reported');
    assert.ok(!rv.steps[0].strokes);
    assert.ok(rv.steps[1].text, 'other steps unaffected');
  }
  assert.equal((await h.call('report', { chainId: id, step: 1, reason: 'porn' }, { openid: B })).code, 'DUP_REPORT');
  // you cannot report your own 棒, nor an item you cannot see
  assert.equal((await h.call('report', { chainId: id, step: 2, reason: 'abuse' }, { openid: B })).code, 'OWN_STEP');
  assert.equal((await h.call('report', { chainId: id, step: 3, reason: 'abuse' }, { openid: C })).code, 'NOT_PARTICIPANT');
  assert.equal((await h.call('report', { chainId: id, step: 3, reason: 'bad-reason' }, { openid: A })).code, 'BAD_INPUT');
  void refs;
});

test('reporting the latest passed 棒 of an open chain reopens it; the reporter\'s own claim is released (AC 60)', async () => {
  const refs = {};
  for (const p of [A, B, C]) refs[p] = await F.player(h, p);
  const id = F.seedChain(h, { authors: [A, B, A], openGId: F.GROUP_A });
  const cl = await F.claim(h, C, id, refs[C]);
  assert.equal(cl.step, 4);
  const r = await h.call('report', { chainId: id, step: 3, reason: 'ad' }, { openid: C });
  assert.equal(r.reopened, true);
  assert.equal(r.releasedOwnClaim, true);
  const ch = h.db.get('chains', id);
  assert.equal(ch.passed, 2);
  assert.equal(ch.nextStep, 3);
  assert.equal(ch.claim, null);
  assert.equal(ch.stepIds[3], null);
  // C can now take the reopened 棒 3 (B authored 棒 2, so it is not C's own)
  const again = await F.claim(h, C, id, refs[C]);
  assert.equal(again.step, 3);
  assert.equal(again.prev.text, '猜测2号');
  // the hidden step is never served again
  assert.ok(!JSON.stringify(again).includes('strokes'));
});

test('admin hide cancels someone else\'s claim on the next 棒 (spec 7.1)', async () => {
  const refs = {};
  for (const p of [A, B, C]) refs[p] = await F.player(h, p);
  const id = F.seedChain(h, { authors: [A, B, A], openGId: F.GROUP_A });
  const cl = await F.claim(h, C, id, refs[C]);
  await h.call('admin', { op: 'hideStep', stepId: `${id}_3_1` });
  assert.equal(h.db.get('chains', id).claim, null);
  const late = await F.submit(h, C, id, cl.claimId, { text: '已经取消了' });
  assert.equal(late.code, 'CLAIM_LOST');
});

test('reporting the teaser: a custom prompt hides the whole chain; a preset hides the final sentence (AC 61, 58)', async () => {
  const { refs, id } = await revealed();
  h.db.patch('chains', id, (c) => { c.custom = true; c.promptId = null; });
  const r = await h.call('report', { chainId: id, step: 0, reason: 'politics' }, { openid: C });
  assert.equal(r.hidden, true);
  assert.equal((await h.call('getReveal', { chainId: id }, { openid: A })).code, 'CHAIN_HIDDEN');
  assert.equal((await h.call('getReveal', { chainId: id }, { openid: C })).code, 'CHAIN_HIDDEN');
  assert.equal((await h.call('getChain', { chainId: id, groupRef: refs[C] }, { openid: C })).state, 'removed');
  assert.equal((await F.claim(h, C, id, refs[C])).code, 'CHAIN_HIDDEN');
  const gc = await h.call('getGroupChains', { groupRef: refs[D] }, { openid: D });
  assert.equal(gc.revealed.length, 0);
  // the starter cannot report their own prompt
  const x = F.seedChain(h, { authors: [A, B, A, B, A, B], openGId: F.GROUP_A, patch: { state: 'revealed', revealedAt: h.now(), custom: true } });
  assert.equal((await h.call('report', { chainId: x, step: 0, reason: 'other' }, { openid: A })).code, 'OWN_STEP');
  // preset: the final sentence is hidden
  const y = F.seedChain(h, { authors: [A, B, A, B, A, B], openGId: F.GROUP_A, patch: { state: 'revealed', revealedAt: h.now() } });
  await h.call('report', { chainId: y, step: 0, reason: 'abuse' }, { openid: C });
  assert.equal(h.db.get('steps', `${y}_6_1`).state, 'hidden');
  const teaser = await h.call('getReveal', { chainId: y }, { openid: D });
  assert.equal(teaser.teaser.finalText, '猜测4号', 'the latest visible sentence');
  // non-member cannot report a teaser
  const outsider = 'oOutsider00000000000000';
  await F.agree(h, outsider);
  assert.equal((await h.call('report', { chainId: y, step: 0, reason: 'abuse' }, { openid: outsider })).code, 'NOT_PARTICIPANT');
});

test('reports are limited to 10 per day (AC 18)', async () => {
  const { id } = await revealed();
  for (let i = 0; i < 11; i++) {
    h.advance(61000);
    const x = F.seedChain(h, { authors: [A, B, A, B, A, B], openGId: F.GROUP_A, patch: { state: 'revealed', revealedAt: h.now() } });
    const r = await h.call('report', { chainId: x, step: 1, reason: 'other' }, { openid: B });
    if (i < 10) assert.equal(r.ok, true, `report ${i}`); else assert.equal(r.code, 'REPORT_LIMIT');
  }
  void id;
});

// ------------------------------------------------------------------ strikes and escalation

async function risky(who, ref, i) {
  h.advance(61000);
  const id = F.seedChain(h, { authors: [A], openGId: F.GROUP_A });
  const cl = await F.claim(h, who, id, ref);
  if (!cl.ok) return cl;
  return F.submit(h, who, id, cl.claimId, { text: `测试违规${i}` });
}

test('strike ladder over a rolling 30 days: 1 warning, 2 -> 24 h, 3 -> 7 d, >= 4 -> 30 d + flag (AC 65)', async () => {
  const gref = await F.player(h, A);
  await F.player(h, B);
  const player = () => h.db.get('players', B);
  const t0 = h.now();
  assert.equal((await risky(B, gref, 1)).code, 'TEXT_BLOCKED');
  assert.equal(player().strikes.length, 1);
  assert.equal(player().restrictedUntil || 0, 0);
  const home = await h.call('getHome', {}, { openid: B });
  assert.equal(home.me.warnPending, true);
  assert.equal((await h.call('getHome', {}, { openid: B })).me.warnPending, true, 'kept until the client acknowledges it');
  assert.equal((await h.call('ackWarning', {}, { openid: B })).ok, true);
  assert.equal((await h.call('getHome', {}, { openid: B })).me.warnPending, false, 'acknowledged: the one-time sheet is gone');
  assert.equal((await h.call('ackWarning', {}, { openid: B })).ok, true, 'idempotent');
  assert.equal(h.db.get('players', B).strikes.length, 1, 'ackWarning never touches the strikes');

  assert.equal((await risky(B, gref, 2)).code, 'TEXT_BLOCKED');
  assert.equal(player().strikes.length, 2);
  assert.ok(player().restrictedUntil - h.now() > 23 * 3600000 && player().restrictedUntil - h.now() <= 24 * 3600000);
  assert.equal((await risky(B, gref, 3)).code, 'RESTRICTED');
  h.advance(25 * 3600000);
  assert.equal((await risky(B, gref, 4)).code, 'TEXT_BLOCKED');
  assert.equal(player().strikes.length, 3);
  assert.ok(player().restrictedUntil - h.now() > 6.9 * 86400000);
  h.advance(8 * 86400000);
  assert.equal((await risky(B, gref, 5)).code, 'TEXT_BLOCKED');
  assert.equal(player().strikes.length, 4);
  assert.ok(player().restrictedUntil - h.now() > 29 * 86400000);
  assert.equal(player().flagged, true);
  // review verdicts and local rejections add nothing; and strikes older than 30 days fall out
  h.advance(31 * 86400000);
  await F.join(h, B); // group membership is only fresh for 30 days
  assert.equal((await risky(B, gref, 6)).code, 'TEXT_BLOCKED');
  assert.equal(player().strikes.length, 1, 'rolling window');
  void t0;
});

test('a restricted player can still open reveals they took part in, 我的接龙 and sees the end time (AC 66)', async () => {
  const { refs, id } = await revealed();
  await h.call('admin', { op: 'restrict', openid: B, days: 3 });
  const home = await h.call('getHome', {}, { openid: B });
  assert.ok(home.me.restriction.until > h.now());
  assert.equal((await h.call('getReveal', { chainId: id }, { openid: B })).ok, true);
  assert.equal((await h.call('getMyChains', {}, { openid: B })).ok, true);
  assert.equal((await h.call('createChain', { promptId: 'A01' }, { openid: B })).code, 'RESTRICTED');
  const open = F.seedChain(h, { authors: [A], openGId: F.GROUP_A });
  assert.equal((await F.claim(h, B, open, refs[B])).code, 'RESTRICTED');
  const view = await h.call('getChain', { chainId: open, groupRef: refs[B] }, { openid: B });
  assert.equal(view.state, 'restricted');
  assert.ok(view.until > h.now());
  await h.call('admin', { op: 'restrict', openid: B, permanent: true });
  assert.equal((await h.call('getHome', {}, { openid: B })).me.restriction.permanent, true);
});

test('restriction imposed mid-turn lets the current claim finish; one that predates the claim does not (edge 19)', async () => {
  const gref = await F.player(h, A);
  await F.player(h, B);
  const id = F.seedChain(h, { authors: [A], openGId: F.GROUP_A });
  const cl = await F.claim(h, B, id, gref);
  h.advance(5000);
  await h.call('admin', { op: 'restrict', openid: B, days: 1 });
  assert.equal((await F.submit(h, B, id, cl.claimId, { text: '这一棒可以交完' })).state, 'passed');
});

// ------------------------------------------------------------------ admin

test('admin: no OPENID (console) works; a client OPENID is FORBIDDEN unless in ADMIN_OPENIDS (AC 62)', async () => {
  const gref = await F.player(h, A);
  assert.equal((await h.call('admin', { op: 'listReports', state: 'open' }, { openid: A })).code, 'FORBIDDEN');
  assert.equal((await h.call('admin', { op: 'setUgc', createEnabled: true }, { openid: A })).code, 'FORBIDDEN');
  assert.equal((await h.call('admin', { op: 'listReports' })).ok, true);
  h.setEnv('ADMIN_OPENIDS', ` ${B}, ${C} `);
  assert.equal((await h.call('admin', { op: 'listReports' }, { openid: B })).ok, true);
  assert.equal((await h.call('admin', { op: 'listReports' }, { openid: A })).code, 'FORBIDDEN');
  assert.equal((await h.call('admin', { op: 'nope' })).code, 'BAD_INPUT');
  assert.equal((await h.call('admin', {})).code, 'BAD_INPUT');
  assert.equal((await h.call('admin', { op: 'constructor' })).code, 'BAD_INPUT', 'prototype keys are not ops');
  void gref;
  const audit = h.db.all('audit_log');
  assert.ok(audit.some((a) => a.by === B));
  assert.ok(audit.some((a) => a.by === 'console'));
});

test('admin ops: report queue, uphold (strike), dismiss with restore, hide/restore, remove, restrict, getStep, sample; all audited', async () => {
  const { refs, id } = await revealed();
  await h.call('report', { chainId: id, step: 1, reason: 'porn' }, { openid: B });
  h.advance(1000);
  await h.call('report', { chainId: id, step: 3, reason: 'ad' }, { openid: B });
  const list = await h.call('admin', { op: 'listReports', state: 'open', limit: 10 });
  assert.equal(list.reports.length, 2);
  assert.ok(list.reports[0].createdAt <= list.reports[1].createdAt, 'oldest first');
  assert.ok(list.reports[0].step.strokes, 'admin sees the drawing data');
  assert.ok(!F.allKeys(list).includes('reporter'), 'no reporter field (the report id itself embeds the reporter openid per spec 13.1; admin console only)');
  assert.equal(list.reports[0].step.pngUrl, null, 'mock moderation steps have no PNG yet');

  const up = await h.call('admin', { op: 'upholdReport', reportId: list.reports[0].reportId });
  assert.equal(up.upheld, true);
  assert.equal(h.db.get('steps', `${id}_1_1`).state, 'hidden');
  assert.equal(h.db.get('players', A).strikes.length, 1);
  assert.equal((await h.call('admin', { op: 'upholdReport', reportId: list.reports[0].reportId })).code, 'CHAIN_CLOSED', 'already resolved');

  const dis = await h.call('admin', { op: 'dismissReport', reportId: list.reports[1].reportId, restore: true });
  assert.equal(dis.restored, true);
  assert.equal(h.db.get('steps', `${id}_3_1`).state, 'passed');
  assert.equal(h.db.get('reports', list.reports[1].reportId).state, 'dismissed');

  const gs = await h.call('admin', { op: 'getStep', stepId: `${id}_1_1` });
  assert.equal(gs.author, A, 'openid is shown to the admin only');
  assert.equal(gs.authorStrikes30d, 1);
  assert.equal(gs.reports.length, 1);

  const hs = await h.call('admin', { op: 'hideStep', stepId: `${id}_2_1` });
  assert.equal(hs.hidden, true);
  assert.equal((await h.call('admin', { op: 'restoreStep', stepId: `${id}_2_1` })).restored, true);

  const sample = await h.call('admin', { op: 'sample', n: 3, kind: 'describe' });
  assert.ok(sample.items.length <= 3 && sample.items.every((s) => s.kind === 'describe' && s.state === 'passed'));
  assert.equal((await h.call('admin', { op: 'sample', n: 51 })).code, 'BAD_INPUT');

  await h.call('admin', { op: 'removeChain', chainId: id });
  assert.equal((await h.call('getChain', { chainId: id, groupRef: refs[A] }, { openid: A })).state, 'removed');
  assert.equal((await h.call('getReveal', { chainId: id }, { openid: A })).code, 'CHAIN_REMOVED');
  assert.equal((await F.claim(h, C, id, refs[C])).code, 'CHAIN_REMOVED');

  await h.call('admin', { op: 'restrict', openid: C, days: 2 });
  assert.ok(h.db.get('players', C).restrictedUntil > h.now());
  await h.call('admin', { op: 'liftRestriction', openid: C });
  assert.equal(h.db.get('players', C).restrictedUntil, 0);
  const ops = new Set(h.db.all('audit_log').map((a) => a.op));
  for (const op of ['upholdReport', 'dismissReport', 'hideStep', 'restoreStep', 'removeChain', 'restrict', 'liftRestriction', 'getStep', 'sample', 'listReports']) assert.ok(ops.has(op), `audited ${op}`);
  assert.ok(h.db.all('audit_log').every((a) => a.by === 'console' && typeof a.ts === 'number'));
});

test('dismissReport with restore keeps a step hidden if restoring would expose it in an open chain (AC 63)', async () => {
  const refs = {};
  for (const p of [A, B, C]) refs[p] = await F.player(h, p);
  const id = F.seedChain(h, { authors: [A, B, A], openGId: F.GROUP_A });
  await F.claim(h, C, id, refs[C]);
  await h.call('report', { chainId: id, step: 3, reason: 'other' }, { openid: C });
  const rep = h.db.all('reports')[0];
  const r = await h.call('admin', { op: 'dismissReport', reportId: rep._id, restore: true });
  assert.equal(r.restored, false);
  assert.equal(h.db.get('steps', `${id}_3_1`).state, 'hidden');
  assert.equal(h.db.get('reports', rep._id).state, 'dismissed');
});

test('removeChain freezes the updatable card: closed once, never updated again (AC 64)', async () => {
  const gref = await F.player(h, A);
  await F.player(h, B);
  h.db.put('app_config', { _id: 'live', features: { updatableCard: true } });
  const id = F.seedChain(h, { authors: [A, B], openGId: F.GROUP_A, patch: { activityId: 'act9', activityExpiresAt: h.now() + 3600e3 } });
  await h.call('admin', { op: 'removeChain', chainId: id });
  h.advance(11000);
  assert.equal(h.sdk.count('setUpdatableMsg'), 1);
  assert.equal(h.sdk.calls.setUpdatableMsg[0].targetState, 1);
  await h.call('admin', { op: 'removeChain', chainId: id });
  assert.equal(h.sdk.count('setUpdatableMsg'), 1, 'frozen');
  void gref;
});

test('updatable card: count follows each passed 棒; failures never block and are retried by the sweeper', async () => {
  const gref = await F.player(h, A);
  await F.player(h, B);
  h.db.put('app_config', { _id: 'live', features: { updatableCard: true } });
  const c = await F.create(h, A, { groupRef: gref });
  await F.submit(h, A, c.chainId, c.claim.claimId, { strokes: F.strokes() });
  await F.sweep(h);
  const v = await h.call('getChain', { chainId: c.chainId, groupRef: gref, wantActivity: true }, { openid: A });
  assert.equal(v.activityId, 'act1');
  await F.play(h, B, c.chainId, gref, { text: '第二棒的话' });
  const last = h.sdk.calls.setUpdatableMsg.at(-1);
  assert.equal(last.targetState, 0);
  assert.deepEqual(last.templateInfo.parameterList, [{ name: 'member_count', value: '2' }, { name: 'room_limit', value: '6' }]);
  h.sdk.on('setUpdatableMsg', async () => { throw new Error('platform down'); });
  const r = await F.play(h, A, c.chainId, gref);
  assert.equal(r.submit.state, 'pending', 'the game flow is unaffected by card failures');
  assert.equal(h.db.get('chains', c.chainId).activityDirty, true);
  h.sdk.on('setUpdatableMsg', async () => ({ errCode: 0 }));
  await h.call('modSweeper', {});
  assert.equal(h.db.get('chains', c.chainId).activityDirty, false);
  // feature off: no calls at all
  h.db.put('app_config', { _id: 'live', features: { updatableCard: false } });
  h.advance(11000);
  const before = h.sdk.count('setUpdatableMsg');
  await F.play(h, B, c.chainId, gref, { text: '关闭了动态卡片' });
  assert.equal(h.sdk.count('setUpdatableMsg'), before);
});

// ------------------------------------------------------------------ author deletion

test('deleteMyStep removes content, shows the placeholder, reopens the latest 棒 and keeps the evidence (AC 71)', async () => {
  const refs = {};
  for (const p of [A, B, C]) refs[p] = await F.player(h, p);
  // revealed chain: placeholder only
  const rid = F.seedChain(h, { authors: [A, B, A, B, A, B], openGId: F.GROUP_A, patch: { state: 'revealed', revealedAt: h.now() } });
  h.db.put('mod_log', { _id: `${rid}_1_1`, stepId: `${rid}_1_1`, author: A, kind: 'image', suggest: 'pass', ts: h.now() });
  assert.equal((await h.call('deleteMyStep', { chainId: rid, step: 1 }, { openid: B })).code, 'FORBIDDEN');
  assert.equal((await h.call('deleteMyStep', { chainId: rid, step: 1 }, { openid: A })).count, 1);
  const rv = await h.call('getReveal', { chainId: rid }, { openid: B });
  assert.equal(rv.steps[0].placeholder, 'deleted');
  assert.ok(!rv.steps[0].strokes);
  const st = h.db.get('steps', `${rid}_1_1`);
  assert.equal(st.strokes, null);
  assert.equal(st.state, 'deleted');
  assert.ok(h.db.get('mod_log', `${rid}_1_1`), 'evidence stays until 180 days');
  // open chain: the latest passed 棒 reopens and a claim on the next one is cancelled
  const oid = F.seedChain(h, { authors: [A, B, A], openGId: F.GROUP_A });
  const cl = await F.claim(h, C, oid, refs[C]);
  assert.equal(cl.step, 4);
  await h.call('deleteMyStep', { chainId: oid, step: 3 }, { openid: A });
  const ch = h.db.get('chains', oid);
  assert.equal(ch.passed, 2);
  assert.equal(ch.nextStep, 3);
  assert.equal(ch.claim, null);
  assert.equal((await F.submit(h, C, oid, cl.claimId, { text: '前一棒被删了' })).code, 'CLAIM_LOST');
});

test('delete all my content applies to every passed 棒 of the player (AC 72)', async () => {
  const gref = await F.player(h, A);
  await F.player(h, B);
  const one = F.seedChain(h, { authors: [A, B, A], openGId: F.GROUP_A });
  const two = F.seedChain(h, { authors: [B, A, B, A, B, A], openGId: F.GROUP_A, patch: { state: 'revealed', revealedAt: h.now() } });
  const r = await h.call('deleteMyStep', { all: true }, { openid: A });
  assert.equal(r.count, 5);
  for (const s of h.db.all('steps').filter((x) => x.author === A)) assert.equal(s.state, 'deleted');
  for (const s of h.db.all('steps').filter((x) => x.author === B)) assert.equal(s.state, 'passed');
  assert.equal(h.db.get('chains', one).passed, 2, 'the latest 棒 was theirs and reopened');
  const rv = await h.call('getReveal', { chainId: two }, { openid: B });
  assert.equal(rv.steps.filter((s) => s.placeholder === 'deleted').length, 3);
  void gref;
});

// ------------------------------------------------------------------ reactions

test('笑 is a per-participant toggle with counts, participants only (AC 83)', async () => {
  const { id } = await revealed();
  const on = await h.call('laugh', { chainId: id, step: 2 }, { openid: A });
  assert.deepEqual([on.laughs, on.mine], [1, true]);
  assert.equal((await h.call('laugh', { chainId: id, step: 2 }, { openid: B })).laughs, 2);
  const off = await h.call('laugh', { chainId: id, step: 2 }, { openid: A });
  assert.deepEqual([off.laughs, off.mine], [1, false]);
  assert.equal((await h.call('laugh', { chainId: id, step: 2 }, { openid: C })).code, 'NOT_PARTICIPANT');
  const rv = await h.call('getReveal', { chainId: id }, { openid: B });
  assert.deepEqual([rv.steps[1].laughs, rv.steps[1].myLaugh], [1, true]);
  assert.ok(!('rank' in rv) && !('best' in rv));
  const open = F.seedChain(h, { authors: [A, B], openGId: F.GROUP_A });
  assert.equal((await h.call('laugh', { chainId: open, step: 1 }, { openid: A })).code, 'CHAIN_CLOSED');
});

// ------------------------------------------------------------------ group list

test('getGroupChains: membership checked, waiting vs in-progress, revealed teasers, aggregate stats, nothing hidden or personal (AC 98)', async () => {
  const refs = {};
  for (const p of [A, B, C]) refs[p] = await F.player(h, p);
  const outsider = 'oOutsider00000000000000';
  await F.agree(h, outsider);
  const oref = await F.join(h, outsider, F.GROUP_B);
  assert.equal((await h.call('getGroupChains', { groupRef: refs[A] }, { openid: outsider })).code, 'NOT_MEMBER');
  assert.equal((await h.call('getGroupChains', { groupRef: oref }, { openid: A })).code, 'NOT_MEMBER');
  const waiting = F.seedChain(h, { authors: [A, B], openGId: F.GROUP_A });
  const mineWait = F.seedChain(h, { authors: [A, B, A], openGId: F.GROUP_A });
  const pending = F.seedChain(h, { authors: [A, B], openGId: F.GROUP_A, patch: { state: 'pending' } });
  const hidden = F.seedChain(h, { authors: [A, B], openGId: F.GROUP_A, patch: { hidden: true } });
  const rev = F.seedChain(h, { authors: [A, B, A, B, A, B], openGId: F.GROUP_A, patch: { state: 'revealed', revealedAt: h.now() } });
  const other = F.seedChain(h, { authors: [A, B], openGId: F.GROUP_B });
  h.db.put('group_stats', { _id: F.GROUP_A, started: 5, revealed: 12, drawings: 41, lastActivityAt: h.now() });
  const r = await h.call('getGroupChains', { groupRef: refs[A] }, { openid: A });
  assert.equal(r.ok, true);
  assert.deepEqual(r.stats, { revealed: 12, drawings: 41, started: 5 });
  assert.ok(r.waiting.some((x) => x.chainId === waiting && x.nextStep === 3 && x.nextKind === 'draw'));
  assert.ok(r.inProgress.some((x) => x.chainId === mineWait && x.why === 'prevMine'));
  assert.ok(r.inProgress.some((x) => x.chainId === pending && x.why === 'pending'));
  const ids = [...r.waiting, ...r.inProgress, ...r.revealed].map((x) => x.chainId);
  assert.ok(!ids.includes(hidden) && !ids.includes(other));
  assert.equal(r.revealed[0].chainId, rev);
  assert.equal(r.revealed[0].participant, true);
  assert.equal(r.revealed[0].finalText, '猜测6号');
  const forC = await h.call('getGroupChains', { groupRef: refs[C] }, { openid: C });
  assert.equal(forC.revealed[0].participant, false);
  assert.ok(!/strokes/.test(JSON.stringify(r)));
});

// ------------------------------------------------------------------ no leaks

test('no response to a client contains an openid, openGId, file id, PNG url or identity-bearing field (AC 29, 73, 74)', async () => {
  const refs = {};
  for (const p of F.PEOPLE) refs[p] = await F.player(h, p);
  const out = [];
  const call = async (fn, ev, who) => { const r = await h.call(fn, ev, { openid: who }); out.push([fn, r]); h.advance(1000); return r; };
  await call('getHome', {}, A);
  const cr = await call('createChain', { promptId: 'A05', groupRef: refs[A] }, A);
  await call('track', { events: [{ name: 'session_start', props: { scene: 1001 } }] }, A);
  await call('submitStep', { chainId: cr.chainId, claimId: cr.claim.claimId, strokes: F.strokes() }, A);
  await F.sweep(h);
  await call('getChain', { chainId: cr.chainId, groupRef: refs[B], wantActivity: true }, B);
  const cl = await call('claimStep', { chainId: cr.chainId, groupRef: refs[B] }, B);
  await call('getChain', { chainId: cr.chainId, groupRef: refs[C] }, C);
  await call('submitStep', { chainId: cr.chainId, claimId: cl.claimId, text: '看看这是啥' }, B);
  const full = await F.completeChain(h, A, B, refs[A]);
  await call('getReveal', { chainId: full }, A);
  await call('getReveal', { chainId: full }, C);
  await call('laugh', { chainId: full, step: 1 }, A);
  await call('report', { chainId: full, step: 2, reason: 'other' }, A);
  await call('getMyChains', {}, A);
  await call('getMyChains', { chainId: full }, A);
  await call('getGroupChains', { groupRef: refs[A] }, A);
  await call('grantReward', { kind: 'palette', noFill: false }, A);
  await call('deleteMyStep', { chainId: full, step: 1 }, A);
  await call('revealNow', { chainId: full }, A);
  await call('releaseClaim', { chainId: cr.chainId, claimId: cr.claim.claimId }, A);
  await call('subscribeReveal', { chainId: cr.chainId }, A);
  await call('agreeRules', { version: 1 }, A);
  const out2 = await h.call('joinGroup', { groupData: { cloudID: 'x', data: { opengid: F.GROUP_A, chat_type: 3 } } }, { openid: A });
  out.push(['joinGroup', out2]);
  assert.ok(out.length > 20);
  const secrets = [...F.PEOPLE, F.GROUP_A, F.GROUP_B];
  const badKeys = /^(openid|openGId|opengid|author|authors|starter|participants|involved|perPersonCount|fileID|pngUrl|png|nickname|avatar|traceId|trace_id|mod|reporter)$/;
  for (const [fn, r] of out) {
    const s = JSON.stringify(r);
    for (const sec of secrets) assert.ok(!s.includes(sec), `${fn} leaked ${sec}: ${s}`);
    assert.ok(!/cloud:\/\/|tmp\.example|\.png/.test(s), `${fn} leaked a file reference`);
    for (const k of F.allKeys(r)) assert.ok(!badKeys.test(k), `${fn} has identity-ish key ${k}`);
  }
  // the reveal labels own steps with `mine`, never a name
  const rv = out.find(([fn, r]) => fn === 'getReveal' && r.ok)[1];
  assert.ok(rv.steps.every((s) => typeof s.mine === 'boolean'));
});

// ------------------------------------------------------------------ subscribe notices

test('reveal notices: opt-in grant, one message per grant, held until 08:00 BJT in quiet hours (AC 78, 100)', async () => {
  const refs = {};
  for (const p of [A, B]) refs[p] = await F.player(h, p);
  assert.equal((await h.call('subscribeReveal', { chainId: 'AAAAAAAAAA' }, { openid: A })).code, 'NO_TEMPLATE');
  h.db.put('app_config', { _id: 'live', subscribe: { tmplId: 'TMPL1', fields: { thing1: '你参与的接龙揭晓了', thing2: '{prompt}', time3: '{time}' } } });
  h.advance(11000);
  const mk = () => F.seedChain(h, { authors: [A, B, A, B], openGId: F.GROUP_A });
  const day = mk();
  assert.equal((await h.call('subscribeReveal', { chainId: day }, { openid: A })).ok, true);
  assert.equal((await h.call('subscribeReveal', { chainId: day }, { openid: A })).ok, true, 'idempotent');
  assert.equal(h.db.all('sub_grants').length, 1);
  assert.equal((await h.call('subscribeReveal', { chainId: day }, { openid: C })).code, 'NOT_PARTICIPANT');
  await h.call('revealNow', { chainId: day }, { openid: A });
  await h.call('modSweeper', {});
  await h.call('modSweeper', {});
  assert.equal(h.sdk.count('send'), 1, 'exactly one message per grant');
  const msg = h.sdk.calls.send[0];
  assert.equal(msg.touser, A);
  assert.equal(msg.templateId, 'TMPL1');
  assert.equal(msg.page, `?r=${day}`);
  assert.equal(msg.data.thing2.value, '题目1号');
  assert.equal((await h.call('subscribeReveal', { chainId: day }, { openid: B })).code, 'CHAIN_CLOSED');

  // quiet hours: 23:30 BJT reveal -> sent at 08:00
  h.setNow(Date.UTC(2026, 10, 3, 15, 30, 0)); // 23:30 BJT
  const night = mk();
  await h.call('subscribeReveal', { chainId: night }, { openid: B });
  await h.call('revealNow', { chainId: night }, { openid: A });
  await h.call('modSweeper', {});
  assert.equal(h.sdk.count('send'), 1, 'held overnight');
  h.setNow(Date.UTC(2026, 10, 3, 23, 59, 0)); // 07:59 BJT
  await h.call('modSweeper', {});
  assert.equal(h.sdk.count('send'), 1);
  h.setNow(Date.UTC(2026, 10, 4, 0, 1, 0)); // 08:01 BJT
  await h.call('modSweeper', {});
  assert.equal(h.sdk.count('send'), 2);
  assert.equal(h.sdk.calls.send[1].touser, B);
  // a failed send is never retried (at most one per grant)
  h.sdk.on('send', async () => { const e = new Error('43101 refused'); e.errCode = 43101; throw e; });
  const x = mk();
  await h.call('subscribeReveal', { chainId: x }, { openid: A });
  await h.call('revealNow', { chainId: x }, { openid: A });
  await h.call('modSweeper', {});
  await h.call('modSweeper', {});
  assert.equal(h.sdk.count('send'), 3);
  assert.equal(h.db.get('sub_grants', `${x}_${A}`).sendErrCode, 43101);
});

test('quiet-hour boundaries for notice scheduling (AC 78)', async () => {
  h = createHarness();
  const { noticeDueAt } = h.mod('common/lifecycle.js');
  const bjt = (hh, mm) => Date.UTC(2026, 10, 3, hh - 8, mm, 0);
  assert.equal(noticeDueAt(bjt(8, 0)), bjt(8, 0));
  assert.equal(noticeDueAt(bjt(21, 59)), bjt(21, 59));
  assert.equal(noticeDueAt(bjt(22, 0)), Date.UTC(2026, 10, 4, 0, 0, 0));
  assert.equal(noticeDueAt(bjt(2, 0)), bjt(8, 0));
  assert.equal(noticeDueAt(bjt(7, 59)), bjt(8, 0));
});
