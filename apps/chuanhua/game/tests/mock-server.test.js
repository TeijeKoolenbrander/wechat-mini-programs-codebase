'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createMockServer } = require('../js/mock-server');
const S = require('../core/strokes');

const T0 = Date.UTC(2026, 10, 20, 4, 0, 0);
const MIN = 60e3;

function world() {
  let t = T0;
  const srv = createMockServer({ now: () => t, rasterize: false });
  const w = { srv, t: () => t, advance: (ms) => (t += ms) };
  w.user = (id) => {
    const u = srv.as(id);
    u.agree = () => u.call('agreeRules', { version: 1 });
    u.join = (gid) => u.call('joinGroup', { groupData: { mockData: { opengid: gid, chat_type: 3 } } }).groupRef;
    return u;
  };
  return w;
}

function drawing(n) {
  const d = S.emptyDrawing();
  for (let i = 0; i < n; i++) d.s.push(S.makeStroke(i % 6, 1, [[10 + i, 10], [100 + i, 200], [300, 300 + i]]));
  return d;
}

/** A starts a chain in group G1 (drawing 3 strokes), returns { w, A, B, C, chainId, ref } */
function started(strokes) {
  const w = world();
  const A = w.user('A');
  const B = w.user('B');
  const Cc = w.user('C');
  [A, B, Cc].forEach((u) => u.agree());
  const ref = A.join('G1');
  B.join('G1');
  Cc.join('G1');
  const cr = A.call('createChain', { promptId: 'A01', groupRef: ref });
  assert.equal(cr.ok, true);
  assert.equal(cr.bound, true);
  assert.equal(cr.claim.sourceText, '小猫吃面条');
  const sub = A.call('submitStep', { chainId: cr.chainId, claimId: cr.claim.claimId, strokes: drawing(strokes || 3), clientMs: 5000, undoCount: 0 });
  assert.equal(sub.state, 'pending');
  return { w, srv: w.srv, A, B, C: Cc, chainId: cr.chainId, ref };
}

function pass1(x) {
  x.w.advance(61 * 1000);
  return x.B.call('getChain', { chainId: x.chainId, groupRef: x.ref });
}

test('start: allowance counted at 第 1 棒 submit; pending hides everything; verdict opens 第 2 棒', () => {
  const x = started();
  assert.equal(x.A.call('getHome').me.startsLeft, 2);
  const g = x.B.call('getChain', { chainId: x.chainId, groupRef: x.ref });
  assert.equal(g.state, 'pending');
  assert.equal(x.B.call('claimStep', { chainId: x.chainId, groupRef: x.ref }).code, 'PENDING');
  assert.ok(!/小猫|strokes/.test(JSON.stringify(g)), 'getChain never carries content');
  const g2 = pass1(x);
  assert.equal(g2.state, 'claimable');
  assert.equal(g2.nextKind, 'describe');
  assert.equal(g2.passed, 1);
  const cl = x.B.call('claimStep', { chainId: x.chainId, groupRef: x.ref });
  assert.equal(cl.ok, true);
  assert.equal(cl.kind, 'describe');
  assert.equal(cl.prev.kind, 'draw');
  assert.equal(cl.prev.strokes.s.length, 3);
  assert.equal(cl.canReport, true);
});

test('abandoned 第 1 棒 keeps the start; released claim of a started chain frees the 棒', () => {
  const w = world();
  const A = w.user('A');
  A.agree();
  const cr = A.call('createChain', { promptId: 'A02' });
  assert.equal(A.call('releaseClaim', { chainId: cr.chainId, claimId: cr.claim.claimId }).ok, true);
  assert.equal(A.call('getHome').me.startsLeft, 3);
  assert.equal(A.call('getChain', { chainId: cr.chainId }).state, 'notFound');
});

