'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../core/rounds');
const { createContent } = require('../core/content');
const { mulberry32 } = require('../core/rng');
const raw = require('./fixtures/spectra.fixture');

const content = createContent(raw);
const H = 3600e3;

test('AC 6: 默契值 is the rounded mean of on-time scores; late guesses are excluded', () => {
  const guesses = [
    { id: 'a', pos: 50, ts: 1, late: false }, // d 0 -> 100
    { id: 'b', pos: 60, ts: 2, late: false }, // d 10 -> 75
    { id: 'c', pos: 52, ts: 3, late: false }, // d 2 -> 95
    { id: 'late', pos: 50, ts: 4, late: true }, // would be 100, excluded
  ];
  const r = R.scoreRound(50, guesses);
  assert.equal(r.mq, Math.round((100 + 75 + 95) / 3)); // 90
  assert.equal(r.closestId, 'a');
  assert.equal(r.scored.find((s) => s.id === 'late').score, 100, 'late guesses still show their score');
  assert.equal(R.scoreRound(50, [{ id: 'x', pos: 50, ts: 1, late: true }]).mq, null);
});

test('AC 6: 最懂你 tie goes to the earliest guess', () => {
  const r = R.scoreRound(50, [
    { id: 'later', pos: 55, ts: 20, late: false },
    { id: 'earlier', pos: 45, ts: 10, late: false },
    { id: 'far', pos: 90, ts: 1, late: false },
  ]);
  assert.equal(r.closestId, 'earlier');
});

test('AC 26: target draw is an integer in 5..95 and roughly uniform over deciles (10,000 draws)', () => {
  const rng = mulberry32(2026);
  const dec = new Array(10).fill(0);
  let min = 999;
  let max = -1;
  for (let i = 0; i < 10000; i++) {
    const t = R.drawTarget(rng());
    assert.ok(Number.isInteger(t));
    min = Math.min(min, t);
    max = Math.max(max, t);
    dec[Math.min(9, Math.floor((t - 5) / 9.1))]++;
  }
  assert.ok(min >= 5 && max <= 95, `range ${min}..${max}`);
  assert.equal(R.drawTarget(0), 5);
  assert.equal(R.drawTarget(0.9999999), 95);
  dec.forEach((c) => assert.ok(c >= 800 && c <= 1200, 'decile share ' + c));
});

test('AC 27: three distinct spectra, six clue items of the chosen spectrum, swaps give new ones', () => {
  const rng = mulberry32(7);
  const a = R.offerSpectra(content, rng, new Set());
  assert.equal(a.length, 3);
  assert.equal(new Set(a.map((s) => s.id)).size, 3);
  const b = R.offerSpectra(content, rng, new Set(a.map((s) => s.id)));
  assert.ok(b.every((s) => !a.some((x) => x.id === s.id)));
  const c1 = R.offerClues(content, 's001', rng, new Set());
  assert.equal(c1.length, 6);
  assert.ok(c1.every((c) => c.itemId.indexOf('s001i') === 0));
  const c2 = R.offerClues(content, 's001', rng, new Set(c1.map((c) => c.itemId)));
  assert.equal(c2.length, 6);
  assert.equal(c2.filter((c) => c1.some((x) => x.itemId === c.itemId)).length, 2, 'only 4 unseen items remain: 2 recycled');
  assert.deepEqual(R.offerClues(content, 'nope', rng), []);
});

test('AC 28: a clue item must belong to the round spectrum', () => {
  assert.ok(R.clueBelongs(content, 's001', 's001i03'));
  assert.ok(!R.clueBelongs(content, 's001', 's002i03'));
  assert.ok(!R.clueBelongs(content, 's001', 'garbage'));
});

