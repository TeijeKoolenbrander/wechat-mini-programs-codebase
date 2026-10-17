'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../core/score');
const { sha256Hex } = require('../opendata/sha256');
const { setup, BJ, allStrings } = require('./helpers');

const H = 3600e3;
const T1 = '20261105';

function openRound(srv, host, o) {
  o = o || {};
  const c = srv.callAs(host, 'createRound', { spectrumId: o.spectrumId || 's001' });
  assert.equal(c.ok, true);
  const clue = { clueMode: 'preset', clueItemId: (o.spectrumId || 's001') + 'i03' };
  assert.equal(srv.callAs(host, 'setClue', { roundId: c.roundId, ...clue }).ok, true);
  return c;
}

test('AC 26: createRound returns a target 5..95 only to the host; other spectra are refused', () => {
  const { srv } = setup();
  const c = srv.callAs('host', 'createRound', { spectrumId: 's001' });
  assert.equal(c.ok, true);
  assert.ok(Number.isInteger(c.target) && c.target >= 5 && c.target <= 95);
  assert.match(c.roundId, /^[A-Z2-7]{8}$/);
  assert.equal(c.left, '左1');
  assert.equal(srv.callAs('host', 'createRound', { spectrumId: 's999' }).code, 'INVALID_INPUT');
  assert.equal(srv.callAs('host', 'createRound', { spectrumId: 'x' }).code, 'INVALID_INPUT');
});

test('AC 26/30: getRound never returns the target to a non-host before the reveal; drafts are the host\'s alone', () => {
  const { srv } = setup();
  const c = srv.callAs('host', 'createRound', { spectrumId: 's001' });
  assert.equal(srv.callAs('guest', 'getRound', { roundId: c.roundId }).code, 'ROUND_NOT_FOUND', 'draft is not found for others');
  const mine = srv.callAs('host', 'getRound', { roundId: c.roundId });
  assert.equal(mine.target, c.target);
  assert.equal(mine.status, 'draft');
  srv.callAs('host', 'setClue', { roundId: c.roundId, clueMode: 'preset', clueItemId: 's001i03' });
  srv.callAs('g2', 'submitGuess', { roundId: c.roundId, pos: 40 });
  const view = srv.callAs('guest', 'getRound', { roundId: c.roundId });
  assert.equal(view.ok, true);
  assert.equal(view.status, 'open');
  assert.equal(view.isHost, false);
  assert.equal(view.clueText, '物1-3');
  assert.equal(view.guessCount, 1);
  assert.equal(view.myGuess, null);
  assert.ok(!('target' in view) && !('reveal' in view) && !('rows' in view), 'no target, no other guesses');
  assert.ok(!/"target"/.test(JSON.stringify(view)));
  const sub = srv.callAs('guest', 'submitGuess', { roundId: c.roundId, pos: 70 });
  assert.ok(!/"target"/.test(JSON.stringify(sub)));
  assert.deepEqual(srv.callAs('guest', 'getRound', { roundId: c.roundId }).myGuess, { pos: 70, late: false });
});

test('AC 28: setClue rejects an item from another spectrum, a non-host, the removed chat clue, and a typed clue without the 发言规则 agreement', () => {
  const { srv } = setup();
  const c = srv.callAs('host', 'createRound', { spectrumId: 's001' });
  assert.equal(srv.callAs('host', 'setClue', { roundId: c.roundId, clueMode: 'preset', clueItemId: 's002i03' }).code, 'INVALID_INPUT');
  const preset = { clueMode: 'preset', clueItemId: 's001i03' };
  assert.equal(srv.callAs('other', 'setClue', { roundId: c.roundId, ...preset }).code, 'NOT_HOST');
  assert.equal(srv.callAs('host', 'setClue', { roundId: c.roundId, clueMode: 'chat' }).code, 'INVALID_INPUT', 'D-2: the chat clue is removed');
  assert.equal(srv.callAs('host', 'setClue', { roundId: c.roundId, clueMode: 'text', clueText: 'hello' }).code, 'RULES_REQUIRED', 'typed clues need the agreement first');
  const ok = srv.callAs('host', 'setClue', { roundId: c.roundId, ...preset });
  assert.deepEqual([ok.ok, ok.status, ok.clueMode], [true, 'open', 'preset']);
  const seen = srv.callAs('guest', 'getRound', { roundId: c.roundId });
  assert.equal(seen.clueMode, 'preset');
  assert.equal(seen.clueText, ok.clueText);
  assert.deepEqual(seen.clue, { mode: 'preset', text: ok.clueText, hidden: false, state: 'shown' });
  assert.equal(srv.callAs('host', 'setClue', { roundId: 'ZZZZZZZZ', ...preset }).code, 'ROUND_NOT_FOUND');
});