test('rules gate: RULES_REQUIRED until agreed; START_LIMIT after 3 free starts, +2 by reward, then REWARD_LIMIT', () => {
  const w = world();
  const A = w.user('A');
  assert.equal(A.call('createChain', { promptId: 'A01' }).code, 'RULES_REQUIRED');
  A.agree();
  for (let i = 0; i < 3; i++) {
    const cr = A.call('createChain', { promptId: 'A0' + (i + 1) });
    assert.equal(cr.ok, true);
    assert.equal(A.call('submitStep', { chainId: cr.chainId, claimId: cr.claim.claimId, strokes: drawing(2) }).state, 'pending');
  }
  assert.equal(A.call('createChain', { promptId: 'A05' }).code, 'START_LIMIT');
  assert.equal(A.call('grantReward', { kind: 'start' }).startsLeft, 1);
  assert.equal(A.call('grantReward', { kind: 'start' }).startsLeft, 2);
  assert.equal(A.call('grantReward', { kind: 'start' }).code, 'REWARD_LIMIT');
  assert.equal(A.call('createChain', { promptId: 'A05' }).ok, true);
  // palette: once a day
  assert.equal(A.call('grantReward', { kind: 'palette' }).paletteToday, true);
  assert.equal(A.call('grantReward', { kind: 'palette' }).code, 'REWARD_LIMIT');
  // resets at the next Beijing day
  w.advance(24 * 3600e3);
  assert.equal(A.call('getHome').me.startsLeft, 3);
  assert.equal(A.call('getHome').me.paletteToday, false);
});

test('two players complete a 6-棒 chain, reveal for participants only, teaser for others', () => {
  const x = started();
  const { A, B } = x;
  const outsider = x.C;
  const text = ['一个大饼在天上', '月亮上有只兔子在跳舞', '外星人在吃披萨'];
  let who = B;
  pass1(x);
  for (let n = 2; n <= 6; n++) {
    const cl = who.call('claimStep', { chainId: x.chainId, groupRef: x.ref });
    assert.equal(cl.ok, true, `step ${n}: ${cl.code}`);
    assert.equal(cl.step, n);
    const r = who.call('submitStep', n % 2 === 0 ? { chainId: x.chainId, claimId: cl.claimId, text: text[n / 2 - 1] } : { chainId: x.chainId, claimId: cl.claimId, strokes: drawing(2 + n) });
    assert.equal(r.ok, true, JSON.stringify(r));
    if (n % 2 === 1) {
      assert.equal(r.state, 'pending');
      x.w.advance(61 * 1000);
      who.call('getHome'); // any call sweeps
    } else assert.equal(r.state, 'passed');
    who = who === B ? A : B;
  }
  const g = A.call('getChain', { chainId: x.chainId, groupRef: x.ref });
  assert.equal(g.state, 'revealedParticipant');
  const rv = A.call('getReveal', { chainId: x.chainId });
  assert.equal(rv.ok, true);
  assert.equal(rv.steps.length, 6);
  assert.equal(rv.participantCount, 2);
  assert.equal(rv.early, false);
  assert.deepEqual(rv.steps.map((s) => s.mine), [true, false, true, false, true, false]);
  assert.equal(rv.steps[5].text, '外星人在吃披萨');
  assert.ok(rv.steps[0].strokes);
  // outsider: teaser only, no drawings
  const o = outsider.call('getReveal', { chainId: x.chainId });
  assert.deepEqual([o.ok, o.code], [false, 'NOT_PARTICIPANT']);
  assert.deepEqual(o.teaser, { promptId: 'A01', promptText: '小猫吃面条', finalText: '外星人在吃披萨', passed: 6, canSameAgain: true });
  assert.ok(!/strokes/.test(JSON.stringify(o)));
  assert.equal(outsider.call('getChain', { chainId: x.chainId, groupRef: x.ref }).state, 'revealedTeaser');
  // laugh toggles
  assert.equal(B.call('laugh', { chainId: x.chainId, step: 3 }).laughs, 1);
  assert.equal(B.call('laugh', { chainId: x.chainId, step: 3 }).laughs, 0);
  assert.equal(outsider.call('laugh', { chainId: x.chainId, step: 3 }).code, 'NOT_PARTICIPANT');
  // group list
  const gl = outsider.call('getGroupChains', { groupRef: x.ref });
  assert.equal(gl.revealed[0].participant, false);
  assert.equal(gl.stats.revealed, 1);
  assert.equal(gl.stats.drawings, 3);
  assert.ok(!/openid|G1/.test(JSON.stringify(gl)));
});

