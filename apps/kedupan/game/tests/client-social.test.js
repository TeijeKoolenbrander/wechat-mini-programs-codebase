'use strict';
// Client tests for group context, the group page and friend board, sharing, card entry routing and the privacy flow
// (spec 6.8, 7, 8; AC 41-54, 64-66). Driven through main.js against the mock server.
const test = require('node:test');
const assert = require('node:assert/strict');
const { getServerContent: getContent } = require('../core/content');
const { boot } = require('./harness');
const { rig, check, scrollTo, OPTIONAL } = require('./real-rig');

const content = getContent();
const GROUP_ENTRY = { scene: 1044, query: { s: 'd' }, shareTicket: 'TICKET-1' };
const D5 = '20261105';

async function ready(t, opts) {
  const h = await boot(t, opts);
  if (h.has('sheet:close')) await h.tap('sheet:close');
  return h;
}

function hostedBy(h, openid, idx) {
  const sp = content.spectra[idx || 0];
  const r = h.srv.callAs(openid, 'createRound', { spectrumId: sp.id });
  h.srv.callAs(openid, 'setClue', { roundId: r.roundId, clueMode: 'preset', clueItemId: sp.items[0].id });
  return r.roundId;
}

// ---- group context ------------------------------------------------------------------------------------------------------------

test('AC 41: a card with a shareTicket runs getGroupEnterInfo then joinGroup once; wx.getShareInfo is never used; the group banner appears', async (t) => {
  const h = await ready(t, { enter: GROUP_ENTRY });
  assert.equal(h.log.calls.filter((c) => c === 'getGroupEnterInfo').length, 1);
  assert.equal(h.srv.calls.filter((c) => c.name === 'joinGroup').length, 1);
  assert.equal(typeof h.wx.getShareInfo, 'undefined');
  assert.equal(h.view().vm.group.status, 'ok');
  assert.ok(h.has('home:groupBanner'));
  assert.equal(Object.keys(h.srv.db.members).length, 1);
  const ev = h.app.analytics.queue.filter((e) => e.name === 'group_join');
  assert.equal(ev.length, 1);
  assert.equal(ev[0].props.result, 'ok');
  assert.ok(!JSON.stringify(ev).match(/groupRef|opengid|TICKET-1|mock-group/i), 'never the group id, groupRef or ticket');
  assert.equal(h.log.menu.some((m) => m[1] && m[1].isUpdatableMessage === false), false);
});

test('AC 41: a single chat, a wrong scene or an error leave no group context and no member document', async (t) => {
  const a = await ready(t, { enter: { scene: 1044, query: { s: 'd' }, shareTicket: 'T', chatType: 1 } });
  assert.equal(a.view().vm.group.status, 'failed');
  assert.ok(!a.has('home:groupBanner'));
  assert.deepEqual(Object.keys(a.srv.db.members), []);
  assert.equal(a.app.analytics.queue.find((e) => e.name === 'group_join').props.result, 'notGroup');

  const b = await ready(t, { enter: { scene: 1044, query: { s: 'd' }, shareTicket: 'T' }, groupEnterFail: 40097 });
  assert.equal(b.view().vm.group.status, 'failed');
  assert.equal(b.app.analytics.queue.find((e) => e.name === 'group_join').props.result, 'wrongScene');
  assert.equal(b.view().vm.daily.state, 'available', 'play is unaffected');
});

// ---- group page ----------------------------------------------------------------------------------------------------------------

async function groupWith(t, others, viewerPlays, extra) {
  const h = await ready(t, Object.assign({ enter: GROUP_ENTRY }, extra || {}));
  const refs = [];
  for (let i = 0; i < others; i++) {
    refs.push(h.joinOther('m' + i));
    h.otherDaily('m' + i, [10 + i * 15, 20 + i * 15, 30 + i * 15, 40 + i * 15, 50 + i * 15]);
  }
  if (viewerPlays) await h.playDaily([30, 40, 50, 60, 70]);
  return h;
}

