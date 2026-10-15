'use strict';
// The server's rules must agree with the shared game core (apps/yuyirelen/game/core, API in its README).
// Runs against game/core when it exists (or the directory in YR_CORE_DIR); skipped until the core lands.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const sync = require('../scripts/sync-core');
const rules = require('../common/rules');
const util = require('../common/util');
const rng = require('../common/rng');

const CORE = process.env.YR_CORE_DIR || sync.DEFAULT_CORE;
const have = fs.existsSync(path.join(CORE, 'config.js')) && fs.existsSync(path.join(CORE, 'hints.js'));
const core = (m) => require(path.join(CORE, m));
const skip = have ? false : `game core not found at ${CORE}`;

test('config: hint thresholds/caps, limits and the ad-hint cap equal the server rules', { skip }, () => {
  const c = core('config').getConfig();
  assert.deepEqual(c.hints.thresholds, rules.HINTS.map((h) => h.at));
  assert.deepEqual(c.hints.caps, rules.HINTS.map((h) => h.cap));
  assert.deepEqual(c.hints.kinds, rules.HINTS.map((h) => (h.cap == null ? 'firstChar' : 'word')));
  assert.equal(c.limits.guessesPerMinute, rules.LIMITS.guessesPerMinute);
  assert.equal(c.limits.guessesPerPuzzle, rules.LIMITS.guessesPerPuzzle);
  assert.equal(c.hints.adMaxPerPuzzle, rules.LIMITS.adHintsPerPuzzle);
  assert.equal(c.input.warmups, rules.LIMITS.warmups);
  assert.equal(c.input.assocChips, rules.LIMITS.chips);
  assert.equal(c.daily.graceMs, util.GRACE_MS);
  assert.equal(c.boardListCap, 3000);
  assert.ok(Number.isInteger(c.gateVersion));
});

test('temperature and bands agree for every rank boundary and a sweep', { skip }, () => {
  const t = core('temp');
  for (const V of [1000, 20000, 30000, 40000]) {
    for (const r of [1, 2, 3, 10, 11, 100, 101, 500, 501, 2000, 2001, 5000, V - 1, V]) {
      if (r > V) continue;
      assert.equal(rules.tempOf(r, V), t.temperature(r, V), `T(${r}, ${V})`);
      assert.equal(rules.bandOf(r), t.bandOf(r).key, `band ${r}`);
    }
  }
});

test('hint target and free-rank choice agree with core/hints.js (property sweep)', { skip }, () => {
  const H = core('hints');
  const cfg = core('config').getConfig();
  for (let trial = 0; trial < 500; trial++) {
    const V = 100 + (trial * 61) % 30000;
    const best = trial % 4 === 0 ? null : 3 + ((trial * 977) % (V - 3));
    const taken = new Set();
    for (let i = 0; i < trial % 30; i++) taken.add(2 + ((i * 131 + trial * 7) % (V - 2)));
    for (const k of [1, 2, 4]) {
      const b = best === null ? V : best;
      const mine = rules.pickHintRank({ best, cap: cfg.hints.caps[k - 1], V, taken });
      const theirs = H.atBest(b) ? null : H.pickHintRank(H.hintTargetRank(cfg, k, b), (r) => r === 1 || taken.has(r), V);
      assert.equal(mine, theirs, `k=${k} best=${best} V=${V}`);
    }
    const mineAd = rules.pickHintRank({ best, cap: null, V, taken });
    const theirsAd = H.atBest(best === null ? V : best) ? null : H.pickHintRank(H.adTargetRank(best === null ? V : best), (r) => r === 1 || taken.has(r), V);
    assert.equal(mineAd, theirsAd);
  }
});

test('hint unlock steps agree', { skip }, () => {
  const H = core('hints');
  const cfg = core('config').getConfig();
  for (let before = 0; before < 45; before++) {
    assert.deepEqual(H.newlyUnlocked(cfg, before, before + 1), [rules.newlyUnlocked(before, before + 1, [])].filter(Boolean));
  }
});