test('claim collision: second claimant gets TAKEN; expiry reopens; late submit rules (AC 12)', () => {
  const x = started();
  pass1(x);
  const b = x.B.call('claimStep', { chainId: x.chainId, groupRef: x.ref });
  assert.equal(b.ok, true);
  const c = x.C.call('claimStep', { chainId: x.chainId, groupRef: x.ref });
  assert.deepEqual([c.ok, c.code], [false, 'TAKEN']);
  assert.ok(x.C.call('getChain', { chainId: x.chainId, groupRef: x.ref }).claimEtaMs > 0);
  // B resumes the same claim (app restart)
  assert.equal(x.B.call('claimStep', { chainId: x.chainId, groupRef: x.ref }).claimId, b.claimId);
  // after 151 s C can claim; B's submit is then CLAIM_LOST
  x.w.advance(151e3);
  const c2 = x.C.call('claimStep', { chainId: x.chainId, groupRef: x.ref });
  assert.equal(c2.ok, true);
  const lost = x.B.call('submitStep', { chainId: x.chainId, claimId: b.claimId, text: '一只猫' });
  assert.deepEqual([lost.ok, lost.code], [false, 'CLAIM_LOST']);
  // C is late but nobody claimed since: accepted
  x.w.advance(200e3);
  const ok = x.C.call('submitStep', { chainId: x.chainId, claimId: c2.claimId, text: '一只猫在睡觉' });
  assert.equal(ok.state, 'passed');
  // idempotent per claim
  assert.deepEqual(x.C.call('submitStep', { chainId: x.chainId, claimId: c2.claimId, text: '一只猫在睡觉' }), ok);
});

test('text moderation: local rejection, review (no strike), risky (strike), busy; claim kept', () => {
  const x = started();
  pass1(x);
  const b = x.B.call('claimStep', { chainId: x.chainId, groupRef: x.ref });
  const sub = (text) => x.B.call('submitStep', { chainId: x.chainId, claimId: b.claimId, text });
  assert.equal(sub('加我微信').code, 'TEXT_REJECTED');
  assert.equal(sub('测试复审').code, 'TEXT_BLOCKED');
  assert.equal(x.B.call('getHome').me.warnPending, false);
  assert.equal(sub('测试繁忙').code, 'MODERATION_BUSY');
  assert.equal(sub('测试违规').code, 'TEXT_BLOCKED');
  assert.equal(x.B.call('getHome').me.warnPending, true);
  assert.equal(sub('一只猫').state, 'passed'); // still holds the claim, retyped
  const mine = x.B.call('getMyChains', { chainId: x.chainId }).items[0];
  assert.equal(mine.mine.length, 1); // latest attempt of 棒 2
  assert.equal(mine.mine[0].modState, 'passed');
});

test('second strike restricts for 24 h; restricted players cannot start or claim but can open their reveals', () => {
  const x = started();
  pass1(x);
  const b = x.B.call('claimStep', { chainId: x.chainId, groupRef: x.ref });
  x.B.call('submitStep', { chainId: x.chainId, claimId: b.claimId, text: '测试违规' });
  x.B.call('submitStep', { chainId: x.chainId, claimId: b.claimId, text: '测试违规' }); // second strike
  const h = x.B.call('getHome');
  assert.ok(h.me.restriction.until > x.w.t());
  // the current claim may still finish
  assert.equal(x.B.call('submitStep', { chainId: x.chainId, claimId: b.claimId, text: '一只猫' }).state, 'passed');
  assert.equal(x.B.call('createChain', { promptId: 'A02' }).code, 'RESTRICTED');
  assert.equal(x.B.call('claimStep', { chainId: x.chainId, groupRef: x.ref }).code, 'RESTRICTED');
  assert.equal(x.B.call('getMyChains', {}).ok, true);
});

