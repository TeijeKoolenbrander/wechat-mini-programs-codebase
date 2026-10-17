'use strict';
// Host rounds: AC 26-35, 62, 63, 79 (server side).
const assert = require('node:assert/strict');
const R = require('../../../game/core/rounds');
const { rowHash } = require('../../common/util');
const { allStrings } = require('../helpers/backends');

const flat = (x) => JSON.stringify(x);
const HOUR = 3600e3;

async function openRound(be, host, spectrumId) {
  const sp = spectrumId || be.content.spectra[3].id;
  const r = await be.call(host, 'createRound', { spectrumId: sp });
  assert.equal(r.ok, true, flat(r));
  const c = await be.clue(host, r.roundId);
  assert.equal(c.ok, true, flat(c));
  return r;
}
async function guessAs(be, users, roundId, positions) {
  const out = [];
  for (let i = 0; i < users.length; i++) {
    be.clock.add(1000);
    out.push(await be.call(users[i], 'submitGuess', { roundId, pos: positions[i] }));
  }
  return out;
}
const SUB = { subscribe: { tmplId: 'TMPL-TEST', fields: { spectrum: 'thing1', mq: 'number2', time: 'time3' } } };

module.exports = function rounds(T) {
  const { test } = T;

  test('AC 26: createRound: target 5..95 and roughly uniform; host-only; a non-host never receives it before the reveal', async (be) => {
    assert.equal((await be.call('h', 'createRound', { spectrumId: 'bad' })).code, 'INVALID_INPUT');
    assert.equal((await be.call('h', 'createRound', { spectrumId: 's999' })).code, 'INVALID_INPUT');
    assert.equal((await be.call('h', 'createRound', {})).code, 'INVALID_INPUT');
    const dec = new Array(10).fill(0);
    let min = 999;
    let max = -1;
    for (let u = 0; u < 20; u++) {
      for (let i = 0; i < 20; i++) {
        const r = await be.call('h' + u, 'createRound', { spectrumId: be.content.spectra[(u + i) % 50].id });
        assert.equal(r.ok, true);
        min = Math.min(min, r.target);
        max = Math.max(max, r.target);
        dec[Math.min(9, Math.floor((r.target - 5) / 9.1))]++;
      }
    }
    assert.ok(min >= 5 && max <= 95, `${min}..${max}`);
    dec.forEach((c) => assert.ok(c >= 12 && c <= 70, 'decile ' + c));
    const r = await openRound(be, 'host');
    assert.match(r.roundId, /^[A-Z2-7]{8}$/);
    assert.equal(typeof r.target, 'number');
    const guest = await be.call('g1', 'getRound', { roundId: r.roundId });
    assert.equal(guest.ok, true);
    assert.equal(guest.isHost, false);
    assert.ok(!('target' in guest), 'no target for a guest');
    assert.ok(!flat(guest).includes('"target"'));
    const host = await be.call('host', 'getRound', { roundId: r.roundId });
    assert.equal(host.target, r.target);
    assert.equal(host.status, 'open');
    assert.equal(host.canReveal, false);
    const sub = await be.call('g1', 'submitGuess', { roundId: r.roundId, pos: 50 });
    assert.ok(!flat(sub).includes('"target"'));
  });

  test('AC 28/29: setClue: preset must belong to the spectrum, host only, only before the first guess, no free text; drafts expire', async (be) => {
    const sp = be.content.spectra[3];
    const other = be.content.spectra[4];
    const r = await be.call('host', 'createRound', { spectrumId: sp.id });
    const draft = await be.call('g1', 'getRound', { roundId: r.roundId });
    assert.equal(draft.code, 'ROUND_NOT_FOUND', 'drafts belong to the host');
    assert.equal((await be.call('g1', 'submitGuess', { roundId: r.roundId, pos: 5 })).code, 'ROUND_NOT_FOUND');
    const hostDraft = await be.call('host', 'getRound', { roundId: r.roundId });
    assert.equal(hostDraft.status, 'draft');
    assert.equal((await be.call('host', 'setClue', { roundId: r.roundId, clueMode: 'preset', clueItemId: other.items[0].id })).code, 'INVALID_INPUT');
    assert.equal((await be.call('host', 'setClue', { roundId: r.roundId, clueMode: 'free', text: 'x' })).code, 'INVALID_INPUT');
    assert.equal((await be.call('host', 'setClue', { roundId: r.roundId, clueMode: 'preset' })).code, 'INVALID_INPUT');
    assert.equal((await be.clue('g1', r.roundId)).code, 'NOT_HOST');
    const preset = { clueMode: 'preset', clueItemId: sp.items[0].id };
    assert.equal((await be.call('host', 'setClue', { roundId: 'AAAAAAAA', ...preset })).code, 'ROUND_NOT_FOUND');
    assert.equal((await be.call('host', 'setClue', { roundId: 'bad', ...preset })).code, 'INVALID_INPUT');
    assert.equal((await be.call('host', 'setClue', { roundId: r.roundId, clueMode: 'chat' })).code, 'INVALID_INPUT', 'D-2: 我在群里说 is removed');
    assert.equal((await be.call('host', 'setClue', { roundId: r.roundId, clueMode: 'text' })).code, 'INVALID_INPUT', 'a typed clue needs clueText');
    const ok = await be.call('host', 'setClue', { roundId: r.roundId, clueMode: 'preset', clueItemId: sp.items[1].id });
    assert.deepEqual(ok, { ok: true, status: 'open', clueMode: 'preset', clueText: sp.items[1].text });
    const g = await be.call('g1', 'getRound', { roundId: r.roundId });
    assert.equal(g.clueMode, 'preset');
    assert.equal(g.clueText, sp.items[1].text);
    await be.call('g1', 'submitGuess', { roundId: r.roundId, pos: 40 });
    assert.equal((await be.clue('host', r.roundId)).code, 'ROUND_EXPIRED', 'not after the first guess');
    // a preset ignores any clueText sent along (typed text only goes through clueMode text)
    const r2 = await be.call('host', 'createRound', { spectrumId: sp.id });
    const c2 = await be.call('host', 'setClue', { roundId: r2.roundId, clueMode: 'preset', clueItemId: sp.items[2].id, clueText: 'free text must be ignored' });
    assert.deepEqual(c2, { ok: true, status: 'open', clueMode: 'preset', clueText: sp.items[2].text });
    // a draft left for 31 minutes is gone
    const r3 = await be.call('host', 'createRound', { spectrumId: sp.id });
    be.clock.add(31 * 60e3);
    assert.equal((await be.clue('host', r3.roundId)).code, 'ROUND_NOT_FOUND');
    assert.equal(await be.roundDoc(r3.roundId), null);
  });

  test('AC 30/31: submitGuess rules: host, duplicates, range, one guess per player, expiry', async (be) => {
    const r = await openRound(be, 'host');
    assert.equal((await be.call('host', 'submitGuess', { roundId: r.roundId, pos: 50 })).code, 'OWN_ROUND');
    for (const bad of [{ pos: 101 }, { pos: -1 }, { pos: 1.5 }, { pos: '5' }, {}]) {
      assert.equal((await be.call('g1', 'submitGuess', { roundId: r.roundId, ...bad })).code, 'INVALID_INPUT');
    }
    assert.equal((await be.call('g1', 'submitGuess', { roundId: 'AAAAAAAA', pos: 5 })).code, 'ROUND_NOT_FOUND');
    const a = await be.call('g1', 'submitGuess', { roundId: r.roundId, pos: 0 });
    assert.deepEqual(a, { ok: true, late: false, guessCount: 1, revealed: false });
    assert.equal((await be.call('g1', 'submitGuess', { roundId: r.roundId, pos: 90 })).code, 'ALREADY_GUESSED');
    const view = await be.call('g1', 'getRound', { roundId: r.roundId });
    assert.deepEqual(view.myGuess, { pos: 0, late: false });
    assert.equal(view.guessCount, 1);
    assert.equal(view.canReveal, false);
    const hostView = await be.call('host', 'getRound', { roundId: r.roundId });
    assert.equal(hostView.canReveal, false, 'needs 2 guesses');
    await be.call('g2', 'submitGuess', { roundId: r.roundId, pos: 100 });
    assert.equal((await be.call('host', 'getRound', { roundId: r.roundId })).canReveal, true);
  });

  test('AC 32/33: the host reveals: payload, mq from the core, idempotent, late guesses never change it', async (be) => {
    const r = await openRound(be, 'host');
    assert.equal((await be.call('host', 'revealRound', { roundId: r.roundId })).code, 'TOO_FEW_GUESSES');
    const pos = [r.target, Math.min(100, r.target + 10), Math.max(0, r.target - 30)];
    await guessAs(be, ['g1', 'g2', 'g3'], r.roundId, pos);
    assert.equal((await be.call('g1', 'revealRound', { roundId: r.roundId })).code, 'NOT_HOST');
    assert.equal((await be.call('host', 'revealRound', { roundId: 'AAAAAAAA' })).code, 'ROUND_NOT_FOUND');
    const rev = await be.call('host', 'revealRound', { roundId: r.roundId });
    assert.equal(rev.ok, true, flat(rev));
    const x = rev.reveal;
    const expect = R.scoreRound(r.target, pos.map((p, i) => ({ id: String(i), pos: p, ts: i, late: false })));
    assert.equal(x.target, r.target);
    assert.equal(x.mq, expect.mq);
    assert.equal(x.revealBy, 'host');
    assert.match(x.salt, /^[0-9a-f]{16,32}$/);
    assert.equal(x.selfHash, rowHash('host', x.salt));
    assert.equal(x.rows.length, 4, '3 guesses + the host row');
    const g1 = x.rows.find((row) => row[0] === rowHash('g1', x.salt));
    assert.deepEqual(g1.slice(1), [r.target, 100, 0, 0]);
    assert.deepEqual(x.rows[3], [rowHash('host', x.salt), null, null, 0, 1], 'host row last, no score');
    assert.equal(x.closestH, rowHash('g1', x.salt));
    assert.equal(x.rows[0][0], x.closestH, 'rows by closeness');
    const again = await be.call('host', 'revealRound', { roundId: r.roundId });
    assert.equal(again.ok, true);
    assert.equal(again.reveal.revealedAt, x.revealedAt, 'idempotent');
    assert.equal(again.reveal.mq, x.mq);
    // a guesser sees the reveal incl. the target; a stranger who could still guess late does not (L4)
    const gv = await be.call('g1', 'getRound', { roundId: r.roundId });
    assert.equal(gv.status, 'revealed');
    assert.equal(gv.reveal.target, r.target);
    assert.equal(gv.reveal.selfHash, rowHash('g1', x.salt));
    assert.ok(!('target' in gv), 'only inside reveal');
    const hidden = await be.call('g4', 'getRound', { roundId: r.roundId });
    assert.equal(hidden.answerHidden, true);
    assert.ok(!('reveal' in hidden) && !('target' in hidden));
    // late guess: stored, flagged, no effect on mq or guessCount
    const late = await be.call('g4', 'submitGuess', { roundId: r.roundId, pos: 0 });
    assert.equal(late.ok, true);
    assert.equal(late.late, true);
    assert.equal(late.guessCount, 3);
    assert.equal(late.revealed, true);
    assert.equal(late.reveal.mq, x.mq);
    const lateRow = late.reveal.rows.find((row) => row[0] === rowHash('g4', x.salt));
    assert.equal(lateRow[3], 1);
    assert.equal(late.reveal.rows[late.reveal.rows.length - 2][0], rowHash('g4', x.salt), 'late rows after on-time rows, before the host');
    const strs = allStrings(await be.call('g1', 'getRound', { roundId: r.roundId })).join('|');
    for (const s of ['g1', 'g2', 'g3', 'g4', 'hostOpenid']) assert.ok(!strs.includes(s), 'leak ' + s);
  });

  test('AC 32: the 8th on-time guess reveals (by count); sequential and under concurrency exactly one reveal', async (be) => {
    const r = await openRound(be, 'host');
    const users = Array.from({ length: 7 }, (_x, i) => 'u' + i);
    const first = await guessAs(be, users, r.roundId, [10, 20, 30, 40, 50, 60, 70]);
    assert.ok(first.every((g) => g.revealed === false));
    const eighth = await be.call('u7', 'submitGuess', { roundId: r.roundId, pos: 80 });
    assert.equal(eighth.revealed, true);
    assert.equal(eighth.reveal.revealBy, 'count');
    assert.equal(eighth.guessCount, 8);
    assert.equal(eighth.reveal.rows.length, 9);
    const ninth = await be.call('u8', 'submitGuess', { roundId: r.roundId, pos: 5 });
    assert.equal(ninth.late, true);
    assert.equal(ninth.guessCount, 8);

    const r2 = await openRound(be, 'host');
    const many = Array.from({ length: 14 }, (_x, i) => 'p' + i);
    const res = await Promise.all(many.map((u, i) => be.call(u, 'submitGuess', { roundId: r2.roundId, pos: (i * 7) % 101 })));
    assert.ok(res.every((x) => x.ok));
    const view = await be.call('host', 'getRound', { roundId: r2.roundId });
    assert.equal(view.status, 'revealed');
    assert.equal(view.reveal.revealBy, 'count');
    assert.ok(view.guessCount >= 8 && view.guessCount <= 14);
    assert.equal(res.filter((x) => !x.late).length, view.guessCount, 'every on-time guess is counted exactly once');
    const doc = await be.roundDoc(r2.roundId);
    assert.equal(doc.mq, view.reveal.mq);
    assert.equal(view.reveal.rows.length, 14 + 1);
    const onTime = view.reveal.rows.filter((row) => row[4] === 0 && row[3] === 0);
    assert.equal(onTime.length, view.guessCount);
    assert.equal(view.reveal.mq, Math.round(onTime.reduce((a, row) => a + row[2], 0) / onTime.length), 'mq covers exactly the on-time guesses');
  });

  test('AC 34: 24 h: a round with guesses reveals by timer (lazily and by the sweep), one without becomes noGuesses; stale drafts are swept', async (be) => {
    const a = await openRound(be, 'host');
    await guessAs(be, ['g1', 'g2', 'g3'], a.roundId, [10, 50, 90]);
    const b = await openRound(be, 'host');
    const c = await openRound(be, 'host');
    await guessAs(be, ['g1'], c.roundId, [40]);
    const d = await be.call('host', 'createRound', { spectrumId: be.content.spectra[7].id });
    const created = (await be.roundDoc(a.roundId)).createdAt;
    be.clock.set(created + 24 * HOUR - 1);
    assert.equal((await be.call('g1', 'getRound', { roundId: a.roundId })).status, 'open', 'one ms before 24 h');
    be.clock.set(created + 24 * HOUR + 10 * 60e3);
    const lazy = await be.call('g1', 'getRound', { roundId: a.roundId });
    assert.equal(lazy.status, 'revealed');
    assert.equal(lazy.reveal.revealBy, 'timer');
    const sw = await be.timer('sweepRounds');
    assert.equal(sw.ok, true);
    assert.ok(sw.changed >= 2, 'noGuesses + timer reveal + discarded draft: ' + sw.changed);
    assert.equal((await be.call('host', 'getRound', { roundId: b.roundId })).status, 'noGuesses');
    assert.equal((await be.call('g9', 'submitGuess', { roundId: b.roundId, pos: 5 })).code, 'ROUND_EXPIRED');
    const cv = await be.call('g1', 'getRound', { roundId: c.roundId });
    assert.equal(cv.status, 'revealed');
    assert.equal(cv.reveal.revealBy, 'timer');
    assert.equal(await be.roundDoc(d.roundId), null, 'stale draft gone');
    assert.equal((await be.call('host', 'revealRound', { roundId: b.roundId })).code, 'TOO_FEW_GUESSES');
    // after 7 days nothing can be guessed any more
    be.clock.set(created + 8 * 24 * HOUR);
    assert.equal((await be.call('g8', 'submitGuess', { roundId: a.roundId, pos: 5 })).code, 'ROUND_EXPIRED');
    assert.equal((await be.call('g8', 'submitGuess', { roundId: a.roundId, pos: 5 })).code, 'ROUND_EXPIRED');
  });

  test('AC 35: createRound is limited to 20 a day per player (validation errors do not count); a new Beijing day resets', async (be) => {
    for (let i = 0; i < 5; i++) assert.equal((await be.call('h', 'createRound', { spectrumId: 'bad' })).code, 'INVALID_INPUT');
    for (let i = 0; i < 20; i++) assert.equal((await be.call('h', 'createRound', { spectrumId: be.content.spectra[i].id })).ok, true, 'round ' + (i + 1));
    assert.equal((await be.call('h', 'createRound', { spectrumId: be.content.spectra[0].id })).code, 'RATE_LIMITED');
    assert.equal((await be.call('other', 'createRound', { spectrumId: be.content.spectra[0].id })).ok, true);
    be.clock.set(be.BJ('20261106', 0, 1, 0));
    assert.equal((await be.call('h', 'createRound', { spectrumId: be.content.spectra[0].id })).ok, true);
  });

  test('AC 62/63: subscribeRound: template gate, participants only, idempotent, one message per grant even when two reveal paths race', async (be) => {
    const r = await openRound(be, 'host');
    assert.equal((await be.call('host', 'subscribeRound', { roundId: r.roundId })).code, 'NO_TEMPLATE');
    await be.setAppConfig(SUB);
    assert.equal((await be.call('host', 'subscribeRound', { roundId: 'bad' })).code, 'INVALID_INPUT');
    assert.equal((await be.call('host', 'subscribeRound', { roundId: 'AAAAAAAA' })).code, 'ROUND_NOT_FOUND');
    const draft = await be.call('host', 'createRound', { spectrumId: be.content.spectra[9].id });
    assert.equal((await be.call('host', 'subscribeRound', { roundId: draft.roundId })).code, 'ROUND_NOT_FOUND');
    assert.equal((await be.call('stranger', 'subscribeRound', { roundId: r.roundId })).code, 'FORBIDDEN');
    assert.deepEqual(await be.call('host', 'subscribeRound', { roundId: r.roundId }), { ok: true, granted: true });
    assert.deepEqual(await be.call('host', 'subscribeRound', { roundId: r.roundId }), { ok: true, granted: true }, 'idempotent');
    await guessAs(be, ['g1', 'g2'], r.roundId, [10, 70]);
    await be.call('g1', 'subscribeRound', { roundId: r.roundId });
    await be.call('g2', 'subscribeRound', { roundId: r.roundId });
    await be.call('g2', 'subscribeRound', { roundId: r.roundId });
    assert.equal(await be.count('sub_grants'), 3);
    // the host reveal races with the 8th guess and the sweep
    const rest = ['g3', 'g4', 'g5', 'g6', 'g7', 'g8'];
    await Promise.all([be.call('host', 'revealRound', { roundId: r.roundId }), ...rest.map((u, i) => be.call(u, 'submitGuess', { roundId: r.roundId, pos: 10 * i })), be.timer('sweepRounds')]);
    await be.timer('sweepRounds');
    const sent = await be.sent();
    assert.deepEqual(sent.map((m) => m.to).sort(), ['g1', 'g2', 'host'], 'one message per grant');
    sent.forEach((m) => assert.equal(m.roundId, r.roundId));
    const rr = await be.call('host', 'getRound', { roundId: r.roundId });
    assert.equal(rr.status, 'revealed');
    // after the reveal there is nothing to subscribe to
    assert.deepEqual(await be.call('g1', 'subscribeRound', { roundId: r.roundId }), { ok: true, granted: false });
    await be.timer('sweepRounds');
    assert.equal((await be.sent()).length, 3, 'never a second message');
  });

  test('AC 79: reportCard stores ids only, validates, is limited to 10 a day and grants nothing', async (be) => {
    const item = be.content.itemIds[0];
    assert.equal((await be.call('alice', 'reportCard', { itemId: item, reason: 'typo' })).ok, true);
    assert.equal((await be.call('alice', 'reportCard', { itemId: 'nope', reason: 'typo' })).code, 'INVALID_INPUT');
    assert.equal((await be.call('alice', 'reportCard', { itemId: 's999i01', reason: 'typo' })).code, 'INVALID_INPUT');
    assert.equal((await be.call('alice', 'reportCard', { itemId: item, reason: 'rude' })).code, 'INVALID_INPUT');
    assert.equal((await be.call('alice', 'reportCard', { itemId: item, reason: 'typo', dateKey: 'bad' })).code, 'INVALID_INPUT');
    for (let i = 0; i < 9; i++) assert.deepEqual(await be.call('alice', 'reportCard', { itemId: item, reason: 'ambiguous', dateKey: '20261105', text: 'ignored' }), { ok: true });
    assert.equal((await be.call('alice', 'reportCard', { itemId: item, reason: 'typo' })).code, 'RATE_LIMITED');
    assert.equal(await be.count('card_reports'), 10);
  });
};