test('AC 31: submitGuess - one per user, host rejected, invalid input, > 7 days expired', () => {
  const { srv, clock } = setup();
  const c = openRound(srv, 'host');
  assert.equal(srv.callAs('host', 'submitGuess', { roundId: c.roundId, pos: 50 }).code, 'OWN_ROUND');
  assert.equal(srv.callAs('a', 'submitGuess', { roundId: c.roundId, pos: 50.5 }).code, 'INVALID_INPUT');
  assert.equal(srv.callAs('a', 'submitGuess', { roundId: c.roundId, pos: 101 }).code, 'INVALID_INPUT');
  const g = srv.callAs('a', 'submitGuess', { roundId: c.roundId, pos: 0 });
  assert.deepEqual([g.ok, g.late, g.guessCount, g.revealed], [true, false, 1, false]);
  assert.equal(srv.callAs('a', 'submitGuess', { roundId: c.roundId, pos: 10 }).code, 'ALREADY_GUESSED');
  assert.equal(srv.callAs('a', 'getRound', { roundId: c.roundId }).myGuess.pos, 0, 'the first guess stays');
  clock.add(8 * 24 * H);
  assert.equal(srv.callAs('b', 'submitGuess', { roundId: c.roundId, pos: 10 }).code, 'ROUND_EXPIRED');
});

test('AC 32/33: host reveal needs >= 2 on-time guesses; the reveal view has target, rows, 默契值, 最懂你; late guesses are stored late', () => {
  const { srv } = setup();
  const c = openRound(srv, 'host');
  srv.callAs('a', 'submitGuess', { roundId: c.roundId, pos: c.target });
  assert.equal(srv.callAs('host', 'revealRound', { roundId: c.roundId }).code, 'TOO_FEW_GUESSES');
  const hv = srv.callAs('host', 'getRound', { roundId: c.roundId });
  assert.equal(hv.canReveal, false);
  const far = Math.min(100, c.target + 30);
  srv.callAs('b', 'submitGuess', { roundId: c.roundId, pos: far });
  assert.equal(srv.callAs('b', 'revealRound', { roundId: c.roundId }).code, 'NOT_HOST');
  assert.equal(srv.callAs('host', 'getRound', { roundId: c.roundId }).canReveal, true);
  const rv = srv.callAs('host', 'revealRound', { roundId: c.roundId });
  assert.equal(rv.ok, true);
  const exp = Math.round((100 + S.cardScore(far - c.target)) / 2);
  assert.equal(rv.reveal.target, c.target);
  assert.equal(rv.reveal.mq, exp);
  const hashA = sha256Hex('a|' + rv.reveal.salt).slice(0, 12);
  assert.equal(rv.reveal.closestH, hashA, '最懂你 is the exact guess');
  const hostRow = rv.reveal.rows.find((r) => r[4] === 1);
  assert.deepEqual([hostRow[1], hostRow[2], hostRow[3]], [null, null, 0], 'the host row has no score');
  assert.equal(rv.reveal.rows.filter((r) => r[4] === 0).length, 2);
  assert.deepEqual(srv.callAs('host', 'revealRound', { roundId: c.roundId }).reveal, rv.reveal, 'idempotent');
  // a late guess after the reveal: stored late, reveal returned, 默契值 unchanged
  const late = srv.callAs('late', 'submitGuess', { roundId: c.roundId, pos: c.target });
  assert.equal(late.ok, true);
  assert.equal(late.late, true);
  assert.equal(late.revealed, true);
  assert.equal(late.reveal.mq, exp);
  const lateRow = late.reveal.rows.find((r) => r[0] === late.reveal.selfHash);
  assert.deepEqual([lateRow[2], lateRow[3]], [null, 1], 'L4: a late row never shows a score');
  assert.notEqual(late.reveal.closestH, late.reveal.selfHash, '最懂你 excludes late guesses');
  const view = srv.callAs('a', 'getRound', { roundId: c.roundId });
  assert.equal(view.status, 'revealed');
  assert.equal(view.reveal.target, c.target);
  assert.equal(view.guessCount, 2);
});