test('drawing moderation: review / risky block and reopen the 棒; no leak while pending (AC 43/44/49)', () => {
  for (const [count, strikes] of [[14, 0], [13, 1]]) {
    const x = started(count);
    const g = x.B.call('getChain', { chainId: x.chainId, groupRef: x.ref });
    assert.equal(g.state, 'pending');
    const mine0 = x.A.call('getMyChains', { chainId: x.chainId }).items[0];
    assert.equal(mine0.status, 'pending');
    assert.equal(mine0.mine[0].modState, 'pending');
    x.w.advance(61 * 1000);
    const g2 = x.B.call('getChain', { chainId: x.chainId, groupRef: x.ref });
    assert.equal(g2.state, 'claimable'); // the 棒 simply reopens; B learns nothing
    assert.equal(g2.nextStep, 1);
    assert.equal(g2.passed, 0);
    const mine = x.A.call('getMyChains', { chainId: x.chainId }).items[0];
    assert.equal(mine.status, 'blocked');
    assert.equal(mine.blockedStep, 1);
    assert.equal(mine.mine[0].modState, 'blocked');
    assert.equal(x.A.call('getHome').me.warnPending, strikes === 1);
    // anyone eligible (including the author) can take 第 1 棒 again; the start was spent
    assert.equal(x.A.call('getHome').me.startsLeft, 2);
    const re = x.B.call('claimStep', { chainId: x.chainId, groupRef: x.ref });
    assert.equal(re.ok, true);
    assert.equal(re.step, 1);
    assert.equal(re.prev.text, '小猫吃面条');
  }
});

test('drawing with no verdict: re-check at 35 min, void at 70 min, no strike, allowance restored (AC 46)', () => {
  const x = started(15);
  x.w.advance(34 * MIN);
  assert.equal(x.B.call('getChain', { chainId: x.chainId, groupRef: x.ref }).state, 'pending');
  x.w.advance(2 * MIN);
  assert.equal(x.B.call('getChain', { chainId: x.chainId, groupRef: x.ref }).state, 'pending');
  assert.equal(x.srv.db.steps[x.chainId + '_1_1'].mod.retries, 1);
  x.w.advance(35 * MIN);
  assert.equal(x.B.call('getChain', { chainId: x.chainId, groupRef: x.ref }).state, 'claimable');
  const mine = x.A.call('getMyChains', { chainId: x.chainId }).items[0];
  assert.equal(mine.mine[0].modState, 'void');
  assert.equal(x.A.call('getHome').me.startsLeft, 3);
  assert.equal(x.A.call('getHome').me.warnPending, false);
  // a late risky verdict adds a strike but changes nothing visible
  x.srv.admin.verdict(x.chainId + '_1_1', 'risky');
  assert.equal(x.A.call('getHome').me.warnPending, true);
  assert.equal(x.B.call('getChain', { chainId: x.chainId, groupRef: x.ref }).state, 'claimable');
});

test('group binding: single chat and other group cannot claim; unbound chain binds on first claim (AC 7/8)', () => {
  const w = world();
  const A = w.user('A');
  const B = w.user('B');
  A.agree();
  B.agree();
  const cr = A.call('createChain', { promptId: 'A01' }); // no group context: unbound
  assert.equal(cr.bound, false);
  A.call('submitStep', { chainId: cr.chainId, claimId: cr.claim.claimId, strokes: drawing(2) });
  w.advance(61e3);
  assert.equal(B.call('claimStep', { chainId: cr.chainId }).code, 'NEED_GROUP');
  assert.equal(B.call('getChain', { chainId: cr.chainId }).state, 'wrongGroup');
  const g2 = B.join('G2');
  const bc = B.call('claimStep', { chainId: cr.chainId, groupRef: g2 });
  assert.equal(bc.ok, true); // binds to G2
  B.call('releaseClaim', { chainId: cr.chainId, claimId: bc.claimId });
  const C = w.user('C');
  C.agree();
  const g1 = C.join('G1');
  assert.equal(C.call('claimStep', { chainId: cr.chainId, groupRef: g1 }).code, 'WRONG_GROUP');
  assert.equal(B.call('joinGroup', { groupData: { mockData: { opengid: 'X', chat_type: 1 } } }).code, 'NOT_GROUP');
});

