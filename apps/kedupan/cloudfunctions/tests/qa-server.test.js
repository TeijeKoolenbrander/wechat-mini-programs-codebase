'use strict';
// QA (independent) server-authority, privacy and window tests. Runs the REAL cloud functions on the fake database.
// Written by QA against spec.md section 17, not against the developers' summaries.
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeBackend, playDay, allStrings, disposeStages, BJ } = require('./helpers/backends');

const D1 = '20261105';
const D2 = '20261106';
const flat = (x) => JSON.stringify(x);
test.after(() => disposeStages());
const real = (name, opts, fn) => {
  if (typeof opts === 'function') {
    fn = opts;
    opts = {};
  }
  test('[qa] ' + name, async () => {
    const be = makeBackend('real', opts);
    try {
      await fn(be);
    } finally {
      be.dispose();
    }
  });
};

real('forged fields on submitCard are ignored: score/ref/openid/total never come from the client', async (be) => {
  await be.call('alice', 'getDaily', {});
  const r = await be.call('alice', 'submitCard', { dateKey: D1, idx: 0, pos: 0, score: 100, ref: 0, label: '心有灵犀', total: 500, openid: 'victim', OPENID: 'victim', n: 999, final: [0, 0, 0, 0, 0] });
  assert.equal(r.ok, true);
  assert.equal(r.pos, 0);
  assert.equal(await be.entryDoc(D1, 'victim'), null, 'an openid in the body never selects the entry owner');
  const e = await be.entryDoc(D1, 'alice');
  assert.equal(e.openid, 'alice');
  assert.deepEqual(Object.keys(e).filter((k) => ['score', 'total', 'final', 'ref'].includes(k)), []);
  assert.equal(await be.statsN(D1, 0), 1);
});

real('submitCard type confusion never throws and never writes', async (be) => {
  await be.call('alice', 'getDaily', {});
  const bad = [
    { pos: '50' }, { pos: null }, { pos: [50] }, { pos: { a: 1 } }, { pos: NaN }, { pos: Infinity }, { pos: 100.0000001 }, { pos: -0.5 }, { pos: true },
    { idx: '0' }, { idx: 0.5 }, { idx: null }, { idx: [0] }, { dateKey: 20261105 }, { dateKey: '' }, { dateKey: '20261105 ' }, { dateKey: '../x' },
  ];
  for (const b of bad) {
    const r = await be.call('alice', 'submitCard', { dateKey: D1, idx: 0, pos: 50, ...b });
    assert.equal(r.ok, false, flat(b));
    assert.equal(r.code, 'INVALID_INPUT', flat(b) + ' -> ' + r.code);
  }
  for (const ev of [null, undefined, 'x', 5, []]) {
    const r = await be.call('alice', 'submitCard', ev);
    assert.equal(r.ok, false);
  }
  assert.equal(await be.entryDoc(D1, 'alice'), null);
  assert.equal(await be.statsN(D1, 0), 0);
});