test('AC 32: the 8th on-time guess reveals automatically; the 9th is late; exactly one reveal', () => {
  const { srv } = setup({ appConfig: { subscribe: { tmplId: 'T1' } } });
  const c = openRound(srv, 'host');
  assert.equal(srv.callAs('g0', 'subscribeRound', { roundId: c.roundId }).code, 'FORBIDDEN', 'a grant needs a guess first');
  const outs = [];
  for (let i = 0; i < 8; i++) {
    outs.push(srv.callAs('g' + i, 'submitGuess', { roundId: c.roundId, pos: 10 + i * 10 }));
    if (i < 7) assert.equal(srv.callAs('g' + i, 'subscribeRound', { roundId: c.roundId }).granted, true);
  }
  assert.equal(srv.callAs('g7', 'subscribeRound', { roundId: c.roundId }).granted, false, 'after the reveal there is nothing to notify');
  assert.ok(outs.slice(0, 7).every((o) => o.revealed === false));
  assert.equal(outs[7].revealed, true);
  assert.equal(srv.db.rounds[c.roundId].revealBy, 'count');
  assert.equal(srv.sent.length, 7, 'one message per grant');
  const nine = srv.callAs('g9', 'submitGuess', { roundId: c.roundId, pos: 5 });
  assert.equal(nine.late, true);
  // a second reveal path (host tap) after the count reveal sends nothing more
  assert.equal(srv.callAs('host', 'revealRound', { roundId: c.roundId }).ok, true);
  assert.equal(srv.sent.length, 7);
  assert.equal(srv.db.rounds[c.roundId].revealBy, 'count', 'revealBy is not overwritten');
});

test('AC 32: after 24 h a round with >= 1 guess reveals (sweep and lazy read); with 0 guesses it becomes noGuesses', () => {
  const { srv, clock } = setup();
  const a = openRound(srv, 'host');
  const b = openRound(srv, 'host');
  const c = openRound(srv, 'host');
  srv.callAs('g', 'submitGuess', { roundId: a.roundId, pos: 40 });
  srv.callAs('g', 'submitGuess', { roundId: b.roundId, pos: 40 });
  clock.add(24 * H);
  const swept = srv.runTimer('sweepRounds');
  assert.ok(swept.changed >= 3);
  assert.equal(srv.db.rounds[a.roundId].status, 'revealed');
  assert.equal(srv.db.rounds[a.roundId].revealBy, 'timer');
  assert.equal(srv.db.rounds[c.roundId].status, 'noGuesses');
  assert.equal(srv.callAs('host', 'getRound', { roundId: c.roundId }).status, 'noGuesses');
  assert.equal(srv.callAs('late', 'submitGuess', { roundId: c.roundId, pos: 10 }).code, 'ROUND_EXPIRED');
  // the lazy path: b was not swept in this scenario
  const s2 = setup();
  const r = openRound(s2.srv, 'host');
  s2.srv.callAs('g', 'submitGuess', { roundId: r.roundId, pos: 40 });
  s2.clock.add(25 * H);
  const view = s2.srv.callAs('host', 'getRound', { roundId: r.roundId });
  assert.equal(view.status, 'revealed');
  assert.equal(view.reveal.mq, S.cardScore(Math.abs(40 - r.target)));
});

test('AC 34: a draft without a clue after 30 minutes is gone (ROUND_NOT_FOUND for everyone, even the host)', () => {
  const { srv, clock } = setup();
  const c = srv.callAs('host', 'createRound', { spectrumId: 's001' });
  clock.add(31 * 60e3);
  assert.equal(srv.callAs('host', 'getRound', { roundId: c.roundId }).code, 'ROUND_NOT_FOUND');
  assert.equal(srv.db.rounds[c.roundId], undefined);
  const d = srv.callAs('host', 'createRound', { spectrumId: 's001' });
  clock.add(31 * 60e3);
  srv.runTimer('sweepRounds');
  assert.equal(srv.db.rounds[d.roundId], undefined, 'the sweep discards it too');
  assert.equal(srv.callAs('g', 'submitGuess', { roundId: d.roundId, pos: 5 }).code, 'ROUND_NOT_FOUND');
});