test('reports hide at once for everyone, reopen the latest 棒, and cancel/release claims (AC 58-61)', () => {
  const x = started();
  pass1(x);
  const b = x.B.call('claimStep', { chainId: x.chainId, groupRef: x.ref });
  // B reports the previous 棒 (drawing 1) from the claim screen
  assert.equal(x.A.call('report', { chainId: x.chainId, step: 1, reason: 'porn' }).code, 'OWN_STEP');
  assert.equal(x.B.call('report', { chainId: x.chainId, step: 1, reason: 'bad' }).code, 'BAD_REASON');
  const r = x.B.call('report', { chainId: x.chainId, step: 1, reason: 'porn' });
  assert.deepEqual([r.ok, r.hidden, r.reopened], [true, true, true]);
  assert.equal(x.B.call('report', { chainId: x.chainId, step: 1, reason: 'porn' }).ok, false);
  // B's claim was cancelled; the 棒 is 第 1 棒 again, and the hidden drawing is not served
  const g = x.B.call('getChain', { chainId: x.chainId, groupRef: x.ref });
  assert.deepEqual([g.state, g.nextStep], ['claimable', 1]);
  assert.equal(x.B.call('submitStep', { chainId: x.chainId, claimId: b.claimId, text: '一只猫' }).code, 'CLAIM_LOST');
  const mine = x.A.call('getMyChains', { chainId: x.chainId }).items[0];
  assert.equal(mine.mine[0].modState, 'hidden');
});

test('report in a revealed chain leaves a placeholder; teaser report hides the whole chain', () => {
  const x = started();
  x.w.advance(61e3);
  x.A.call('getHome');
  // 4 passed then early reveal
  const play = (u, n) => {
    const cl = u.call('claimStep', { chainId: x.chainId, groupRef: x.ref });
    assert.equal(cl.ok, true, cl.code);
    const r = u.call('submitStep', n % 2 === 0 ? { chainId: x.chainId, claimId: cl.claimId, text: '一句话' + n } : { chainId: x.chainId, claimId: cl.claimId, strokes: drawing(2) });
    assert.equal(r.ok, true);
    x.w.advance(61e3);
    u.call('getHome');
  };
  play(x.B, 2);
  play(x.A, 3);
  assert.equal(x.A.call('revealNow', { chainId: x.chainId }).code, 'TOO_EARLY');
  play(x.B, 4);
  assert.equal(x.B.call('revealNow', { chainId: x.chainId }).code, 'NOT_STARTER');
  assert.equal(x.A.call('revealNow', { chainId: x.chainId }).ok, true);
  const rv = x.A.call('getReveal', { chainId: x.chainId });
  assert.equal(rv.early, true);
  assert.equal(rv.passed, 4);
  assert.equal(x.B.call('report', { chainId: x.chainId, step: 3, reason: 'abuse' }).reopened, false);
  const rv2 = x.A.call('getReveal', { chainId: x.chainId });
  assert.equal(rv2.steps[2].placeholder, 'reported');
  assert.ok(!rv2.steps[2].strokes);
  // teaser report
  const t = x.C.call('report', { chainId: x.chainId, step: 0, reason: 'other' });
  assert.equal(t.hidden, true);
  assert.equal(x.A.call('getChain', { chainId: x.chainId }).state, 'removed');
});

test('expiry: 48 h reveals >= 4 passed, expires fewer; participants then see only their own 棒 (AC 17/86)', () => {
  const x = started();
  x.w.advance(61e3);
  x.B.call('getHome');
  const cl = x.B.call('claimStep', { chainId: x.chainId, groupRef: x.ref });
  x.B.call('submitStep', { chainId: x.chainId, claimId: cl.claimId, text: '两个字' });
  x.w.advance(49 * 3600e3);
  const g = x.A.call('getChain', { chainId: x.chainId, groupRef: x.ref });
  assert.equal(g.state, 'expired');
  const mine = x.B.call('getMyChains', { chainId: x.chainId }).items[0];
  assert.equal(mine.status, 'expired');
  assert.equal(mine.mine.length, 1);
  assert.equal(mine.promptText, undefined); // B never saw the prompt
  assert.equal(x.A.call('getMyChains', {}).items[0].promptText, '小猫吃面条'); // the starter did
});