real('getDaily/submitCard responses never carry anchors, histograms, boardSalt or final of an open day', async (be) => {
  await be.seedCrowd(D1, 0, 300);
  const g = await be.call('alice', 'getDaily', {});
  const s1 = await be.call('alice', 'submitCard', { dateKey: D1, idx: 0, pos: 30 });
  const g2 = await be.call('alice', 'getDaily', {});
  for (const x of [g, s1, g2]) {
    const txt = flat(x);
    assert.ok(!/anchor|"hist|boardSalt|finalHist|"final"/.test(txt), txt.slice(0, 200));
  }
  assert.deepEqual(g2.refs.slice(1), [null, null, null, null]);
  assert.equal(g2.frozen, false);
});

real('a non-host never sees the target, the host id, the salt or others\' guesses before the reveal (every round endpoint)', async (be) => {
  const sp = be.content.spectra[10].id;
  const r = await be.call('host', 'createRound', { spectrumId: sp });
  assert.equal(typeof r.target, 'number');
  assert.equal((await be.call('g1', 'getRound', { roundId: r.roundId })).code, 'ROUND_NOT_FOUND');
  assert.equal((await be.call('g1', 'submitGuess', { roundId: r.roundId, pos: 10 })).code, 'ROUND_NOT_FOUND');
  assert.equal((await be.call('g1', 'subscribeRound', { roundId: r.roundId })).ok, false);
  await be.clue('host', r.roundId);
  const outs = [];
  outs.push(await be.call('g1', 'getRound', { roundId: r.roundId }));
  outs.push(await be.call('g1', 'submitGuess', { roundId: r.roundId, pos: r.target }));
  outs.push(await be.call('g2', 'submitGuess', { roundId: r.roundId, pos: 3 }));
  outs.push(await be.call('g1', 'getRound', { roundId: r.roundId }));
  outs.push(await be.call('g2', 'getRound', { roundId: r.roundId }));
  outs.push(await be.call('g2', 'revealRound', { roundId: r.roundId }));
  for (const o of outs) {
    const txt = flat(o).replace(/"isHost":(false|true)/g, '');
    assert.ok(!/"target"|hostOpenid|"salt"|"rows"|"reveal"|host/.test(txt), txt);
  }
  assert.equal(outs[5].code, 'NOT_HOST');
  const h = await be.call('host', 'getRound', { roundId: r.roundId });
  assert.equal(h.target, r.target);
  assert.equal(h.reveal, undefined);
  const only = await be.call('host', 'createRound', { spectrumId: be.content.spectra[11].id });
  await be.clue('host', only.roundId);
  await be.call('g1', 'submitGuess', { roundId: only.roundId, pos: 50 });
  assert.equal((await be.call('host', 'revealRound', { roundId: only.roundId })).code, 'TOO_FEW_GUESSES');
});

real('the clue cannot be changed after the first guess, and a stranger cannot set one; typed text is never stored', async (be) => {
  const r = await be.call('host', 'createRound', { spectrumId: be.content.spectra[10].id });
  assert.equal((await be.clue('mallory', r.roundId)).code, 'NOT_HOST');
  const first = await be.call('host', 'setClue', { roundId: r.roundId, clueMode: 'chat', clueText: '看我的' });
  assert.equal(first.code, 'INVALID_INPUT', 'the chat clue is gone (D-2)');
  assert.equal((await be.clue('host', r.roundId)).ok, true);
  await be.call('g1', 'submitGuess', { roundId: r.roundId, pos: 40 });
  const again = await be.call('host', 'setClue', { roundId: r.roundId, clueMode: 'preset', clueItemId: be.content.spectra[10].items[0].id });
  assert.equal(again.ok, false, 'clue is frozen once guesses exist');
  const view = await be.call('g1', 'getRound', { roundId: r.roundId });
  assert.ok(!/看我的/.test(flat(view)), 'typed text is never stored or shown');
});

real('grace window: D accepts cards to D+1 00:29:59; exact 00:30:00 and later are LATE_SUBMIT; a player who never started D cannot start it after midnight', async (be) => {
  be.clock.set(BJ(D1, 23, 59, 0));
  await be.call('alice', 'getDaily', {});
  assert.equal((await be.call('alice', 'submitCard', { dateKey: D1, idx: 0, pos: 40 })).ok, true);
  be.clock.set(BJ(D2, 0, 29, 59));
  assert.equal((await be.call('alice', 'submitCard', { dateKey: D1, idx: 1, pos: 40 })).ok, true);
  be.clock.set(BJ(D2, 0, 30, 0));
  const r = await be.call('alice', 'submitCard', { dateKey: D1, idx: 2, pos: 40 });
  assert.equal(r.code, 'LATE_SUBMIT', 'closes at 00:30:00 (spec 5: D+1 00:30)');
  be.clock.set(BJ(D2, 0, 10, 0));
  assert.equal((await be.call('bob', 'submitCard', { dateKey: D1, idx: 0, pos: 40 })).code, 'LATE_SUBMIT', 'bob never started D');
  assert.equal((await be.call('alice', 'submitCard', { dateKey: '20261107', idx: 0, pos: 1 })).code, 'INVALID_INPUT', 'future');
  const fb = await be.call('alice', 'getFriendBoard', { dateKey: D1 });
  assert.equal(fb.rows.length, 0, 'incomplete days never appear on boards');
});

real('定分: refs freeze at D+1 00:30; later cards cannot move them; finalizeDay and a lazy read agree; archive refuses open days', async (be) => {
  for (let i = 0; i < 12; i++) await playDay(be, 'u' + i, [10 + i, 20, 30, 40, 50]);
  be.clock.set(BJ(D2, 0, 10, 0));
  assert.equal((await be.call('u0', 'getArchiveDay', { dateKey: D1 })).code, 'DAY_OPEN', 'grace window: day is still open');
  be.clock.set(BJ(D2, 0, 31, 0));
  const arc = await be.call('u0', 'getArchiveDay', { dateKey: D1 });
  assert.equal(arc.ok, true, flat(arc));
  assert.equal(arc.finals.length, 5);
  const stored = (await be.setDoc(D1)).final;
  assert.deepEqual(stored, arc.finals, 'the lazily frozen refs are stored');
  be.clock.set(BJ(D2, 0, 40, 0));
  const t = await be.timer('finalizeDay');
  assert.equal(t.ok, true, flat(t));
  const doc = await be.setDoc(D1);
  assert.deepEqual(doc.final, stored, 'finalizeDay does not move frozen refs');
  assert.equal(doc.finalCount, 12);
  assert.equal(doc.finalHist.length, 101);
  const n0 = await be.statsN(D1, 0);
  assert.equal((await be.call('u0', 'submitCard', { dateKey: D1, idx: 0, pos: 99 })).ok, false);
  assert.equal(await be.statsN(D1, 0), n0);
});

real('unlockDistribution for today and inside the grace window only returns cards the caller answered', async (be) => {
  for (let i = 0; i < 4; i++) await playDay(be, 'c' + i, [50, 50, 50, 50, 50]);
  await be.call('p', 'getDaily', {});
  await be.call('p', 'submitCard', { dateKey: D1, idx: 0, pos: 50 });
  let r = await be.call('p', 'unlockDistribution', { dateKey: D1 });
  assert.equal(r.ok, true);
  assert.ok(Array.isArray(r.hist[0]) && r.hist.slice(1).every((h) => h === null));
  be.clock.set(BJ(D2, 0, 10, 0));
  r = await be.call('p', 'unlockDistribution', { dateKey: D1 });
  assert.equal(r.ok, true);
  assert.ok(r.hist.slice(1).every((h) => h === null), 'D is still open during the grace window: unanswered cards stay hidden');
});

real('day rate limits: reportCard 10, createRound 20, unlockDistribution (configured cap) per Beijing day, then reset the next day', async (be) => {
  const item = be.content.spectra[0].items[0].id;
  for (let i = 0; i < 10; i++) assert.equal((await be.call('u', 'reportCard', { itemId: item, reason: 'typo' })).ok, true);
  assert.equal((await be.call('u', 'reportCard', { itemId: item, reason: 'typo' })).code, 'RATE_LIMITED');
  assert.equal(await be.count('card_reports'), 10);
  for (let i = 0; i < 20; i++) assert.equal((await be.call('u', 'createRound', { spectrumId: be.content.spectra[i].id })).ok, true);
  assert.equal((await be.call('u', 'createRound', { spectrumId: be.content.spectra[21].id })).code, 'RATE_LIMITED');
  await be.call('u', 'getDaily', {});
  // spec 11.2 says <= 3 a day; decisions TD-8 raised it to config.limits.distributionPerDay (QA notes the deviation in the matrix)
  const lim = require('../../game/core/config').CONFIG.limits.distributionPerDay;
  for (let i = 0; i < lim; i++) assert.equal((await be.call('u', 'unlockDistribution', { dateKey: D1 })).ok, true);
  assert.equal((await be.call('u', 'unlockDistribution', { dateKey: D1 })).code, 'RATE_LIMITED');
  be.clock.set(BJ(D2, 9, 0, 0));
  assert.equal((await be.call('u', 'reportCard', { itemId: item, reason: 'typo' })).ok, true, 'resets on the next Beijing day');
});

real('getBonusCard: only closed-day cards, 3 a day, never an anchor or a histogram', async (be) => {
  for (let i = 0; i < 3; i++) await playDay(be, 'x' + i, [50, 50, 50, 50, 50]);
  be.clock.set(BJ(D2, 9, 0, 0));
  await be.timer('finalizeDay');
  let served = 0;
  for (let i = 0; i < 3; i++) {
    const r = await be.call('x2fresh', 'getBonusCard', {});
    if (r.code === 'NO_CARD_AVAILABLE') break;
    assert.equal(r.ok, true, flat(r));
    assert.ok(!/anchor|hist/.test(flat(r)));
    assert.notEqual(r.dateKey, D2, 'never today');
    served++;
  }
  assert.ok(served > 0);
  const fourth = await be.call('x2fresh', 'getBonusCard', {});
  assert.ok(['RATE_LIMITED', 'NO_CARD_AVAILABLE'].includes(fourth.code));
});

real('privacy: a long scripted session never exposes an openid, an openGId or a key named openid', async (be) => {
  const ids = ['oQA_host_AAA111', 'oQA_g1_BBB222', 'oQA_g2_CCC333', 'oQA_g3_DDD444'];
  const GID = 'opengid-QA-SECRET-XYZ';
  const REF = 'a1b2c3d4e5f60718';
  const responses = [];
  const c = async (who, fn, data) => {
    const r = await be.call(who, fn, data);
    responses.push(r);
    return r;
  };
  for (const id of ids) await be.putMember(GID, id, REF);
  for (const id of ids) {
    await c(id, 'getDaily', { groupRef: REF });
    for (let i = 0; i < 5; i++) await c(id, 'submitCard', { dateKey: D1, idx: i, pos: 20 + 10 * i, groupRef: REF });
    await c(id, 'getGroupDay', { groupRef: REF, dateKey: D1 });
    await c(id, 'getFriendBoard', { dateKey: D1 });
    await c(id, 'track', { sessionId: 's', events: [{ name: 'group_join', props: { groupRef: REF, openGId: GID, openid: id, result: 'ok' }, clientTs: 1 }] });
  }
  const r = await c(ids[0], 'createRound', { spectrumId: be.content.spectra[5].id });
  await c(ids[0], 'setClue', { roundId: r.roundId, clueMode: 'preset', clueItemId: be.content.spectra[5].items[0].id });
  for (const id of ids.slice(1)) {
    await c(id, 'getRound', { roundId: r.roundId });
    await c(id, 'submitGuess', { roundId: r.roundId, pos: 30, groupRef: REF });
  }
  await c(ids[0], 'revealRound', { roundId: r.roundId });
  for (const id of ids) await c(id, 'getRound', { roundId: r.roundId, groupRef: REF });
  await c(ids[1], 'getGroupDay', { groupRef: REF, dateKey: D1 });
  be.clock.set(BJ(D2, 9, 0, 0));
  await be.timer('finalizeDay');
  for (const id of ids) {
    await c(id, 'getArchive', {});
    await c(id, 'getArchiveDay', { dateKey: D1 });
    await c(id, 'getDaily', {});
  }
  assert.ok(responses.length > 60);
  for (const resp of responses) {
    for (const s of allStrings(resp)) {
      for (const id of ids) assert.ok(!s.includes(id), 'openid leaked in ' + flat(resp).slice(0, 300));
      assert.ok(!s.includes(GID), 'openGId leaked');
      assert.ok(!/^(openid|openGId|opengid|hostOpenid)$/i.test(s), 'key named ' + s);
    }
  }
  for (const col of ['kedupan_events']) {
    const docs = be.db.all ? be.db.all(col) : [];
    for (const e of docs) assert.ok(!new RegExp(REF + '|opengid-QA|oQA_').test(flat(e.props || {})), flat(e));
  }
});

real('a row hash for the same player differs between days', async (be) => {
  await playDay(be, 'p1', [10, 20, 30, 40, 50]);
  const a = (await be.call('p1', 'getFriendBoard', { dateKey: D1 })).selfHash;
  be.clock.set(BJ(D2, 10, 0, 0));
  await playDay(be, 'p1', [10, 20, 30, 40, 50]);
  const b = (await be.call('p1', 'getFriendBoard', { dateKey: D2 })).selfHash;
  assert.notEqual(a, b);
  assert.match(a, /^[0-9a-f]{12}$/);
});

real('group page: non-member -> NOT_MEMBER with no data; positions hidden until the viewer completes; no group block for a foreign groupRef', async (be) => {
  const ref = 'a1b2c3d4e5f60718';
  for (const m of ['m1', 'm2', 'm3']) await be.putMember('G1', m, ref);
  await playDay(be, 'm1', [10, 20, 30, 40, 50], { groupRef: ref });
  await playDay(be, 'm2', [15, 25, 35, 45, 55], { groupRef: ref });
  const out = await be.call('outsider', 'getGroupDay', { groupRef: ref, dateKey: D1 });
  assert.equal(out.code, 'NOT_MEMBER');
  assert.ok(!('rows' in out));
  const notDone = await be.call('m3', 'getGroupDay', { groupRef: ref, dateKey: D1 });
  assert.equal(notDone.ok, true);
  assert.equal(notDone.viewerDone, false);
  for (const row of notDone.rows) assert.equal(row[4], null, 'no positions before the viewer completes');
  assert.equal((await be.call('m1', 'getGroupDay', { groupRef: ref, dateKey: '20261102' })).ok, false);
  const done = await be.call('m1', 'getGroupDay', { groupRef: ref, dateKey: D1 });
  assert.equal(done.viewerDone, true);
  assert.equal(done.mq, null, 'n=2 -> no 群默契度');
  await be.call('outsider', 'getDaily', {});
  const s = await be.call('outsider', 'submitCard', { dateKey: D1, idx: 0, pos: 10, groupRef: ref });
  assert.ok(s.group === null || s.group === undefined, flat(s.group));
});

real('16:00 UTC boundary: the daily key flips with the server clock only', async (be) => {
  be.clock.set(Date.UTC(2026, 10, 5, 15, 59, 59));
  assert.equal((await be.call('a', 'getDaily', {})).dateKey, '20261105');
  be.clock.set(Date.UTC(2026, 10, 5, 16, 0, 0));
  assert.equal((await be.call('a', 'getDaily', {})).dateKey, '20261106');
});

real('timers refuse clients; hostile input to every function never yields INTERNAL', async (be) => {
  for (const t of ['genDaily', 'finalizeDay', 'sweepRounds', 'cleanup']) {
    const r = await be.call('hacker', t, {});
    assert.equal(r.ok, false);
    assert.equal(r.code, 'FORBIDDEN', t);
  }
  const fns = ['getDaily', 'submitCard', 'getArchive', 'getArchiveDay', 'getBonusCard', 'unlockDistribution', 'getGroupDay', 'getFriendBoard', 'createRound', 'setClue', 'getRound', 'submitGuess', 'revealRound', 'subscribeRound', 'reportCard', 'track', 'joinGroup'];
  const hostile = [{}, { roundId: {}, dateKey: [], pos: {}, idx: {}, spectrumId: [], before: {}, limit: 'x', events: 'x', groupData: 5, groupRef: 5 }, { constructor: 1, __proto__: { x: 1 } }];
  for (const f of fns) {
    for (const ev of hostile) {
      const r = await be.call('fuzz', f, ev);
      assert.equal(typeof r.ok, 'boolean', f);
      assert.notEqual(r.code, 'INTERNAL', f + ' -> INTERNAL on ' + flat(ev));
    }
  }
});

// QA-1 (fixed): spec 12 server events. Every server-side event is written by the function that owns the moment.
const evs = (be, name) => be.db.all('kedupan_events').filter((e) => e.name === name);
const mkRound = async (be, idx) => {
  const r = await be.call('host', 'createRound', { spectrumId: be.content.spectra[idx || 5].id });
  await be.clue('host', r.roundId);
  return r;
};

real('AC 77/78: a host reveal writes the server event round_reveal (by, guesses, mq) exactly once', async (be) => {
  const r = await mkRound(be);
  await be.call('g1', 'submitGuess', { roundId: r.roundId, pos: 30 });
  await be.call('g2', 'submitGuess', { roundId: r.roundId, pos: 60 });
  const rev = await be.call('host', 'revealRound', { roundId: r.roundId });
  assert.equal(rev.ok, true);
  await be.call('host', 'revealRound', { roundId: r.roundId }); // idempotent repeat
  await be.call('g1', 'getRound', { roundId: r.roundId });
  const ev = evs(be, 'round_reveal');
  assert.equal(ev.length, 1);
  assert.equal(ev[0].props.by, 'host');
  assert.equal(ev[0].props.guesses, 2);
  assert.equal(ev[0].props.roundId, r.roundId);
  assert.equal(typeof ev[0].props.mq, 'number');
  assert.equal(ev[0].openid, 'server');
  assert.deepEqual(Object.keys(ev[0].props).sort(), ['by', 'guesses', 'mq', 'roundId']);
});

real('AC 77: the 8th on-time guess reveals by count and writes one round_reveal with 8 guesses', async (be) => {
  const r = await mkRound(be);
  for (let i = 1; i <= 8; i++) assert.equal((await be.call('g' + i, 'submitGuess', { roundId: r.roundId, pos: 10 * i })).ok, true);
  const ev = evs(be, 'round_reveal');
  assert.equal(ev.length, 1);
  assert.equal(ev[0].props.by, 'count');
  assert.equal(ev[0].props.guesses, 8);
  await be.call('host', 'revealRound', { roundId: r.roundId });
  assert.equal(evs(be, 'round_reveal').length, 1, 'a host tap after the auto reveal does not add one');
});

real('AC 77: the 24 h timer reveal (lazy read and sweep) writes round_reveal by timer once', async (be) => {
  const a = await mkRound(be, 5);
  const b = await mkRound(be, 6);
  const lone = await mkRound(be, 7);
  for (const r of [a, b]) {
    await be.call('g1', 'submitGuess', { roundId: r.roundId, pos: 30 });
    await be.call('g2', 'submitGuess', { roundId: r.roundId, pos: 50 });
  }
  await be.call('g1', 'submitGuess', { roundId: lone.roundId, pos: 30 });
  be.clock.add(25 * 3600e3);
  await be.call('g1', 'getRound', { roundId: a.roundId }); // lazy path
  await be.timer('sweepRounds'); // sweep path (b, and a again)
  await be.timer('sweepRounds');
  const ev = evs(be, 'round_reveal');
  assert.equal(ev.length, 3, 'one per round, none doubled by the second sweep');
  for (const e of ev) assert.equal(e.props.by, 'timer');
  const byId = Object.fromEntries(ev.map((e) => [e.props.roundId, e.props]));
  assert.equal(byId[a.roundId].guesses, 2);
  assert.equal(byId[b.roundId].guesses, 2);
  assert.equal(byId[lone.roundId].guesses, 1, 'a 1-guess timer reveal is logged; the KPI filters guesses >= 2');
  assert.equal(typeof byId[lone.roundId].mq, 'number');
});

real('AC 77: a host tap racing the 8th guess produces a single round_reveal', async (be) => {
  const r = await mkRound(be);
  for (let i = 1; i <= 7; i++) await be.call('g' + i, 'submitGuess', { roundId: r.roundId, pos: 10 * i });
  await Promise.all([be.call('g8', 'submitGuess', { roundId: r.roundId, pos: 80 }), be.call('host', 'revealRound', { roundId: r.roundId })]);
  assert.equal(evs(be, 'round_reveal').length, 1);
});

real('AC 77: getGroupDay writes board_list (view group, mode, rows, bytes) per response, without identifiers', async (be) => {
  const ref = 'a1b2c3d4e5f60718';
  for (const m of ['m1', 'm2', 'm3']) await be.putMember('G1', m, ref);
  await playDay(be, 'm1', [10, 20, 30, 40, 50], { groupRef: ref });
  await be.call('m3', 'getGroupDay', { groupRef: ref, dateKey: D1 });
  await be.call('m1', 'getGroupDay', { groupRef: ref, dateKey: D1 });
  assert.equal((await be.call('outsider', 'getGroupDay', { groupRef: ref, dateKey: D1 })).ok, false);
  const ev = evs(be, 'board_list').filter((e) => e.props.view === 'group');
  assert.equal(ev.length, 2, 'one per successful response, none for NOT_MEMBER');
  assert.deepEqual(ev.map((e) => e.props.mode), ['locked', 'full']);
  for (const e of ev) {
    assert.equal(typeof e.props.rows, 'number');
    assert.ok(e.props.bytes > 0);
    assert.ok(!new RegExp(ref + '|G1|m1|m3').test(flat(e.props)));
  }
  await be.call('m1', 'getFriendBoard', { dateKey: D1 });
  assert.equal(evs(be, 'board_list').filter((e) => e.props.view === 'friend').length, 1);
});

real('AC 77: subscribe_send is written per claimed grant with where host/guess and the result', async (be) => {
  await be.setAppConfig({ subscribe: { tmplId: 'T', fields: {} } });
  const r = await mkRound(be);
  await be.call('host', 'subscribeRound', { roundId: r.roundId });
  await be.call('g1', 'submitGuess', { roundId: r.roundId, pos: 30 });
  await be.call('g2', 'submitGuess', { roundId: r.roundId, pos: 60 });
  await be.call('g1', 'subscribeRound', { roundId: r.roundId });
  await be.call('host', 'revealRound', { roundId: r.roundId });
  const ev = evs(be, 'subscribe_send');
  assert.equal(ev.length, 2);
  assert.deepEqual(ev.map((e) => e.props.where).sort(), ['guess', 'host']);
  assert.ok(ev.every((e) => e.props.result === 'ok' && !/g1|oQ/.test(flat(e.props))));
});

real('AC 77: genDaily writes daily_gen and finalizeDay writes finalize_day', async (be) => {
  await be.timer('genDaily');
  const g = evs(be, 'daily_gen');
  assert.equal(g.length, 1);
  assert.match(g[0].props.dateKey, /^\d{8}$/);
  assert.ok(g[0].props.source && typeof g[0].props.ms === 'number');
  await playDay(be, 'p1', [10, 20, 30, 40, 50]);
  be.clock.set(BJ(D2, 0, 45, 0));
  await be.timer('finalizeDay');
  const f = evs(be, 'finalize_day').find((e) => e.props.dateKey === D1);
  assert.ok(f, 'finalize_day for ' + D1);
  assert.equal(f.props.finalCount, 1);
  assert.ok(!f.props.failed);
});

real('AC 77: server events use only the spec 12 server names and carry no identifiers', async (be) => {
  await be.setAppConfig({ subscribe: { tmplId: 'T', fields: {} } });
  const r = await mkRound(be);
  await be.call('g1', 'submitGuess', { roundId: r.roundId, pos: 30 });
  await be.call('g1', 'subscribeRound', { roundId: r.roundId });
  await be.call('g2', 'submitGuess', { roundId: r.roundId, pos: 60 });
  await be.call('host', 'revealRound', { roundId: r.roundId });
  await playDay(be, 'g1', [10, 20, 30, 40, 50]);
  await be.call('g1', 'getFriendBoard', { dateKey: D1 });
  await be.timer('genDaily');
  const serverNames = new Set(['round_reveal', 'subscribe_send', 'daily_gen', 'finalize_day', 'board_list']);
  const server = be.db.all('kedupan_events').filter((e) => e.openid === 'server');
  assert.ok(server.length >= 4, server.map((e) => e.name).join());
  for (const e of server) {
    assert.ok(serverNames.has(e.name), e.name);
    assert.ok(!/"(openid|groupRef|openGId)"/i.test(flat(e.props)));
  }
});
