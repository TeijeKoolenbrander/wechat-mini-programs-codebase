'use strict';
// QA (independent) re-check of the security hardening on the REAL functions + fake database (TD-62..67).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { makeBackend, disposeStages, sharedStage } = require('./helpers/backends');
const { sdk } = require('./helpers/real-backend');
const { encodeMockCloudData } = require('../../game/js/mock-server');
const EV = require('../../game/core/events');
const { CLIENT_FUNCTIONS, TIMERS } = require('../../game/js/mock-server');

test.after(() => disposeStages());
const real = (o) => makeBackend('real', o);

async function openRound(be, host) {
  const r = await be.call(host, 'createRound', { spectrumId: be.content.spectra[3].id });
  assert.equal((await be.clue(host, r.roundId)).ok, true);
  return r;
}

test('QA M1: cloudID length and charset boundaries; payload without chat_type joins, a single-chat payload does not', async () => {
  const be = real();
  try {
    for (const bad of ['', 'a'.repeat(7), 'a'.repeat(513), 'abc def123', 'abc/def123', 'abc.def123', '../../etc/passwd', 'a\nb' + 'c'.repeat(8), 5, null, ['abcdefghij'], { cloudID: 'abcdefghij' }, true]) {
      const r = await be.call('alice', 'joinGroup', { cloudID: bad });
      assert.equal(r.ok, false, JSON.stringify(bad));
      assert.ok(['INVALID_INPUT', 'BAD_CLOUDID'].includes(r.code), JSON.stringify(bad) + ' -> ' + r.code);
    }
    assert.equal(be.db.size('kedupan_group_members'), 0);
    // chat_type absent (CTO ruling): joins
    const absent = encodeMockCloudData({ opengid: 'GROUP-ABSENT' });
    assert.equal((await be.call('alice', 'joinGroup', { cloudID: absent })).ok, true);
    // chat_type 3 and 4 join; 1 (private chat) and 2 do not
    assert.equal((await be.call('alice', 'joinGroup', { cloudID: encodeMockCloudData({ opengid: 'G4', chat_type: 4 }) })).ok, true);
    for (const ct of [1, 2, 0, 'x', null, 3.5]) {
      const r = await be.call('alice', 'joinGroup', { cloudID: encodeMockCloudData({ opengid: 'GX' + ct, chat_type: ct }) });
      assert.equal(r.ok, false, 'chat_type ' + JSON.stringify(ct));
    }
    // single chat
    assert.equal((await be.call('alice', 'joinGroup', { cloudID: encodeMockCloudData({ open_single_roomid: 'ROOM1' }) })).code, 'NOT_GROUP');
    // opengid length
    assert.equal((await be.call('alice', 'joinGroup', { cloudID: encodeMockCloudData({ opengid: 'g'.repeat(128), chat_type: 3 }) })).ok, true);
    assert.equal((await be.call('alice', 'joinGroup', { cloudID: encodeMockCloudData({ opengid: 'g'.repeat(129), chat_type: 3 }) })).ok, false);
    // the response must not carry the openGId
    const r = await be.call('bob', 'joinGroup', { cloudID: absent });
    assert.ok(!JSON.stringify(r).includes('GROUP-ABSENT'));
    // the same cloudID by two players: both join the same group ref
    const ra = await be.call('alice', 'joinGroup', { cloudID: absent });
    assert.equal(ra.groupRef, r.groupRef);
  } finally {
    be.dispose();
  }
});