test('author deletion reopens the latest 棒 and removes content; delete all', () => {
  const x = started();
  x.w.advance(61e3);
  x.B.call('getHome');
  const cl = x.B.call('claimStep', { chainId: x.chainId, groupRef: x.ref });
  x.B.call('submitStep', { chainId: x.chainId, claimId: cl.claimId, text: '两个字' });
  const d = x.B.call('deleteMyStep', { chainId: x.chainId, step: 2 });
  assert.equal(d.count, 1);
  assert.equal(x.srv.db.steps[x.chainId + '_2_1'].text, undefined);
  const g = x.C.call('getChain', { chainId: x.chainId, groupRef: x.ref });
  assert.deepEqual([g.state, g.nextStep, g.passed], ['claimable', 2, 1]);
  assert.equal(x.A.call('deleteMyStep', { all: true }).count, 1);
});

test('kill switches and removal (AC 53/54/64)', () => {
  const x = started();
  x.w.advance(61e3);
  x.srv.admin.setUgc({ viewEnabled: false });
  const cl = x.B.call('claimStep', { chainId: x.chainId, groupRef: x.ref });
  assert.equal(cl.prev.kind, 'paused');
  x.B.call('releaseClaim', { chainId: x.chainId, claimId: cl.claimId });
  x.srv.admin.setUgc({ viewEnabled: true, createEnabled: false });
  assert.equal(x.B.call('claimStep', { chainId: x.chainId, groupRef: x.ref }).code, 'UGC_PAUSED');
  assert.equal(x.A.call('createChain', { promptId: 'A01' }).code, 'UGC_PAUSED');
  x.srv.admin.setUgc({ createEnabled: true });
  x.srv.admin.removeChain(x.chainId);
  assert.equal(x.B.call('getChain', { chainId: x.chainId }).state, 'removed');
  assert.equal(x.B.call('claimStep', { chainId: x.chainId, groupRef: x.ref }).code, 'CHAIN_CLOSED');
});

test('custom prompts are moderated before the chain exists (AC 40) and offline mode', () => {
  const w = world();
  const A = w.user('A');
  A.agree();
  assert.equal(A.call('createChain', { customText: '加我微信' }).code, 'TEXT_REJECTED');
  assert.equal(A.call('createChain', { customText: '测试违规' }).code, 'TEXT_BLOCKED');
  assert.equal(A.call('createChain', { customText: '测试繁忙' }).code, 'MODERATION_BUSY');
  assert.equal(Object.keys(w.srv.db.chains).length, 0);
  const ok = A.call('createChain', { customText: '我家的小猫' });
  assert.equal(ok.claim.sourceText, '我家的小猫');
  assert.equal(w.srv.db.chains[ok.chainId].custom, true);
  assert.equal(A.call('getChain', { chainId: ok.chainId }).canSameAgain, false);
  w.srv.offline = true;
  assert.equal(A.call('getHome').code, 'NETWORK');
});

test('INVALID_STROKES, BAD_KIND, step cap and the 5 digit rule are enforced server-side', () => {
  const w = world();
  const A = w.user('A');
  A.agree();
  const cr = A.call('createChain', { promptId: 'A01' });
  const base = { chainId: cr.chainId, claimId: cr.claim.claimId };
  assert.equal(A.call('submitStep', Object.assign({ text: '一只猫' }, base)).code, 'BAD_KIND'); // text for a draw 棒
  assert.equal(A.call('submitStep', Object.assign({ strokes: { v: 1, s: [[99, 0, 1, 1]] } }, base)).code, 'INVALID_STROKES');
  assert.equal(A.call('submitStep', Object.assign({ strokes: drawing(2), text: 'x' }, base)).code, 'BAD_KIND');
  assert.equal(A.call('submitStep', Object.assign({ strokes: drawing(2) }, base)).state, 'pending');
});

test('server rasterises and counts the PNG when enabled (PO-10)', () => {
  const srv = createMockServer({ now: () => T0 });
  const A = srv.as('A');
  A.call('agreeRules', { version: 1 });
  const cr = A.call('createChain', { promptId: 'A01' });
  A.call('submitStep', { chainId: cr.chainId, claimId: cr.claim.claimId, strokes: drawing(3) });
  assert.ok(srv.db.steps[cr.chainId + '_1_1'].pngBytes > 100000);
});