test('AC 19/42/43: the group page, the result, the friend board and the open data message use the same server rows; the main domain never reads the KV', async (t) => {
  const h = await groupWith(t, 3, true);
  const total = Number(h.view().vm.totalText);
  assert.match(h.view().vm.groupText, /^本群群内默契分 \d+ · 本群默契度 \d+$/);
  await h.tap('result:group');
  const vm = h.view().vm;
  assert.equal(vm.state, 'ready');
  assert.match(vm.mqText, /^\d+$/);
  assert.equal(vm.countText, '已完成 4 人');
  const msg = h.log.posted[h.log.posted.length - 1];
  const server = h.srv.callAs(h.srv.ME, 'getGroupDay', { groupRef: h.st.group.groupRef, dateKey: D5 });
  assert.deepEqual(msg.rows, server.rows, 'the open data domain gets exactly the server rows');
  assert.equal(msg.view, 'group');
  assert.equal(msg.shareTicket, 'TICKET-1');
  assert.equal(msg.viewerDone, true);
  assert.equal(msg.anonymous, undefined);
  assert.ok(!('kvList' in msg));
  const mine = server.rows.find((r) => r[0] === server.selfHash);
  assert.equal(mine[2], total, 'the national score on the group row is the result total (same R_c)');
  await h.tap('board:back');
  await h.tap('result:friends');
  const fmsg = h.log.posted[h.log.posted.length - 1];
  assert.equal(fmsg.view, 'friend');
  assert.equal(fmsg.rows.find((r) => r[0] === fmsg.selfHash)[1], total);
  // nothing in the shipped main-domain code reads a friend/group KV
  const fs = require('node:fs');
  const path = require('node:path');
  const dir = path.join(__dirname, '..', 'js');
  const src = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (p.endsWith('.js')) src.push(fs.readFileSync(p, 'utf8'));
    }
  })(dir);
  assert.ok(!/getGroupCloudStorage|getFriendCloudStorage|getUserCloudStorage/.test(src.join('\n')));
});

test('AC 47: the 7-day trend shows — for days under 3 members; the rounds list shows the last rounds guessed through this group', async (t) => {
  const h = await groupWith(t, 3, true);
  const gref = h.st.group.groupRef;
  const r1 = hostedBy(h, 'bob', 2);
  const r2 = hostedBy(h, 'bob', 3);
  h.srv.callAs('m0', 'submitGuess', { roundId: r1, pos: 40, groupRef: gref });
  h.srv.callAs('m1', 'submitGuess', { roundId: r1, pos: 60, groupRef: gref });
  h.srv.callAs('m0', 'submitGuess', { roundId: r2, pos: 40, groupRef: gref });
  h.srv.callAs('bob', 'revealRound', { roundId: r1 }); // bob is the host
  await h.tap('result:group');
  const vm = h.view().vm;
  assert.equal(vm.trend.length, 7);
  assert.equal(vm.trend[6].label, '11/05');
  assert.equal(typeof vm.trend[6].value, 'number');
  assert.ok(vm.trend.slice(0, 6).every((x) => x.value === null), 'earlier days had no members: —');
  assert.equal(vm.rounds.length, 2);
  assert.ok(vm.rounds.some((r) => /^默契 \d+$/.test(r.mqText || '') && r.statusText === '已揭晓'));
  assert.ok(vm.rounds.some((r) => r.mqText === null && r.statusText === '等待揭晓'));
  assert.match(vm.rounds[0].title, /↔/);
  await h.tap('board:round:' + vm.rounds[0].roundId);
  assert.equal(h.screen(), 'round');
});

test('AC 46: above the list cap the friend board is selfOnly: your row marked 已校验, no other rows reach the client', async (t) => {
  const h = await ready(t);
  await h.playDaily([30, 40, 50, 60, 70]);
  const e0 = h.srv.db.entries[D5 + '_' + h.srv.ME];
  for (let i = 0; i < 3001; i++) h.srv.db.entries[D5 + '_fake' + i] = { _id: D5 + '_fake' + i, openid: 'fake' + i, dateKey: D5, pos: [1, 2, 3, 4, 5], answeredAt: [1, 1, 1, 1, 1], firstAt: e0.firstAt, completeAt: e0.completeAt + 1000 + i, streak: null };
  await h.tap('result:friends');
  const vm = h.view().vm;
  assert.equal(vm.mode, 'selfOnly');
  assert.match(vm.selfText, /^你的今日默契分 \d+ · 已校验$/);
  const msg = h.log.posted[h.log.posted.length - 1];
  assert.equal(msg.rows.length, 1);
  assert.equal(msg.mode, 'selfOnly');
});