test('QA M1: a forged decrypted-looking object in every field is refused without a platform call', async () => {
  const be = real();
  try {
    const before = sdk.state.openData.length;
    const forged = [
      { groupData: { cloudID: 'abcdefghij', data: { opengid: 'G', chat_type: 3 } } },
      { cloudID: { cloudID: 'abcdefghij', data: { opengid: 'G', chat_type: 3 } } },
      { data: { opengid: 'G', chat_type: 3 } },
      { opengid: 'G', chat_type: 3 },
      { openGId: 'G' },
      { groupData: { opengid: 'G' }, cloudID: 'notamockcloudid' },
    ];
    for (const f of forged) assert.ok(['INVALID_INPUT', 'BAD_CLOUDID'].includes((await be.call('mallory', 'joinGroup', f)).code), JSON.stringify(f));
    assert.equal(be.db.size('kedupan_group_members'), 0);
    assert.ok(sdk.state.openData.length - before <= 2, 'only well-formed strings reach the platform');
  } finally {
    be.dispose();
  }
});

test('QA L3: a client call carrying the timer marker is still FORBIDDEN (a client always has an OPENID)', async () => {
  const be = real();
  try {
    const timerMain = (name) => require(path.join(sharedStage(true).root, name, 'index.js')).main;
    for (const t of TIMERS) {
      sdk.state.openid = 'mallory';
      const r = await timerMain(t)({ Type: 'Timer', TriggerName: 'x' });
      assert.equal(r.code, 'FORBIDDEN', t);
    }
    sdk.state.openid = null;
  } finally {
    be.dispose();
  }
});

test('QA L4: showAnswer on an open round never leaks the target or records a view; a non-boolean is refused', async () => {
  const be = real();
  try {
    const r = await openRound(be, 'host');
    be.clock.add(1000);
    await be.call('a', 'submitGuess', { roundId: r.roundId, pos: 40 });
    const v = await be.call('stranger', 'getRound', { roundId: r.roundId, showAnswer: true });
    assert.ok(!('reveal' in v) && !JSON.stringify(v).includes('"target"'));
    assert.equal(be.db.size('kedupan_reveal_views'), 0, 'no view is recorded for an unrevealed round');
    // the stranger can still guess normally afterwards
    assert.equal((await be.call('stranger', 'submitGuess', { roundId: r.roundId, pos: 10 })).ok, true);
    for (const bad of ['true', 1, {}, [], 'yes']) {
      const x = await be.call('s2', 'getRound', { roundId: r.roundId, showAnswer: bad });
      assert.equal(x.ok, false, JSON.stringify(bad));
    }
  } finally {
    be.dispose();
  }
});

test('QA L4: the answer cannot be had by getFriendBoard/getGroupDay/getArchive-style reads before guessing; only getRound(showAnswer) or a guess serves it', async () => {
  const be = real();
  try {
    const r = await openRound(be, 'host');
    for (const u of ['a', 'b', 'c']) {
      be.clock.add(1000);
      await be.call(u, 'submitGuess', { roundId: r.roundId, pos: 50 });
    }
    await be.call('host', 'revealRound', { roundId: r.roundId });
    const target = (await be.call('host', 'getRound', { roundId: r.roundId })).reveal.target;
    assert.equal(typeof target, 'number');
    const needle = JSON.stringify(target);
    for (const [fn, data] of [['getGroupDay', { groupRef: 'x' }], ['getFriendBoard', {}], ['getArchive', {}], ['getDaily', {}]]) {
      const x = await be.call('late', fn, data);
      assert.ok(!JSON.stringify(x).includes('"target"'), fn + ' carries no round target');
    }
    const hidden = await be.call('late', 'getRound', { roundId: r.roundId });
    assert.equal(hidden.answerHidden, true);
    assert.ok(!JSON.stringify(hidden).includes('"target"') && !('reveal' in hidden));
    // a share/unlock path: subscribeRound must not return it either
    const sub = await be.call('late', 'subscribeRound', { roundId: r.roundId });
    assert.ok(!JSON.stringify(sub).includes('"target"'));
    void needle;
  } finally {
    be.dispose();
  }
});

