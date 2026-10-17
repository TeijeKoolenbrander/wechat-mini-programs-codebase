'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildModel, rowHash, anonLabel, parseMarker } = require('../opendata/match');
const { closestPeer, parsePos } = require('../opendata/peer');
const G = require('../core/group');
const { setup, playDay } = require('./helpers');

const T1 = '20261105';
const kv = (openid, nickname, value) => ({ openid, nickname, avatarUrl: 'http://x/' + nickname, KVDataList: value === undefined ? [] : [{ key: 'kd', value }] });

/** A real session from the mock server, then the open data domain model on its payloads. */
function session() {
  const { srv } = setup();
  const ref = srv.callAs('me', 'joinGroup', { cloudID: srv.cloudID('G1') }).groupRef;
  ['zhang', 'li', 'wang'].forEach((u) => srv.callAs(u, 'joinGroup', { cloudID: srv.cloudID('G1') }));
  playDay(srv, 'me', [10, 20, 30, 40, 50]);
  playDay(srv, 'zhang', [14, 24, 34, 44, 54]);
  playDay(srv, 'li', [11, 21, 31, 41, 51]);
  playDay(srv, 'wang', [80, 80, 80, 80, 80]);
  const g = srv.callAs('me', 'getGroupDay', { groupRef: ref, dateKey: T1 });
  return { srv, g, ref };
}

test('AC 45: the open data copy of closestPeer agrees with core/group on random fixtures', () => {
  let seed = 77;
  const rnd = (n) => ((seed = (seed * 1664525 + 1013904223) >>> 0) % n);
  for (let t = 0; t < 500; t++) {
    const me = [0, 1, 2, 3, 4].map(() => rnd(101));
    const peers = Array.from({ length: rnd(8) }, (_, i) => ({ key: 'p' + i, pos: [0, 1, 2, 3, 4].map(() => rnd(101)), completeAt: rnd(5) }));
    assert.deepEqual(closestPeer(me, peers), G.closestPeer(me, peers));
  }
  assert.deepEqual(parsePos('1,2,3,4,100'), [1, 2, 3, 4, 100]);
  assert.equal(parsePos('1,2,3'), null);
  assert.equal(parsePos('1,2,3,4,101'), null);
  assert.equal(parsePos(null), null);
});

test('AC 44: unmatched server rows render as 群友 A/B/C in a stable order; the viewer is always 你', () => {
  const { g } = session();
  const m = buildModel({ view: 'group', serverRows: g.rows, salt: g.salt, selfHash: g.selfHash, kvList: [], viewerDone: true });
  assert.equal(m.rows.length, 4);
  assert.equal(m.hasNames, false);
  const self = m.rows.find((r) => r.isSelf);
  assert.equal(self.name, '你');
  const anon = m.rows.filter((r) => !r.isSelf);
  assert.deepEqual(anon.map((r) => r.name).sort(), ['群友 A', '群友 B', '群友 C']);
  assert.ok(anon.every((r) => r.anonymous));
  // stable: letters follow hash order, not rank, and do not change when the list order changes
  const shuffled = buildModel({ view: 'group', serverRows: g.rows.slice().reverse(), salt: g.salt, selfHash: g.selfHash, kvList: [], viewerDone: true });
  const letterOf = (model, h) => model.rows.find((r) => r.h === h).name;
  g.rows.forEach((r) => assert.equal(letterOf(m, r[0]), letterOf(shuffled, r[0])));
  assert.deepEqual(anon.map((r) => r.h).sort(), anon.slice().sort((a, b) => (a.name < b.name ? -1 : 1)).map((r) => r.h).sort());
  assert.equal(anonLabel(0), '群友 A');
  assert.equal(anonLabel(30), '群友 31');
});

test('AC 44: matched rows show nickname and avatar with the SERVER values; KV rows without a server row are not shown', () => {
  const { g } = session();
  const kvList = [kv('me', '我自己', '{"d":"20261105","s":1}'), kv('zhang', '张三', '{"d":"20261105","s":99999}'), kv('li', '李四'), kv('ghost', '幽灵', '{"d":"20261105","s":500}')];
  const m = buildModel({ view: 'group', serverRows: g.rows, salt: g.salt, selfHash: g.selfHash, kvList, viewerDone: true });
  assert.equal(m.rows.length, 4, 'ghost has no server row: not shown');
  assert.ok(!m.rows.some((r) => r.name === '幽灵'));
  const zhang = m.rows.find((r) => r.name === '张三');
  assert.equal(zhang.avatarUrl, 'http://x/张三');
  assert.equal(zhang.matched, true);
  assert.equal(m.rows.find((r) => r.isSelf).name, '你');
  assert.equal(m.rows.filter((r) => r.anonymous).length, 1, 'wang stays anonymous');
  assert.equal(m.hasNames, true);
});

test('AC 43: a tampered KV value (s: 500, or 99999) never changes a score or a rank', () => {
  const { g } = session();
  const clean = buildModel({ view: 'group', serverRows: g.rows, salt: g.salt, selfHash: g.selfHash, kvList: [kv('zhang', '张三'), kv('li', '李四'), kv('wang', '王五')], viewerDone: true });
  const forged = buildModel({
    view: 'group',
    serverRows: g.rows,
    salt: g.salt,
    selfHash: g.selfHash,
    kvList: [kv('zhang', '张三', '{"d":"20261105","s":500}'), kv('li', '李四', '{"d":"20261105","s":500}'), kv('wang', '王五', '{"d":"20261105","s":500}'), kv('cheat', '作弊', '{"d":"20261105","s":500}')],
    viewerDone: true,
  });
  const strip = (m) => m.rows.map((r) => [r.h, r.rank, r.gs, r.ns, r.name]);
  assert.deepEqual(strip(forged), strip(clean));
  assert.deepEqual(forged.rows.map((r) => r.rank), [1, 2, 3, 4]);
  assert.deepEqual(forged.selfReported, [], 'group view has no self-reported list');
});