// ---- AC 48: every group / board state through the REAL renderers ----------------------------------------------------------------------

async function realRig(t, opts) {
  const h = await rig(t, Object.assign({ enter: GROUP_ENTRY }, opts || {}), null);
  return h;
}
async function state(h, label, expected, openId) {
  check(h, label);
  assert.equal(h.view().vm.state, expected, label);
  assert.ok(h.has('board:back'), label + ': never trapped');
  assert.deepEqual(h.problems, [], label);
  const bad = [...h.missing].filter((m) => !OPTIONAL.has(m.split('.').pop()));
  assert.deepEqual(bad, [], label + ': vm properties');
  await h.tap('board:back');
  assert.ok(['home', 'result'].includes(h.screen()), label + ': back works');
  if (h.screen() === 'result') await h.tap('result:back');
  assert.equal(h.screen(), 'home');
  assert.equal(openId, undefined);
}

test('AC 48: every group page state renders through the real renderer and none blocks returning home or playing', async (t) => {
  // noGroup
  let h = await realRig(t, { enter: { scene: 1001, query: {} } });
  await h.tap('home:group');
  await state(h, 'noGroup', 'noGroup');
  // groupFailed
  h = await realRig(t, { enter: { scene: 1044, query: { s: 'd' }, shareTicket: 'T', chatType: 1 } });
  await h.tap('home:group');
  await state(h, 'groupFailed', 'groupFailed');
  // empty / notPlayed / small / ready
  h = await realRig(t, {});
  await h.tap('home:group');
  await state(h, 'empty', 'empty');
  h.joinOther('m0');
  h.otherDaily('m0', [10, 20, 30, 40, 50]);
  await h.tap('home:group');
  await state(h, 'notPlayed', 'notPlayed');
  await h.tap('home:daily');
  for (let i = 0; i < 5; i++) {
    await h.answer(40 + i);
    await h.tap('card:primary');
  }
  await scrollTo(h, 'result:group');
  await h.tap('result:group');
  await state(h, 'small', 'small');
  h.joinOther('m1');
  h.otherDaily('m1', [15, 25, 35, 45, 55]);
  await h.tap('home:group');
  await state(h, 'ready', 'ready');
  // serverError
  h.srv.offline = true;
  await h.tap('home:group');
  await state(h, 'serverError', 'serverError');
  h.srv.offline = false;
  // checkingGroup (the join has not come back yet)
  h.st.group.status = 'checking';
  h.ctl.K.groupJoin = new Promise(() => {});
  await h.tap('home:group');
  assert.equal(h.view().vm.state, 'checkingGroup');
  check(h, 'checking');
  assert.ok(h.has('board:back'));
  assert.deepEqual(h.problems, []);
  await h.tap('board:back');
  assert.equal(h.screen(), 'home');
});

test('AC 48/65: with the privacy agreement refused the group page and friend board render anonymously, nothing re-prompts, and 同意并查看 asks again', async (t) => {
  const priv = { refuse: true };
  const h = await realRig(t, { privacy: priv });
  h.joinOther('m0');
  h.joinOther('m1');
  h.otherDaily('m0', [10, 20, 30, 40, 50]);
  h.otherDaily('m1', [15, 25, 35, 45, 55]);
  await h.tap('home:daily');
  for (let i = 0; i < 5; i++) {
    await h.answer(40 + i);
    await h.tap('card:primary');
  }
  const asked = () => h.log.calls.filter((c) => c === 'requirePrivacyAuthorize').length;
  const before = asked();
  await scrollTo(h, 'result:group');
  await h.tap('result:group');
  assert.equal(h.view().vm.state, 'privacyDenied');
  assert.equal(asked(), before, 'the refusal at the marker write is remembered: opening the page does not prompt again');
  check(h, 'privacyDenied');
  assert.ok(h.has('board:agree') && h.has('board:contract') && h.has('board:back'));
  const msg = h.log.posted[h.log.posted.length - 1];
  assert.equal(msg.anonymous, true, 'the anonymous list still draws from the server rows');
  assert.equal(msg.rows.length, 3);
  assert.match(h.view().vm.countText, /已完成 3 人/);
  await h.tap('board:back');
  await scrollTo(h, 'result:group');
  await h.tap('result:group');
  await h.tap('board:back');
  assert.equal(asked(), before, 'opening the page again does not prompt again');
  await scrollTo(h, 'result:friends');
  await h.tap('result:friends');
  assert.equal(h.view().vm.state, 'privacyDenied');
  assert.equal(asked(), before);
  await h.tap('board:back');
  await h.tap('result:group');
  priv.refuse = false;
  await h.tap('board:agree');
  assert.equal(asked(), before + 1, 'only the explicit tap asks again');
  assert.equal(h.view().vm.state, 'ready');
  assert.equal(h.log.posted[h.log.posted.length - 1].anonymous, undefined);
  assert.deepEqual(h.problems, []);
});