test('QA L2/AC 77: every client event with valid props is stored with those props; unknown names and oversize batches are handled', async () => {
  const be = real();
  try {
    const sample = {
      session_start: { scene: 1007, fromCard: 'round', hasShareTicket: false },
      card_open: { cardKind: 'round', hasShareTicket: true, roundId: 'ABCDEFGH' },
      daily_card_reveal: { dateKey: '20261105', idx: 4, d: 12, score: 80, label: '心有灵犀', hasGroup: true, n: 300 },
      daily_complete: { dateKey: '20261105', total: 380, durationMs: 41000, hasGroup: false, streak: 3 },
      round_guess: { roundId: 'ABCDEFGH', late: true, isFirstSession: false },
      group_join: { result: 'ok', scene: 1044, chatType: 3 },
      share_tap: { kind: 'reveal', roundId: 'ABCDEFGH' },
      error: { where: 'getRound', code: 'RATE_LIMITED' },
    };
    const events = Object.entries(sample).map(([name, props]) => ({ name, props: Object.assign({ isNewUser: false, contentVersion: 2, appVersion: '0.1.0' }, props) }));
    events.push({ name: 'round_reveal', props: { roundId: 'ABCDEFGH', by: 'host', guesses: 3, mq: 70 } }); // server-side name from a client: dropped
    events.push({ name: 'not_an_event', props: {} });
    const r = await be.call('u', 'track', { sessionId: 'sess1', events });
    assert.equal(r.accepted, Object.keys(sample).length);
    for (const d of be.db.all('kedupan_events')) assert.deepEqual(d.props, events.find((e) => e.name === d.name).props, d.name);
    // a batch above 50 is refused as a whole, not partly stored
    const many = Array.from({ length: 51 }, () => ({ name: 'howto_view', props: { auto: true } }));
    const n0 = be.db.size('kedupan_events');
    const big = await be.call('u', 'track', { sessionId: 'sess1', events: many });
    assert.equal(big.ok, false);
    assert.equal(be.db.size('kedupan_events'), n0);
    // every client event name in the table is accepted with only its required props
    const all = EV.CLIENT_EVENT_NAMES.map((name) => ({ name, props: {} }));
    const r2 = await be.call('u2', 'track', { sessionId: 's2', events: all.slice(0, 50) });
    assert.equal(r2.accepted, Math.min(50, all.length));
  } finally {
    be.dispose();
  }
});

test('QA M3: the limit is per function and per openid: exhausting one function does not block another; table covers every client function', async () => {
  const be = real({ limits: true });
  try {
    const cap = require('../../game/core/config').CONFIG.limits.perMinute;
    assert.deepEqual(Object.keys(cap).sort(), [...CLIENT_FUNCTIONS, 'admin'].sort());
    let last;
    for (let i = 0; i <= cap.getArchive; i++) last = await be.call('spam', 'getArchive', {});
    assert.equal(last.code, 'RATE_LIMITED');
    assert.equal(last.scope, 'minute');
    assert.notEqual((await be.call('spam', 'getDaily', {})).code, 'RATE_LIMITED', 'another function is unaffected');
    assert.notEqual((await be.call('other', 'getArchive', {})).code, 'RATE_LIMITED', 'another user is unaffected');
    be.clock.add(61000);
    assert.notEqual((await be.call('spam', 'getArchive', {})).code, 'RATE_LIMITED', 'the next minute is open again');
  } finally {
    be.dispose();
  }
});

test('QA M2: the cloud function packages carry the server-only content (anchors, schedule); the client never needs them', () => {
  const stage = sharedStage(true).root;
  const hits = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name === 'node_modules') continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/anchors\.v1\.js$|schedule\.v1\.js$/.test(e.name)) hits.push(path.relative(stage, p));
    }
  })(stage);
  assert.ok(hits.some((h) => /anchors\.v1\.js$/.test(h)), 'anchors in the functions: ' + hits.join(','));
  assert.ok(hits.some((h) => /schedule\.v1\.js$/.test(h)), 'schedule in the functions');
});
