'use strict';
// Cross-cutting: analytics intake (AC 77) and the privacy sweep (AC 49): no response, for any function, contains a raw
// openid, an openGId or a groupRef (joinGroup's own reply excepted).
const assert = require('node:assert/strict');
const { playDay, allStrings } = require('../helpers/backends');

const T1 = '20261105';
const T2 = '20261106';
const U = { a: 'oWXID-ALICE-7Qx9', b: 'oWXID-BOBBY-3Lm2', c: 'oWXID-CARAX-8Zt5', h: 'oWXID-HOSTY-1Kd4' };
const GID = 'OPENGID-SECRET-GROUP-42';

module.exports = function misc(T) {
  const { test } = T;

  test('AC 77: track accepts a batch of valid events and rejects empty or oversized batches', async (be) => {
    const ev = (n) => ({ name: 'session_start', props: { scene: 1001, fromCard: 'none', hasShareTicket: false }, clientTs: be.clock.now() + n });
    const before = await be.count('events');
    const r = await be.call('alice', 'track', { sessionId: 'sess-1', events: [ev(0), ev(1), ev(2)] });
    assert.deepEqual(r, { ok: true, accepted: 3 });
    assert.equal((await be.count('events')) - before, 3);
    assert.equal((await be.call('alice', 'track', { events: [] })).code, 'INVALID_INPUT');
    assert.equal((await be.call('alice', 'track', {})).code, 'INVALID_INPUT');
    assert.equal((await be.call('alice', 'track', { events: Array.from({ length: 51 }, (_x, i) => ev(i)) })).code, 'INVALID_INPUT');
    assert.equal((await be.call('alice', 'track', { events: Array.from({ length: 50 }, (_x, i) => ev(i)) })).accepted, 50);
  });

  test('AC 49: no response of any function contains a raw openid, an openGId or a groupRef', async (be) => {
    const responses = [];
    const call = async (u, name, data) => {
      const r = await be.call(u, name, data);
      responses.push({ name, r });
      return r;
    };
    await be.setAppConfig({ subscribe: { tmplId: 'TMPL', fields: { spectrum: 'thing1', mq: 'number2', time: 'time3' } } });
    let ref;
    for (const u of [U.a, U.b, U.c, U.h]) {
      const j = await be.call(u, 'joinGroup', { cloudID: be.cloudID(GID, 3) });
      ref = j.groupRef;
      assert.ok(!JSON.stringify(j).includes(GID) && !JSON.stringify(j).includes(u));
    }
    await call(U.a, 'getDaily', { groupRef: ref });
    for (const [i, u] of [U.a, U.b, U.c].entries()) {
      be.clock.add(9000);
      for (let k = 0; k < 5; k++) await call(u, 'submitCard', { dateKey: T1, idx: k, pos: (i * 20 + k * 11) % 101, groupRef: ref });
    }
    await call(U.a, 'submitCard', { dateKey: T1, idx: 0, pos: 3, groupRef: ref }); // CARD_DONE
    await call(U.a, 'getDaily', { groupRef: ref });
    await call(U.a, 'getGroupDay', { groupRef: ref, dateKey: T1 });
    await call(U.h, 'getGroupDay', { groupRef: ref, dateKey: T1 });
    await call(U.a, 'getFriendBoard', { dateKey: T1 });
    await call(U.a, 'unlockDistribution', { dateKey: T1 });
    const r = await call(U.h, 'createRound', { spectrumId: be.content.spectra[2].id });
    await call(U.h, 'setClue', { roundId: r.roundId, clueMode: 'preset', clueItemId: be.content.spectra[2].items[0].id });
    await call(U.h, 'subscribeRound', { roundId: r.roundId });
    for (const u of [U.a, U.b, U.c]) {
      await call(u, 'submitGuess', { roundId: r.roundId, pos: 40, groupRef: ref });
      await call(u, 'subscribeRound', { roundId: r.roundId });
    }
    await call(U.a, 'getRound', { roundId: r.roundId, groupRef: ref });
    await call(U.h, 'getRound', { roundId: r.roundId });
    await call(U.h, 'revealRound', { roundId: r.roundId });
    await call(U.c, 'getRound', { roundId: r.roundId });
    await call(U.b, 'submitGuess', { roundId: r.roundId, pos: 1 });
    await call(U.a, 'getGroupDay', { groupRef: ref, dateKey: T1 });
    be.clock.set(be.BJ(T2, 1, 0, 0));
    await be.timer('finalizeDay');
    await call(U.a, 'getDaily', {});
    await call(U.a, 'getArchive', {});
    await call(U.a, 'getArchiveDay', { dateKey: T1 });
    await call(U.a, 'getBonusCard', {});
    await call(U.a, 'getGroupDay', { groupRef: ref, dateKey: T1 });
    await call(U.a, 'getFriendBoard', { dateKey: T1 });
    await call(U.a, 'reportCard', { itemId: be.content.itemIds[0], reason: 'typo' });
    await call(U.a, 'track', { events: [{ name: 'session_start', props: { scene: 1, fromCard: 'none', hasShareTicket: false }, clientTs: 1 }] });
    await call(U.a, 'submitCard', { dateKey: 'bad', idx: 0, pos: 0 }); // an error response
    assert.ok(responses.length > 40);
    for (const { name, r } of responses) {
      const text = allStrings(r).join('\u0000');
      for (const secret of [...Object.values(U), GID, ref]) assert.ok(!text.includes(secret), `${name} leaked ${secret}`);
      assert.ok(!/"?(openid|OPENID|openGId|opengid|hostOpenid)"?\s*:/.test(JSON.stringify(r)), `${name} exposes an identity field`);
    }
    // the subscribe messages carry no identity either
    (await be.sent()).forEach((m) => {
      if (m.data) for (const secret of [...Object.values(U), GID, ref]) assert.ok(!JSON.stringify(m.data).includes(secret));
    });
  });

  test('unknown functions and timer names are not callable as client functions', async (be) => {
    for (const name of ['genDaily', 'finalizeDay', 'sweepRounds', 'cleanup']) {
      assert.equal((await be.call('alice', name, {})).code, 'FORBIDDEN');
    }
  });
};