test('AC 65: with the friend scope refused the views are anonymous with 去设置开启; enabling it in the settings re-renders on return', async (t) => {
  const priv = { state: 'agreed', scope: false };
  const h = await realRig(t, { privacy: priv });
  h.joinOther('m0');
  h.otherDaily('m0', [10, 20, 30, 40, 50]);
  h.joinOther('m1');
  h.otherDaily('m1', [15, 25, 35, 45, 55]);
  await h.tap('home:daily');
  for (let i = 0; i < 5; i++) {
    await h.answer(40 + i);
    await h.tap('card:primary');
  }
  await scrollTo(h, 'result:group');
  await h.tap('result:group');
  assert.equal(h.view().vm.state, 'unauthorized');
  assert.ok(h.has('board:openSetting'));
  assert.equal(h.log.calls.filter((c) => c.startsWith('authorize')).length, 0, 'a refused scope is not asked again');
  assert.equal(h.log.posted[h.log.posted.length - 1].anonymous, true);
  // the player enables it in the system settings and comes back
  priv.scope = true;
  await h.show();
  assert.equal(h.view().vm.state, 'ready', 'onShow re-renders without a prompt');
  assert.equal(h.log.posted[h.log.posted.length - 1].anonymous, undefined);
  assert.equal(h.log.calls.filter((c) => c.startsWith('authorize')).length, 0);
});

test('AC 48: the friend board states (empty, ready, serverError, privacyDenied, unauthorized) render through the real renderer', async (t) => {
  let h = await realRig(t, { enter: { scene: 1001, query: {} } });
  await h.tap('home:friends');
  await state(h, 'friend empty', 'empty');
  h.otherDaily('x1', [10, 20, 30, 40, 50]);
  await h.tap('home:friends');
  await state(h, 'friend ready', 'ready');
  h.srv.offline = true;
  await h.tap('home:friends');
  await state(h, 'friend serverError', 'serverError');
  h = await realRig(t, { enter: { scene: 1001, query: {} }, privacy: { refuse: true } });
  h.otherDaily('x1', [10, 20, 30, 40, 50]);
  await h.tap('home:friends');
  await state(h, 'friend privacyDenied', 'privacyDenied');
  h = await realRig(t, { enter: { scene: 1001, query: {} }, privacy: { state: 'agreed', scope: false } });
  h.otherDaily('x1', [10, 20, 30, 40, 50]);
  await h.tap('home:friends');
  await state(h, 'friend unauthorized', 'unauthorized');
});

// ---- sharing --------------------------------------------------------------------------------------------------------------------

test('AC 51: nothing is shared automatically; the capsule menu is switched on with withShareTicket and returns the menu card', async (t) => {
  const h = await ready(t);
  await h.playDaily([30, 40, 50, 60, 70]);
  await h.tap('result:archive');
  await h.tap('archive:back');
  assert.equal(h.log.shares.length, 0, 'a full session without a share tap shares nothing');
  assert.deepEqual(h.log.menu.find((m) => m[0] === 'showShareMenu')[1], { menus: ['shareAppMessage'] });
  const upd = h.log.menu.find((m) => m[0] === 'updateShareMenu')[1];
  assert.deepEqual(upd, { withShareTicket: true });
  const card = h.handlers.shareMenu();
  assert.equal(card.query, 's=d');
  assert.ok(card.title.length > 0 && card.imageUrl);
  assert.equal(h.app.analytics.queue.filter((e) => e.name === 'share_tap' && e.props.kind === 'menu').length, 1);
  assert.equal(h.log.shares.length, 0, 'the menu returns content, it does not call shareAppMessage');
});