test('AC 43: in selfOnly friend mode KV-only friends show as 好友自报 without a rank, only for the same day', () => {
  const { srv } = setup();
  playDay(srv, 'me', [10, 20, 30, 40, 50]);
  const f = srv.callAs('me', 'getFriendBoard', { dateKey: T1 });
  const kvList = [kv('me', '我', '{"d":"20261105","s":300}'), kv('pal', '朋友', '{"d":"20261105","s":410}'), kv('old', '旧友', '{"d":"20261104","s":480}'), kv('junk', '坏数据', 'not json')];
  const m = buildModel({ view: 'friend', serverRows: f.rows, salt: f.salt, selfHash: f.selfHash, kvList, viewerDone: true, mode: 'selfOnly', dateKey: T1 });
  assert.equal(m.rows.length, 1);
  assert.deepEqual(m.selfReported, [{ name: '朋友', avatarUrl: 'http://x/朋友', scoreText: '410', rank: null, label: '好友自报' }]);
  const full = buildModel({ view: 'friend', serverRows: f.rows, salt: f.salt, selfHash: f.selfHash, kvList, viewerDone: true, mode: 'full', dateKey: T1 });
  assert.deepEqual(full.selfReported, []);
  assert.deepEqual(parseMarker(kv('a', 'a', '{"d":"20261105","s":3}')), { d: '20261105', s: 3 });
  assert.equal(parseMarker(kv('a', 'a', '{"d":5}')), null);
});

test('AC 45: 最同频 is computed here, only for a viewer who completed, naming a matched member only', () => {
  const { g } = session();
  const kvList = [kv('me', '我'), kv('zhang', '张三'), kv('li', '李四')]; // wang is not matched
  const m = buildModel({ view: 'group', serverRows: g.rows, salt: g.salt, selfHash: g.selfHash, kvList, viewerDone: true });
  assert.equal(m.peer.name, '李四', 'li is 1 step away on every card (zhang 4)');
  assert.equal(m.peer.gap, 1);
  assert.equal(m.peer.gapText, '1');
  assert.equal(m.peer.h, rowHash('li', g.salt));
  // an unmatched best peer is never named
  const onlyWang = buildModel({ view: 'group', serverRows: g.rows, salt: g.salt, selfHash: g.selfHash, kvList: [kv('me', '我'), kv('wang', '王五')], viewerDone: true });
  assert.equal(onlyWang.peer.name, '王五', 'a matched member, even if far');
  const none = buildModel({ view: 'group', serverRows: g.rows, salt: g.salt, selfHash: g.selfHash, kvList: [kv('me', '我')], viewerDone: true });
  assert.equal(none.peer, null, 'needs >= 1 matched peer');
  // not completed: the server withholds pos, and nothing is computed
  const { srv, ref } = (() => {
    const s = setup();
    const r = s.srv.callAs('me', 'joinGroup', { cloudID: s.srv.cloudID('G1') }).groupRef;
    s.srv.callAs('zhang', 'joinGroup', { cloudID: s.srv.cloudID('G1') });
    playDay(s.srv, 'zhang', [14, 24, 34, 44, 54]);
    return { srv: s.srv, ref: r };
  })();
  const g2 = srv.callAs('me', 'getGroupDay', { groupRef: ref, dateKey: T1 });
  const m2 = buildModel({ view: 'group', serverRows: g2.rows, salt: g2.salt, selfHash: g2.selfHash, kvList: [kv('zhang', '张三')], viewerDone: false });
  assert.equal(m2.peer, null);
});

test('round view: the host row is 出题人, late guesses flagged, 最懂你 comes from the server; names only from matches', () => {
  const { srv } = setup();
  const c = srv.callAs('host', 'createRound', { spectrumId: 's001' });
  srv.callAs('host', 'setClue', { roundId: c.roundId, clueMode: 'preset', clueItemId: 's001i03' });
  srv.callAs('a', 'submitGuess', { roundId: c.roundId, pos: c.target });
  srv.callAs('b', 'submitGuess', { roundId: c.roundId, pos: Math.min(100, c.target + 20) });
  const rv = srv.callAs('host', 'revealRound', { roundId: c.roundId }).reveal;
  const late = srv.callAs('late', 'submitGuess', { roundId: c.roundId, pos: 50 }).reveal;
  const m = buildModel({ view: 'round', serverRows: late.rows, salt: late.salt, selfHash: late.selfHash, kvList: [kv('a', '甲'), kv('host', '主持')], viewerDone: true });
  assert.equal(m.rows.find((r) => r.isHost).name, '出题人', 'even though the host is matched');
  const lateRow = m.rows.find((r) => r.isSelf);
  assert.equal(lateRow.late, true);
  assert.equal(lateRow.name, '你');
  assert.equal(m.rows.find((r) => r.h === rowHash('a', late.salt)).name, '甲');
  assert.equal(late.closestH, rowHash('a', late.salt));
  assert.equal(rv.closestH, late.closestH);
  const anon = m.rows.filter((r) => r.anonymous);
  assert.ok(anon.length >= 1 && anon.every((r) => /^群友 /.test(r.name)));
});