test('streak and displayed streak agree with core/streak.js', { skip }, () => {
  const S = core('streak');
  const cases = [
    [{ curStreak: 3, bestStreak: 5, lastSolvedDate: '20261102' }, '20261103', '20261102'],
    [{ curStreak: 3, bestStreak: 5, lastSolvedDate: '20261101' }, '20261103', '20261102'],
    [{ curStreak: 0, bestStreak: 0, lastSolvedDate: null }, '20261103', null],
    [{ curStreak: 2, bestStreak: 2, lastSolvedDate: '20261030' }, '20261103', '20261030'],
  ];
  for (const [st, d, prev] of cases) {
    assert.deepEqual(rules.nextStreak(st, d, prev, 'solved'), S.onRankedSolve(st, d, prev));
    assert.deepEqual(rules.nextStreak(st, d, prev, 'gaveup'), S.onRankedGiveUp(st));
    assert.equal(rules.effectiveStreak(st, d, prev).current, S.displayStreak(st, d, prev));
  }
});

test('ranked window and Beijing date keys agree with core/schedule.js and core/date.js', { skip }, () => {
  const SC = core('schedule');
  const D = core('date');
  const grace = core('config').getConfig().daily.graceMs;
  const ms = (d, h, m) => Date.UTC(2026, 10, d, h, m, 0);
  for (const now of [ms(3, 4, 0), ms(3, 15, 59), ms(3, 16, 0), ms(3, 16, 29), ms(3, 16, 30), ms(3, 16, 31), ms(4, 4, 0), ms(1, 4, 0)]) {
    const mine = ['open', 'grace'].includes(rules.windowState('20261103', now));
    assert.equal(mine, SC.inRankedWindow('20261103', now, grace), String(now));
    assert.equal(D.beijingDateKey(now), require('../common/coreapi').dateKeyAt(now));
  }
  assert.equal(D.dateKeyToMs('20261103'), util.bjtDayStartMs('20261103'));
  assert.equal(D.addDays('20261231', 1), util.addDaysKey('20261231', 1));
  assert.equal(D.daysBetween('20261101', '20261104'), util.daysBetween('20261101', '20261104'));
});

test('puzzle ids and challenge ids the client produces are accepted by the server validators', { skip }, () => {
  const SC = core('schedule');
  const input = require('../common/input');
  for (const id of [SC.dailyId('20261103'), SC.practiceId(1), SC.practiceId(300), SC.practiceId(99999)]) assert.equal(input.puzzleId(id), id);
  assert.throws(() => input.puzzleId('p0'));
  assert.ok(SC.isChallengeId('ABCDEFG2'));
  assert.match(util.base32From(util.hmacHex('k', 'x')), /^[A-Z2-7]{8}$/);
});

test('warm-ups: the server draws exactly what core/starters.js draws when the words are in the vocabulary', { skip }, () => {
  const S = core('starters');
  // stage common/ next to a copy of the core, exactly like a deployed function folder
  const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'yr-compat-'));
  sync.copyDir(path.join(sync.CF_ROOT, 'common'), path.join(tmp, 'common'));
  sync.copyDir(CORE, path.join(tmp, 'core'));
  const coreapi = require(path.join(tmp, 'common', 'coreapi'));
  const vocab = { index: new Map(S.STARTERS.map((w, i) => [w, i])) };
  for (const key of ['20261103', '20261104', 'p1', 'p12']) {
    const w = coreapi.warmups(key, vocab);
    assert.equal(w.length, 6);
    assert.equal(new Set(w).size, 6);
    assert.deepEqual(w, S.warmupsFor(key, 6));
    assert.deepEqual(rng.drawDistinct(S.STARTERS, 6, key, 'warmups'), S.warmupsFor(key, 6), 'local rng equals core rng');
  }
});

test('the real vocabulary, once imported, matches game/core/vocab.js (indices must line up)', { skip: skip || !fs.existsSync(path.join(sync.CF_ROOT, 'data', 'vocab.v1.txt')) && 'no imported vocabulary yet' }, () => {
  const text = require(path.join(CORE, 'vocab.js'));
  const mine = fs.readFileSync(path.join(sync.CF_ROOT, 'data', 'vocab.v1.txt'), 'utf8').split('\n').filter(Boolean);
  const theirs = (Array.isArray(text) ? text : String(text).split('\n')).filter(Boolean);
  assert.deepEqual(mine, theirs);
});