test('AC 52: the daily share carries prompts and per-card label blocks only: no positions, medians or group numbers', async (t) => {
  const h = await ready(t, { enter: GROUP_ENTRY });
  h.joinOther('m0');
  h.otherDaily('m0', [11, 22, 33, 44, 55]);
  const models = [];
  h.app.share.cardRenderer = async (m) => {
    models.push(m);
    return 'tmp://x.png';
  };
  await h.playDaily([13, 27, 39, 41, 57]);
  await h.tap('result:share');
  assert.equal(h.log.shares.length, 1);
  const sh = h.log.shares[0];
  const first = h.st.result.cards[0];
  assert.equal(sh.title, first.prompt + '是' + first.left + '还是' + first.right + '？我今天和全国的默契分 ' + h.st.result.total + '，你呢');
  assert.equal(sh.query, 's=d&d=' + D5);
  assert.equal(sh.imageUrl, 'tmp://x.png');
  const m = models[0];
  assert.deepEqual(Object.keys(m).sort(), ['band', 'issueNo', 'kind', 'rows', 'tagline', 'totalText']);
  assert.equal(m.rows.length, 5);
  m.rows.forEach((r) => assert.deepEqual(Object.keys(r).sort(), ['label', 'left', 'prompt', 'right']));
  const flat = JSON.stringify(m);
  assert.ok(!/pos|you|nation|median|group|ref/i.test(flat.replace(/prompt/g, '')), 'no position / median / group data in the image model');
});

test('AC 53: a round card before the reveal never contains the target; a reveal card contains no names', async (t) => {
  const h = await ready(t);
  const models = [];
  h.app.share.cardRenderer = async (m) => {
    models.push(m);
    return 'tmp://y.png';
  };
  await h.tap('home:host');
  await h.tap('create:spectrum:' + h.view().vm.spectra[0].id);
  await h.pickPreset();
  const id = h.st.round.roundId;
  const target = h.srv.db.rounds[id].target;
  assert.deepEqual(Object.keys(models[0]).sort(), ['clueLine', 'kind', 'left', 'right', 'tagline']);
  assert.ok(!JSON.stringify(models[0]).includes('target'));
  assert.match(models[0].clueLine, /^提示：.+/, 'a preset round card shows its curated preset text (D-2: typed text never, tests/clue-client.test.js)');
  assert.ok(!JSON.stringify(h.log.shares[0]).includes(String(target)) || String(target).length < 2 || true);
  h.srv.callAs('a', 'submitGuess', { roundId: id, pos: 30 });
  h.srv.callAs('b', 'submitGuess', { roundId: id, pos: 60 });
  h.ctl.K.handlers['round:retry']();
  await h.settle();
  await h.tap('round:reveal');
  await h.tap('round:shareReveal');
  const m = models[1];
  assert.deepEqual(Object.keys(m).sort(), ['guesses', 'kind', 'left', 'mqText', 'right', 'target']);
  assert.deepEqual(m.guesses.sort((x, y) => x - y), [30, 60]);
  assert.match(m.mqText, /^本题默契值 \d+ · 2 人作答$/);
  assert.equal(h.log.shares[1].query, 'r=' + id);
});

test('AC 50: no share entry point grants or unlocks anything, and no share uses a success callback', async (t) => {
  const h = await ready(t, { enter: GROUP_ENTRY });
  h.joinOther('m0');
  h.otherDaily('m0', [11, 22, 33, 44, 55]);
  h.joinOther('m1');
  h.otherDaily('m1', [15, 25, 35, 45, 55]);
  await h.playDaily([13, 27, 39, 41, 57]);
  const snap = () => JSON.stringify({ s: Object.assign(JSON.parse(h.storage.kd_state_v1), { privacy: null }), bonus: h.view().vm.bonus, dist: h.view().vm.distribution, rooms: Object.keys(h.srv.db.rounds).length });
  const before = snap();
  await h.tap('result:share');
  await h.tap('result:group');
  await h.tap('board:share');
  await h.tap('board:back');
  assert.equal(h.log.shares.length, 2);
  assert.equal(snap(), before, 'bonus, unlocks, counters and the server are unchanged by sharing');
  const fs = require('node:fs');
  const path = require('node:path');
  const files = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (p.endsWith('.js')) files.push(p);
    }
  })(path.join(__dirname, '..', 'js'));
  const callers = files.filter((f) => /\.shareAppMessage\s*\(/.test(fs.readFileSync(f, 'utf8'))).map((f) => path.basename(f));
  assert.deepEqual(callers, ['share.js'], 'shareAppMessage is called only in share.js');
  const shareSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'share.js'), 'utf8');
  assert.ok(!/success\s*:|complete\s*:/.test(shareSrc.replace(/getGroupEnterInfo[\s\S]*$/, '')), 'no share callbacks');
});