test('AC 35: createRound is limited to 20 a day per user', () => {
  const { srv, clock } = setup();
  for (let i = 0; i < 20; i++) assert.equal(srv.callAs('host', 'createRound', { spectrumId: 's001' }).ok, true);
  assert.equal(srv.callAs('host', 'createRound', { spectrumId: 's001' }).code, 'RATE_LIMITED');
  assert.equal(srv.callAs('other', 'createRound', { spectrumId: 's001' }).ok, true, 'per user');
  clock.set(BJ('20261106', 9, 0, 0));
  assert.equal(srv.callAs('host', 'createRound', { spectrumId: 's001' }).ok, true, 'resets the next Beijing day');
});

test('AC 62/63: no template -> no grants; with a template exactly one message per grant, no names or openids', () => {
  const none = setup();
  const r0 = openRound(none.srv, 'host');
  assert.equal(none.srv.callAs('host', 'subscribeRound', { roundId: r0.roundId }).code, 'NO_TEMPLATE');
  assert.equal(none.srv.callAs('host', 'getDaily', {}).features.subscribe, null);

  const { srv } = setup({ appConfig: { subscribe: { tmplId: 'TMPL' } } });
  assert.deepEqual(srv.callAs('host', 'getDaily', {}).features.subscribe, { tmplId: 'TMPL' });
  const c = openRound(srv, 'host');
  assert.equal(srv.callAs('stranger', 'subscribeRound', { roundId: c.roundId }).code, 'FORBIDDEN', 'must be the host or a guesser');
  assert.equal(srv.callAs('host', 'subscribeRound', { roundId: c.roundId }).ok, true);
  assert.equal(srv.callAs('host', 'subscribeRound', { roundId: c.roundId }).ok, true, 'idempotent');
  srv.callAs('a', 'submitGuess', { roundId: c.roundId, pos: 40 });
  srv.callAs('a', 'subscribeRound', { roundId: c.roundId });
  srv.callAs('b', 'submitGuess', { roundId: c.roundId, pos: 60 });
  assert.equal(Object.keys(srv.db.grants).length, 2);
  srv.callAs('host', 'revealRound', { roundId: c.roundId });
  srv.callAs('host', 'revealRound', { roundId: c.roundId });
  srv.runTimer('sweepRounds');
  assert.equal(srv.sent.length, 2);
  assert.deepEqual(srv.sent.map((m) => m.to).sort(), ['a', 'host']);
  srv.sent.forEach((m) => assert.deepEqual(Object.keys(m).sort(), ['left', 'mq', 'right', 'roundId', 'to']));
});

test('AC 49: round rows are hashed with a per-round salt; the same user hashes differently per round and per day', () => {
  const { srv, clock } = setup();
  const r1 = openRound(srv, 'host');
  const r2 = openRound(srv, 'host');
  [r1, r2].forEach((r) => {
    srv.callAs('a', 'submitGuess', { roundId: r.roundId, pos: 40 });
    srv.callAs('b', 'submitGuess', { roundId: r.roundId, pos: 50 });
  });
  const v1 = srv.callAs('host', 'revealRound', { roundId: r1.roundId }).reveal;
  const v2 = srv.callAs('host', 'revealRound', { roundId: r2.roundId }).reveal;
  assert.notEqual(v1.salt, v2.salt);
  const ha1 = sha256Hex('a|' + v1.salt).slice(0, 12);
  const ha2 = sha256Hex('a|' + v2.salt).slice(0, 12);
  assert.notEqual(ha1, ha2);
  assert.ok(v1.rows.some((r) => r[0] === ha1) && v2.rows.some((r) => r[0] === ha2));
  // daily rows: another date, another salt
  srv.callAs('a', 'submitCard', { dateKey: T1, idx: 0, pos: 1 });
  const salt1 = srv.callAs('a', 'getFriendBoard', { dateKey: T1 }).salt;
  clock.set(BJ('20261106', 9, 0, 0));
  const salt2 = srv.callAs('a', 'getFriendBoard', { dateKey: '20261106' }).salt;
  assert.notEqual(salt1, salt2);
  assert.notEqual(sha256Hex('a|' + salt1).slice(0, 12), sha256Hex('a|' + salt2).slice(0, 12));
});

