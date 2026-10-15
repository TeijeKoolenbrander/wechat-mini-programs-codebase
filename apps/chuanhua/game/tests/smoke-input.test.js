'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { makeClient, enableClock } = require('./harness');
const { createMockServer } = require('../js/mock-server');
const S = require('../core/strokes');

const ENTER = (chainId, ticket) => ({ scene: 1044, query: { k: chainId }, shareTicket: ticket || 'ticket', chatType: 3 });
const drawing = (n) => {
  const d = S.emptyDrawing();
  for (let i = 0; i < n; i++) d.s.push(S.makeStroke(i % 6, 1, [[10 + i, 10], [100 + i, 200], [300, 300 + i]]));
  return d;
};

function world(t) {
  enableClock(t);
  const srv = createMockServer({ now: () => Date.now(), rasterize: false });
  return { srv, adv: (ms) => (t.mock.timers.tick(ms), srv.sweep()) };
}
const agree = (srv, id) => srv.call('agreeRules', { version: 1 }, id);

function seed(w) {
  agree(w.srv, 'S0');
  const ref = w.srv.call('joinGroup', { groupData: { cloudID: 'x', data: { opengid: 'G1', chat_type: 3 } } }, 'S0').groupRef;
  const cr = w.srv.call('createChain', { promptId: 'A01', groupRef: ref }, 'S0');
  w.srv.call('submitStep', { chainId: cr.chainId, claimId: cr.claim.claimId, strokes: drawing(2) }, 'S0');
  w.adv(61e3);
  return cr.chainId;
}

test('keyboard fallback (V4): without the mini game keyboard the describe step uses the editable modal and submits on confirm', async (t) => {
  const w = world(t);
  const chainId = seed(w);
  agree(w.srv, 'K');
  const K = makeClient(t, w.srv, 'K', { keyboard: false, modalInput: '一只猫在睡觉' });
  await K.ctl.start(ENTER(chainId, 'tk'));
  await K.settle();
  K.tapId('entry:claim');
  await K.settle();
  assert.equal(K.log.modals.length, 1);
  assert.equal(K.log.modals[0].editable, true);
  assert.equal(K.screen(), 'sent'); // the modal confirmed with text, which submitted
  assert.equal(w.srv.db.steps[chainId + '_2_1'].text, '一只猫在睡觉');
});

test('keyboard: showKeyboard failing falls back to the modal; confirm key on the keyboard submits', async (t) => {
  const w = world(t);
  const chainId = seed(w);
  agree(w.srv, 'K');
  const K = makeClient(t, w.srv, 'K', { modalInput: '换成弹窗输入' });
  K.wx.showKeyboard = (o) => o.fail({ errMsg: 'fail' });
  await K.ctl.start(ENTER(chainId, 'tk'));
  await K.settle();
  K.tapId('entry:claim');
  await K.settle();
  assert.equal(K.log.modals.length, 1);
  assert.equal(K.screen(), 'sent');
  // the normal keyboard: the confirm key submits
  const w2 = world(t);
  const c2 = seed(w2);
  agree(w2.srv, 'K2');
  const K2 = makeClient(t, w2.srv, 'K2');
  await K2.ctl.start(ENTER(c2, 'tk2'));
  await K2.settle();
  K2.tapId('entry:claim');
  await K2.settle();
  assert.equal(K2.log.keyboardOpens.length, 1);
  assert.equal(K2.log.keyboardOpens[0].maxLength, 16);
  K2.type('一只猫在开出租车');
  K2.handlers.kbConfirm({ value: '一只猫在开出租车' });
  await K2.settle();
  assert.equal(K2.screen(), 'sent');
});

test('capsule menu share: the context follows the screen (invite for an open chain), id-only queries', async (t) => {
  const w = world(t);
  agree(w.srv, 'S1');
  const S1 = makeClient(t, w.srv, 'S1');
  await S1.ctl.start({ scene: 1001, query: {} });
  await S1.settle();
  S1.tapId('sheet:close');
  S1.tapId('home:start');
  await S1.settle();
  S1.tapId('picker:start');
  await S1.settle();
  S1.strokes(2);
  t.mock.timers.tick(300);
  S1.tapId('draw:submit');
  await S1.settle();
  const chainId = Object.keys(w.srv.db.chains)[0];
  let r = S1.handlers.shareMenu();
  assert.deepEqual([r.query, r.title], ['k=' + chainId, '第 2 棒等你接，看看你能猜出什么？']);
  assert.ok(S1.log.menu.some((m) => m[0] === 'showShareMenu' && m[1].menus[0] === 'shareAppMessage'));
  assert.ok(S1.log.menu.some((m) => m[0] === 'updateShareMenu' && m[1].withShareTicket === true));
  S1.tapId('back');
  await S1.settle();
  r = S1.handlers.shareMenu();
  assert.deepEqual([r.query, r.title], ['', '传画接龙：看上一棒，画出来或猜出来']);
  for (const s of S1.log.shares.concat([S1.handlers.shareMenu()])) assert.match(s.query, /^(k|r)=[0-9a-z]{10}$|^$/);
});