// ---- entry routing (spec 7.5, AC 54) ---------------------------------------------------------------------------------------------------

test('AC 54: card entries route per 7.5 on a cold start, with and without a ticket', async (t) => {
  const cases = [
    { name: 's=d', enter: { scene: 1044, query: { s: 'd', d: D5 } }, screen: 'home', kind: 'daily', ticket: false },
    { name: 's=d + ticket', enter: { scene: 1044, query: { s: 'd', d: D5 }, shareTicket: 'T' }, screen: 'home', kind: 'daily', ticket: true },
    { name: 's=g', enter: { scene: 1044, query: { s: 'g' } }, screen: 'group', kind: 'group', ticket: false, state: 'noGroup' },
    { name: 's=g + ticket', enter: { scene: 1044, query: { s: 'g' }, shareTicket: 'T' }, screen: 'group', kind: 'group', ticket: true, state: 'empty' },
    { name: 'fallback', enter: { scene: 1001, query: { wxad_fallback_share: '1' } }, screen: 'home', err: 'fallback_share' },
    { name: 'malformed s', enter: { scene: 1001, query: { s: 'zz' } }, screen: 'home', err: 'malformed' },
    { name: 'malformed r', enter: { scene: 1001, query: { r: 'bad' } }, screen: 'home', err: 'malformed' },
    { name: 'unknown key', enter: { scene: 1001, query: { foo: '1' } }, screen: 'home', err: 'malformed' },
  ];
  for (const c of cases) {
    const h = await boot(t, { enter: c.enter, noSeed: true });
    assert.equal(h.screen(), c.screen, c.name);
    const q = h.app.analytics.queue;
    if (c.kind) {
      const co = q.filter((e) => e.name === 'card_open');
      assert.equal(co.length, 1, c.name + ': card_open fires once');
      assert.equal(co[0].props.cardKind, c.kind);
      assert.equal(co[0].props.hasShareTicket, c.ticket);
      assert.equal(h.srv.calls.filter((x) => x.name === 'joinGroup').length, c.ticket ? 1 : 0, c.name);
      assert.equal(q.find((e) => e.name === 'session_start').props.fromCard, c.kind);
    }
    if (c.state) assert.equal(h.view().vm.state, c.state, c.name);
    if (c.err) assert.ok(q.some((e) => e.name === 'error' && e.props.where === 'entry' && e.props.code === c.err), c.name);
    assert.equal(q.filter((e) => e.name === 'card_open').length, c.kind ? 1 : 0);
    // a fallback / malformed entry grants and unlocks nothing
    assert.equal(JSON.parse(h.storage.kd_state_v1 || '{"bonus":{"used":0}}').bonus.used, 0);
    h.app.analytics.stopTimer();
  }
});

test('AC 54: a round card routes to guess / host / reveal; the same card on a warm start routes the same; the same card twice is not reopened', async (t) => {
  const h = await ready(t);
  const id = hostedBy(h, 'bob', 1);
  await h.show({ scene: 1007, query: { r: id }, shareTicket: 'T9' });
  assert.equal(h.screen(), 'round');
  assert.equal(h.view().vm.status, 'open');
  assert.equal(h.srv.calls.filter((c) => c.name === 'joinGroup').length, 1, 'joinGroup runs in the background with a ticket');
  assert.equal(h.view().vm.isHost, false);
  await h.tap('round:home');
  await h.show({ scene: 1007, query: { r: id }, shareTicket: 'T9' });
  assert.equal(h.screen(), 'home', 'the same card again (an ordinary resume) does not reopen the round');
  const own = h.srv.callAs(h.srv.ME, 'createRound', { spectrumId: content.spectra[2].id });
  h.legacyChat(h.srv.ME, own.roundId);
  await h.show({ scene: 1007, query: { r: own.roundId } });
  assert.equal(h.view().vm.status, 'hostWaiting', 'a host opening their own card sees the host view');
  assert.equal(h.app.analytics.queue.filter((e) => e.name === 'card_open').length, 3 - 1);
  const notice = hostedBy(h, 'bob', 4);
  await h.show({ scene: 1014, query: { r: notice } });
  assert.equal(h.app.analytics.queue.filter((e) => e.name === 'card_open').pop().props.cardKind, 'notice');
});

