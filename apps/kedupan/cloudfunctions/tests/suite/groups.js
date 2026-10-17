'use strict';
// Groups and boards: AC 41-47, 49 (server side). Rows carry salted hashes only; refs, openids and openGIds never leak.
const S = require('../../../game/core/score');
const G = require('../../../game/core/group');
const { rowHash } = require('../../common/util');
const { playDay, allStrings } = require('../helpers/backends');

const T1 = '20261105';
const T2 = '20261106';
const flat = (x) => JSON.stringify(x);

async function join(be, openid, gid) {
  const r = await be.call(openid, 'joinGroup', { cloudID: be.cloudID(gid, 3) });
  assert.equal(r.ok, true, flat(r));
  return r.groupRef;
}
const assert = require('node:assert/strict');

module.exports = function groups(T) {
  const { test } = T;

  test('AC 41: joinGroup: only server-resolved group chats; errors leave no document; idempotent; one groupRef per group', async (be) => {
    const gd = (g, ct) => ({ cloudID: be.cloudID(g, ct) });
    assert.equal((await be.call('alice', 'joinGroup', {})).code, 'BAD_CLOUDID');
    assert.equal((await be.call('alice', 'joinGroup', { groupData: 'str' })).code, 'BAD_CLOUDID', 'groupData is not a field any more');
    assert.equal((await be.call('alice', 'joinGroup', { cloudID: 'not-a-cloudid' })).code, 'BAD_CLOUDID', 'unresolvable cloudID');
    assert.equal((await be.call('alice', 'joinGroup', gd('G1', 1))).code, 'NOT_GROUP');
    assert.equal((await be.call('alice', 'joinGroup', gd('G1', 2))).code, 'NOT_GROUP');
    assert.equal((await be.call('alice', 'joinGroup', gd('', 3))).code, 'NOT_GROUP');
    assert.equal((await be.call('alice', 'joinGroup', { cloudID: be.cloudData({ open_single_roomid: 'R1' }) })).code, 'NOT_GROUP', 'a single chat payload');
    // M1: a forged plain object (the old payload shape, under either field name) never joins a group
    const forged = { cloudID: 'c', data: { opengid: 'G1', chat_type: 3 } };
    assert.equal((await be.call('alice', 'joinGroup', { groupData: forged })).code, 'BAD_CLOUDID');
    assert.equal((await be.call('alice', 'joinGroup', { cloudID: forged })).code, 'BAD_CLOUDID');
    assert.equal((await be.call('alice', 'joinGroup', { groupData: forged, cloudID: 'G1' })).code, 'BAD_CLOUDID');
    assert.equal(await be.count('group_members'), 0, 'errors leave no document');
    const a = await join(be, 'alice', 'G1');
    const a2 = await join(be, 'alice', 'G1');
    const b = await join(be, 'bob', 'G1');
    const c = await join(be, 'alice', 'G2');
    assert.match(a, /^[0-9a-f]{16}$/);
    assert.equal(a, a2);
    assert.equal(a, b);
    assert.notEqual(a, c);
    assert.equal(await be.count('group_members'), 3);
    const wecom = await be.call('cara', 'joinGroup', gd('G1', 4));
    assert.equal(wecom.ok, true, 'WeCom interop groups count');
    const resp = await be.call('alice', 'joinGroup', gd('G9', 3));
    assert.deepEqual(Object.keys(resp).sort(), ['groupRef', 'ok']);
    assert.ok(!/G9|alice/.test(flat(resp)));
  });

  test('AC 16/42: group context in getDaily and submitCard: other members only, partial members count, forged refs ignored', async (be) => {
    const ref = await join(be, 'alice', 'G1');
    await join(be, 'bob', 'G1');
    await join(be, 'cara', 'G1');
    await be.call('bob', 'submitCard', { dateKey: T1, idx: 0, pos: 20 });
    await be.call('cara', 'submitCard', { dateKey: T1, idx: 0, pos: 40 });
    const stranger = await be.call('dave', 'submitCard', { dateKey: T1, idx: 0, pos: 10, groupRef: ref });
    assert.equal(stranger.group, null, 'a forged groupRef is silently ignored');
    const r = await be.call('alice', 'submitCard', { dateKey: T1, idx: 0, pos: 30, groupRef: ref });
    assert.deepEqual(r.group, { median: 30, n: 2, dots: [20, 40] }, 'others only (bob, cara)');
    const g2 = await join(be, 'erin', 'G2');
    const lone = await be.call('erin', 'submitCard', { dateKey: T1, idx: 0, pos: 30, groupRef: g2 });
    assert.deepEqual(lone.group, { median: null, n: 0, dots: [] });
    const d = await be.call('alice', 'getDaily', { groupRef: ref });
    assert.deepEqual(d.groupRefs[0], { median: 30, n: 2, dots: [20, 40] });
    assert.equal(d.groupRefs[1], null);
    assert.deepEqual(d.mine.reveals[0].group, { median: 30, n: 2, dots: [20, 40] });
    const noRef = await be.call('alice', 'getDaily', {});
    assert.equal(noRef.groupRefs, null);
    const forged = await be.call('frank', 'getDaily', { groupRef: ref });
    assert.equal(forged.groupRefs, null);
    assert.equal((await be.call('alice', 'getDaily', { groupRef: 'not-a-ref' })).code, 'INVALID_INPUT');
    const again = await be.call('alice', 'submitCard', { dateKey: T1, idx: 0, pos: 99, groupRef: ref });
    assert.equal(again.code, 'CARD_DONE');
    assert.deepEqual(again.reveal.group, { median: 30, n: 2, dots: [20, 40] });
  });

  test('AC 42-45: getGroupDay: membership, hashed rows, scores, mq, gate on viewerDone, trend; nothing identifying leaks', async (be) => {
    const users = ['alice', 'bob', 'cara', 'dave'];
    let ref;
    for (const u of users) ref = await join(be, u, 'GROUP-ONE');
    await join(be, 'erin', 'OTHER');
    await be.call('alice', 'getDaily', {});
    for (let i = 0; i < 5; i++) await be.seedCrowd(T1, i, 60);
    const plays = { alice: [10, 30, 50, 70, 90], bob: [12, 33, 49, 75, 80], cara: [60, 20, 40, 90, 10] };
    for (const [u, p] of Object.entries(plays)) {
      be.clock.add(7000);
      await playDay(be, u, p);
    }
    await be.call('dave', 'getDaily', {});
    await be.call('dave', 'submitCard', { dateKey: T1, idx: 0, pos: 5 });
    assert.equal((await be.call('erin', 'getGroupDay', { groupRef: ref, dateKey: T1 })).code, 'NOT_MEMBER');
    assert.equal((await be.call('alice', 'getGroupDay', { groupRef: 'zz', dateKey: T1 })).code, 'INVALID_INPUT');
    assert.equal((await be.call('alice', 'getGroupDay', { groupRef: ref, dateKey: T2 })).code, 'INVALID_INPUT', 'not today/yesterday');
    assert.equal((await be.call('alice', 'getGroupDay', { groupRef: ref, dateKey: '20260101' })).code, 'INVALID_INPUT');
    assert.equal((await be.call('alice', 'getGroupDay', { groupRef: 'a'.repeat(16), dateKey: T1 })).code, 'NOT_MEMBER');

    const a = await be.call('alice', 'getGroupDay', { groupRef: ref, dateKey: T1 });
    assert.equal(a.ok, true, flat(a));
    const salt = (await be.setDoc(T1)).boardSalt;
    assert.equal(a.salt, salt);
    assert.equal(a.issueNo, 5);
    assert.equal(a.viewerDone, true);
    assert.equal(a.n, 3, 'dave has not finished: complete members only');
    assert.equal(a.rows.length, 3);
    a.rows.forEach((r) => assert.equal(r.length, 6));
    const list = [plays.alice, plays.bob, plays.cara];
    assert.equal(a.mq, G.groupMq(list));
    assert.equal(a.divisiveIdx, G.groupDivisiveIdx(list));
    assert.equal(a.selfHash, rowHash('alice', salt));
    assert.deepEqual(a.rows.map((r) => r[0]).sort(), ['alice', 'bob', 'cara'].map((u) => rowHash(u, salt)).sort());
    const refs = (await be.call('alice', 'getDaily', {})).refs;
    const names = ['alice', 'bob', 'cara'];
    names.forEach((u, i) => {
      const row = a.rows.find((r) => r[0] === rowHash(u, salt));
      assert.equal(row[1], G.leaveOneOutScore(list, i), u + ' gs');
      assert.equal(row[2], S.dailyTotal(list[i], refs).total, u + ' ns');
      assert.equal(row[4], list[i].join(','));
    });
    for (let i = 1; i < a.rows.length; i++) assert.ok(a.rows[i - 1][1] >= a.rows[i][1], 'sorted by gs desc');
    // privacy: no identity anywhere
    const strs = allStrings(a).join('|');
    for (const secret of ['alice', 'bob', 'cara', 'dave', 'erin', 'GROUP-ONE', ref]) assert.ok(!strs.includes(secret), 'leak: ' + secret);
    assert.equal(a.trend.length, 7);
    assert.equal(a.trend[6].dateKey, T1);
    assert.equal(a.trend[6].mq, a.mq);
    assert.equal(a.trend[6].n, 3);
    assert.deepEqual(a.trend.slice(0, 6).map((t) => t.mq), [null, null, null, null, null, null]);
    assert.deepEqual(a.rounds, []);
    // dave has not completed: no positions of others, no streak/pos in rows (TD-15)
    const d = await be.call('dave', 'getGroupDay', { groupRef: ref, dateKey: T1 });
    assert.equal(d.viewerDone, false);
    assert.equal(d.n, 3);
    assert.ok(d.rows.every((r) => r[4] === null), 'positions only when viewerDone');
    assert.equal(d.selfHash, rowHash('dave', salt));
    assert.ok(!d.rows.some((r) => r[0] === d.selfHash));
  });

  test('AC 43: a group of 2 has gs but no mq; a group of 1 has neither', async (be) => {
    const ref = await join(be, 'alice', 'G');
    await join(be, 'bob', 'G');
    await playDay(be, 'alice', [10, 30, 50, 70, 90]);
    let g = await be.call('alice', 'getGroupDay', { groupRef: ref, dateKey: T1 });
    assert.equal(g.n, 1);
    assert.equal(g.mq, null);
    assert.equal(g.rows[0][1], null);
    be.clock.add(9000);
    await playDay(be, 'bob', [14, 28, 50, 66, 90]);
    g = await be.call('bob', 'getGroupDay', { groupRef: ref, dateKey: T1 });
    assert.equal(g.n, 2);
    assert.equal(g.mq, null);
    assert.equal(g.divisiveIdx, null);
    assert.ok(g.rows.every((r) => typeof r[1] === 'number'));
  });

  test('AC 43: the board is capped at 500 rows plus the viewer', async (be) => {
    const ref = await join(be, 'zed', 'BIG');
    await be.call('zed', 'getDaily', {});
    for (let i = 0; i < 5; i++) await be.seedCrowd(T1, i, 60);
    for (let i = 0; i < 520; i++) {
      await be.putMember('BIG', 'm' + i, ref);
      await be.putEntry(T1, 'm' + i, [50, 50, 50, 50, 50].map((p, c) => (p + ((i + c) % 3)) % 101), be.BJ(T1, 11, 0, 0) + i * 1000);
    }
    await playDay(be, 'zed', [1, 99, 1, 99, 1]);
    const g = await be.call('zed', 'getGroupDay', { groupRef: ref, dateKey: T1 });
    assert.equal(g.n, 521);
    assert.equal(g.rows.length, 501);
    assert.ok(g.rows.some((r) => r[0] === g.selfHash), 'the viewer is always included');
  });

  test('AC 45: group rounds list: rounds guessed with this group\'s ref, newest first, mq only once revealed', async (be) => {
    const ref = await join(be, 'host', 'G');
    for (const u of ['g1', 'g2', 'g3']) await join(be, u, 'G');
    const mk = async (spectrum) => {
      const r = await be.call('host', 'createRound', { spectrumId: spectrum });
      assert.equal(r.ok, true);
      await be.clue('host', r.roundId);
      be.clock.add(1000);
      return r.roundId;
    };
    const sp = be.content.spectra.slice(0, 3).map((s) => s.id);
    const r1 = await mk(sp[0]);
    const r2 = await mk(sp[1]);
    await be.call('g1', 'submitGuess', { roundId: r1, pos: 30, groupRef: ref });
    await be.call('g2', 'submitGuess', { roundId: r1, pos: 50, groupRef: ref });
    await be.call('g1', 'submitGuess', { roundId: r2, pos: 30, groupRef: ref });
    await be.call('host', 'revealRound', { roundId: r1 });
    const g = await be.call('g3', 'getGroupDay', { groupRef: ref, dateKey: T1 });
    assert.equal(g.rounds.length, 2);
    assert.deepEqual(g.rounds.map((r) => r.roundId), [r2, r1], 'newest first');
    const byId = Object.fromEntries(g.rounds.map((r) => [r.roundId, r]));
    assert.equal(byId[r1].status, 'revealed');
    assert.equal(typeof byId[r1].mq, 'number');
    assert.equal(byId[r1].guesses, 2);
    assert.equal(byId[r2].status, 'open');
    assert.equal(byId[r2].mq, null);
    assert.deepEqual(Object.keys(byId[r2]).sort(), ['clue', 'guesses', 'left', 'mq', 'right', 'roundId', 'status']);
  });

  test('AC 46-47: getFriendBoard: ranked by national score then time, refs and positions only when the viewer is done', async (be) => {
    await be.call('alice', 'getDaily', {});
    for (let i = 0; i < 5; i++) await be.seedCrowd(T1, i, 120);
    const set = await be.setDoc(T1);
    const anchors = set.cards.map((c) => c.anchor);
    const close = anchors.map((a) => a);
    const far = anchors.map((a) => (a > 50 ? 2 : 98));
    be.clock.add(5000);
    await playDay(be, 'near1', close);
    be.clock.add(5000);
    await playDay(be, 'far1', far);
    be.clock.add(5000);
    await playDay(be, 'near2', close);
    const pre = await be.call('late', 'getFriendBoard', { dateKey: T1 });
    assert.equal(pre.ok, true);
    assert.equal(pre.viewerDone, false);
    assert.equal(pre.refs, null, 'refs only when the viewer completed (TD-15)');
    assert.ok(pre.rows.every((r) => r[3] === null), 'positions only when viewerDone');
    assert.equal(pre.mode, 'full');
    assert.equal(pre.total, 3);
    be.clock.add(5000);
    await playDay(be, 'late', close);
    const b = await be.call('late', 'getFriendBoard', { dateKey: T1 });
    assert.equal(b.viewerDone, true);
    assert.equal(b.total, 4);
    assert.equal(b.refs.length, 5);
    b.rows.forEach((r) => assert.equal(r.length, 5));
    const salt = (await be.setDoc(T1)).boardSalt;
    assert.equal(b.salt, salt);
    assert.equal(b.selfHash, rowHash('late', salt));
    const order = b.rows.map((r) => r[0]);
    assert.equal(order[3], rowHash('far1', salt), 'the far player ranks last');
    // equal scores are ordered by completion time
    const nearOrder = order.slice(0, 3);
    const nsOf = (h) => b.rows.find((r) => r[0] === h)[1];
    for (let i = 1; i < 3; i++) assert.ok(nsOf(nearOrder[i - 1]) >= nsOf(nearOrder[i]));
    assert.equal(b.rows.find((r) => r[0] === rowHash('far1', salt))[3], far.join(','));
    const strs = allStrings(b).join('|');
    for (const secret of ['near1', 'near2', 'far1', 'late', 'alice']) assert.ok(!strs.includes(secret), 'leak: ' + secret);
    assert.equal((await be.call('late', 'getFriendBoard', { dateKey: T2 })).code, 'INVALID_INPUT');
    assert.equal((await be.call('late', 'getFriendBoard', { dateKey: 'x' })).code, 'INVALID_INPUT');
  });

  test('AC 46: above the list cap the board degrades to the viewer\'s own row (selfOnly), without loading the crowd into the reply', async (be) => {
    await be.call('alice', 'getDaily', {});
    for (let i = 0; i < 3001; i++) await be.putEntry(T1, 'bot' + i, [i % 101, (i * 3) % 101, (i * 7) % 101, (i * 11) % 101, (i * 13) % 101], be.BJ(T1, 11, 0, 0) + i * 100);
    const before = await be.call('alice', 'getFriendBoard', { dateKey: T1 });
    assert.equal(before.mode, 'selfOnly');
    assert.deepEqual(before.rows, []);
    assert.equal(before.total, 3001);
    await playDay(be, 'alice', [10, 30, 50, 70, 90]);
    const b = await be.call('alice', 'getFriendBoard', { dateKey: T1 });
    assert.equal(b.mode, 'selfOnly');
    assert.equal(b.rows.length, 1);
    assert.equal(b.rows[0][0], b.selfHash);
    assert.equal(b.total, 3002);
  });
};