test('AC 49: a scripted session never exposes an openid, an openGId or a field named openid/openGId', () => {
  const { srv } = setup();
  const ME = 'oV-secret-me';
  const FRIEND = 'oV-secret-friend';
  const G = 'secret-group-gid-123';
  const log = [];
  const call = (who, name, data) => {
    const r = srv.callAs(who, name, data);
    log.push(r);
    return r;
  };
  const ref = call(ME, 'joinGroup', { cloudID: srv.cloudID(G) }).groupRef;
  call(FRIEND, 'joinGroup', { cloudID: srv.cloudID(G) });
  call(ME, 'getDaily', { groupRef: ref });
  for (let i = 0; i < 5; i++) {
    call(FRIEND, 'submitCard', { dateKey: T1, idx: i, pos: 30 + i, groupRef: ref });
    call(ME, 'submitCard', { dateKey: T1, idx: i, pos: 50 + i, groupRef: ref });
  }
  call(ME, 'getGroupDay', { groupRef: ref, dateKey: T1 });
  call(ME, 'getFriendBoard', { dateKey: T1 });
  const c = call(ME, 'createRound', { spectrumId: 's001' });
  call(ME, 'setClue', { roundId: c.roundId, clueMode: 'preset', clueItemId: 's001i03' });
  call(FRIEND, 'submitGuess', { roundId: c.roundId, pos: 50, groupRef: ref });
  call('third', 'submitGuess', { roundId: c.roundId, pos: 60 });
  call(ME, 'revealRound', { roundId: c.roundId });
  call(FRIEND, 'getRound', { roundId: c.roundId });
  call(ME, 'getArchive', {});
  call(ME, 'track', { events: [{ name: 'group_join', props: { result: 'ok' } }] });
  allStrings(log).forEach((s) => {
    assert.ok(s.indexOf(ME) < 0 && s.indexOf(FRIEND) < 0 && s.indexOf(G) < 0, 'leaked: ' + s);
    assert.ok(!/^(openid|openGId|opengid)$/i.test(s), 'field name: ' + s);
  });
  assert.notEqual(ref, G);
  assert.match(ref, /^[0-9a-f]{16}$/);
});

test('AC 47: the group page lists the last rounds that received a guess carrying that groupRef', () => {
  const { srv } = setup();
  const ref = srv.callAs('me', 'joinGroup', { cloudID: srv.cloudID('G1') }).groupRef;
  const rounds = [];
  for (let i = 0; i < 12; i++) {
    const c = openRound(srv, 'host');
    srv.callAs('me', 'submitGuess', { roundId: c.roundId, pos: 40, groupRef: ref });
    rounds.push(c.roundId);
    srv.callAs('x', 'submitGuess', { roundId: c.roundId, pos: 40 }); // no group card
  }
  const unrelated = openRound(srv, 'host');
  srv.callAs('x', 'submitGuess', { roundId: unrelated.roundId, pos: 40 });
  const g = srv.callAs('me', 'getGroupDay', { groupRef: ref, dateKey: T1 });
  assert.equal(g.rounds.length, 10);
  assert.ok(g.rounds.every((r) => rounds.includes(r.roundId)));
  assert.ok(!g.rounds.some((r) => r.roundId === unrelated.roundId));
  g.rounds.forEach((r) => {
    assert.deepEqual(Object.keys(r).sort(), ['clue', 'guesses', 'left', 'mq', 'right', 'roundId', 'status']);
    assert.equal(r.mq, null, 'not revealed yet: no 默契值');
  });
});

test('AC 79: reportCard stores a row without text, limited to 10 a day, grants nothing', () => {
  const { srv } = setup();
  for (let i = 0; i < 10; i++) assert.equal(srv.callAs('a', 'reportCard', { itemId: 's001i0' + (i % 9 + 1), reason: ['unsuitable', 'ambiguous', 'typo'][i % 3], dateKey: T1 }).ok, true);
  assert.equal(srv.callAs('a', 'reportCard', { itemId: 's001i01', reason: 'typo' }).code, 'RATE_LIMITED');
  assert.equal(srv.db.reports.length, 10);
  assert.deepEqual(Object.keys(srv.db.reports[0]).sort(), ['dateKey', 'itemId', 'openid', 'reason', 'ts']);
  assert.equal(srv.callAs('b', 'reportCard', { itemId: 's001i01', reason: 'rude' }).code, 'INVALID_INPUT');
  assert.equal(srv.callAs('b', 'reportCard', { itemId: 's777i01', reason: 'typo' }).code, 'INVALID_INPUT');
});