test('AC 31: guess gate order and codes', () => {
  const round = { status: 'open', createdAt: 0, guessCount: 3 };
  const base = { isHost: false, hasGuessed: false, pos: 40, nowMs: H };
  assert.deepEqual(R.guessCheck(round, base), { ok: true, late: false });
  assert.equal(R.guessCheck(round, { ...base, isHost: true }).code, 'OWN_ROUND');
  assert.equal(R.guessCheck(round, { ...base, hasGuessed: true }).code, 'ALREADY_GUESSED');
  assert.equal(R.guessCheck(round, { ...base, pos: 101 }).code, 'INVALID_INPUT');
  assert.equal(R.guessCheck(round, { ...base, pos: 3.5 }).code, 'INVALID_INPUT');
  assert.equal(R.guessCheck(round, { ...base, nowMs: 7 * 24 * H + 1 }).code, 'ROUND_EXPIRED');
  assert.deepEqual(R.guessCheck({ ...round, status: 'revealed' }, base), { ok: true, late: true });
  assert.equal(R.guessCheck({ ...round, status: 'revealed' }, { ...base, nowMs: 8 * 24 * H }).code, 'ROUND_EXPIRED');
  assert.equal(R.guessCheck({ ...round, status: 'noGuesses' }, base).code, 'ROUND_EXPIRED');
  assert.equal(R.guessCheck({ ...round, status: 'draft' }, base).code, 'ROUND_NOT_FOUND');
  assert.equal(R.guessCheck(null, base).code, 'ROUND_NOT_FOUND');
});

test('AC 32: reveal paths (host >= 2, 8th guess, 24 h with >= 1 guess, 0 guesses -> noGuesses)', () => {
  const open = (n) => ({ status: 'open', createdAt: 0, guessCount: n });
  assert.equal(R.hostRevealCheck(open(1), { isHost: true }).code, 'TOO_FEW_GUESSES');
  assert.deepEqual(R.hostRevealCheck(open(2), { isHost: true }), { ok: true, already: false });
  assert.equal(R.hostRevealCheck(open(5), { isHost: false }).code, 'NOT_HOST');
  assert.deepEqual(R.hostRevealCheck({ ...open(5), status: 'revealed' }, { isHost: true }), { ok: true, already: true }, 'idempotent');
  assert.equal(R.hostRevealCheck({ status: 'draft', guessCount: 0 }, { isHost: true }).code, 'ROUND_NOT_FOUND');
  assert.ok(!R.revealsOnGuess(7));
  assert.ok(R.revealsOnGuess(8));
  assert.equal(R.lazyTransition(open(1), 24 * H - 1), null);
  assert.equal(R.lazyTransition(open(1), 24 * H), 'reveal');
  assert.equal(R.lazyTransition(open(0), 24 * H), 'noGuesses');
  assert.equal(R.lazyTransition({ status: 'revealed', createdAt: 0, guessCount: 4 }, 99 * H), null);
});

test('AC 34: a draft without a clue is discarded after 30 minutes', () => {
  const d = { status: 'draft', createdAt: 0, guessCount: 0 };
  assert.equal(R.lazyTransition(d, 30 * 60e3), null);
  assert.equal(R.lazyTransition(d, 30 * 60e3 + 1), 'discard');
});

test('AC 33: reveal payload orders rows, marks late and the host, names 最懂你, hashes with the round salt', () => {
  const hashFn = (k, salt) => k + '#' + salt;
  const p = R.revealPayload(
    {
      target: 50,
      salt: 'SALT',
      hostOpenid: 'host',
      viewerOpenid: 'v',
      guesses: [
        { openid: 'v', pos: 60, ts: 5, late: false },
        { openid: 'w', pos: 52, ts: 6, late: false },
        { openid: 'z', pos: 50, ts: 99, late: true },
      ],
    },
    hashFn
  );
  assert.equal(p.target, 50);
  assert.equal(p.mq, Math.round((75 + 95) / 2));
  assert.equal(p.closestH, 'w#SALT');
  assert.equal(p.selfHash, 'v#SALT');
  assert.deepEqual(p.rows, [
    ['w#SALT', 52, 95, 0, 0],
    ['v#SALT', 60, 75, 0, 0],
    ['z#SALT', 50, null, 1, 0], // L4: no score on a late row
    ['host#SALT', null, null, 0, 1],
  ]);
  assert.ok(!JSON.stringify(p).includes('"w"'));
});

test('group refs are appended once, capped at 10', () => {
  assert.deepEqual(R.appendGroupRef([], 'a'), ['a']);
  const l = ['a'];
  assert.equal(R.appendGroupRef(l, 'a'), l);
  assert.equal(R.appendGroupRef(l, null), l);
  const ten = 'abcdefghij'.split('');
  assert.equal(R.appendGroupRef(ten, 'k'), ten);
});