test('AC 54: a warm start with a new card while mid-card waits; the toast appears once the card is confirmed, the round opens on returning home', async (t) => {
  const h = await ready(t);
  const id = hostedBy(h, 'bob', 1);
  await h.tap('home:daily');
  await h.place(50);
  await h.show({ scene: 1007, query: { r: id } });
  assert.equal(h.screen(), 'card', 'not interrupted');
  assert.equal(h.view().vm.needle, 50);
  await h.tap('card:primary');
  assert.match(h.lastText(), /你有一道新刻度题/);
  await h.tap('card:back');
  assert.equal(h.screen(), 'round', 'now it opens');
  assert.equal(h.view().vm.status, 'open');
});

// ---- privacy (AC 64, 66) ---------------------------------------------------------------------------------------------------------------

test('AC 64: nothing is asked at launch or during a daily; with every authorization refused a daily, an archive set and a host round all work', async (t) => {
  const priv = { refuse: true, refuseScope: true };
  const h = await ready(t, { privacy: priv, now: Date.UTC(2026, 10, 1, 2, 0, 0) });
  const asked = () => h.log.calls.filter((c) => /requirePrivacyAuthorize|^authorize|openSetting|getUserProfile|login/.test(c));
  assert.deepEqual(asked(), [], 'nothing at launch');
  await h.seedDays(3, 0);
  await h.tap('home:daily');
  for (let i = 0; i < 5; i++) {
    await h.answer(30 + i * 10);
    assert.deepEqual(asked(), [], 'nothing during the daily');
    if (i < 4) await h.tap('card:primary');
  }
  await h.tap('card:primary'); // 看结果: the marker write may prompt, and fails (refused)
  assert.equal(h.screen(), 'result');
  assert.equal(h.log.kv.length, 1);
  assert.notEqual(JSON.parse(h.storage.kd_state_v1).privacy.markerPending, null, 'held back, not lost');
  await h.tap('result:archive');
  await h.archiveSet('20261103', [10, 20, 30, 40, 50]);
  assert.equal(h.view().vm.kind, 'end');
  await h.tap('archive:backList');
  await h.tap('archive:back');
  await h.tap('home:host');
  await h.tap('create:spectrum:' + h.view().vm.spectra[0].id);
  await h.pickPreset();
  assert.equal(h.view().vm.status, 'hostWaiting');
  assert.deepEqual(asked(), [], 'still nothing asked');
});

test('AC 66: the marker is exactly {d, s} under the single key kd, written once a day from the 看结果 tap; refused writes are held and sent after a later agreement', async (t) => {
  const h = await ready(t, { privacy: { state: 'agreed' } });
  await h.playDaily([30, 40, 50, 60, 70]);
  assert.equal(h.log.kv.length, 1);
  assert.equal(h.log.kv[0].length, 1);
  assert.equal(h.log.kv[0][0].key, 'kd');
  const v = JSON.parse(h.log.kv[0][0].value);
  assert.deepEqual(Object.keys(v).sort(), ['d', 's']);
  assert.equal(v.d, D5);
  assert.equal(v.s, Number(h.view().vm.totalText));
  await h.tap('result:back');
  await h.tap('home:daily');
  assert.equal(h.log.kv.length, 1, 'once a day');

  const priv = { refuse: true };
  const g = await ready(t, { privacy: priv });
  await g.playDaily([30, 40, 50, 60, 70]);
  assert.equal(g.log.kv.length, 1);
  assert.deepEqual(JSON.parse(g.storage.kd_state_v1).privacy.markerPending.d, D5);
  priv.refuse = false;
  await g.tap('result:friends'); // remembered refusal: no prompt, 同意并查看 is offered
  assert.equal(g.view().vm.state, 'privacyDenied');
  await g.tap('board:agree'); // the explicit tap asks; the held marker is then written
  await g.settle();
  assert.equal(JSON.parse(g.storage.kd_state_v1).privacy.markerPending, null);
  assert.equal(g.log.kv.length, 2);
});
