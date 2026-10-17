'use strict';
// The prompt roll (spec 4.1, F-2, PO-34): AC 115-119 as pure-function property tests over the real bank v2.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const roll = require('../core/roll');
const { getPrompts } = require('../core/prompts');
const { mulberry32 } = require('../core/rng');

const bank = getPrompts();
const cat = (id) => bank.byId[id].cat;

test('AC 114/115: the bank has >= 2,000 active prompts in 12 categories; a roll is 3 active prompts from 3 different categories', () => {
  assert.ok(bank.active.length >= 2000);
  assert.equal(Object.keys(bank.byCat).length, 12);
  const rng = mulberry32(115);
  for (let i = 0; i < 500; i++) {
    const r = roll.rollThree({ bank, seen: [], rng });
    assert.equal(r.ids.length, 3);
    assert.equal(new Set(r.ids.map(cat)).size, 3, 'three different categories');
    for (const id of r.ids) assert.ok(bank.byId[id] && !bank.byId[id].retired, id + ' is rollable');
    assert.equal(r.relaxed, false);
  }
});

test('retired prompts are never rolled', () => {
  const small = { byCat: { A: [{ id: 'a1' }, { id: 'a2' }], B: [{ id: 'b1' }], C: [{ id: 'c1' }], D: [{ id: 'd1' }] } };
  const rng = mulberry32(1);
  for (let i = 0; i < 100; i++) {
    const r = roll.rollThree({ bank: small, seen: [], rng });
    assert.equal(new Set(r.ids.map((id) => id[0])).size, 3);
  }
  const retiredIds = bank.list.filter((p) => p.retired).map((p) => p.id);
  const r2 = mulberry32(2);
  for (let i = 0; i < 300; i++) for (const id of roll.rollThree({ bank, seen: [], rng: r2 }).ids) assert.ok(!retiredIds.includes(id));
});

test('AC 116: 换一批 returns 3 new prompts, none from the first roll, 3 categories again', () => {
  const rng = mulberry32(116);
  for (let i = 0; i < 300; i++) {
    const first = roll.rollThree({ bank, seen: [], rng });
    const again = roll.reroll({ bank, seen: first.ids, firstIds: first.ids, rng });
    assert.equal(again.ids.length, 3);
    assert.equal(new Set(again.ids.map(cat)).size, 3);
    for (const id of again.ids) assert.ok(!first.ids.includes(id));
  }
});

test('AC 117 (property): over 200 rolls with a reroll each, no id shown to the player reappears while it is within their last 300 shown ids', () => {
  const rng = mulberry32(117);
  let seen = [];
  const shown = [];
  for (let i = 0; i < 200; i++) {
    const a = roll.rollThree({ bank, seen, rng });
    seen = roll.pushSeen(seen, a.ids);
    const b = roll.reroll({ bank, seen, firstIds: a.ids, rng });
    seen = roll.pushSeen(seen, b.ids);
    for (const ids of [a.ids, b.ids]) {
      for (const id of ids) {
        const window = shown.slice(-300);
        assert.ok(!window.includes(id), `roll ${i}: ${id} repeated inside the last 300`);
      }
      shown.push(...ids);
    }
    assert.ok(seen.length <= 300);
  }
  assert.equal(shown.length, 1200);
});

test('the ring buffer keeps the newest 300 and moves a re-shown id to the end', () => {
  let seen = [];
  for (let i = 0; i < 400; i++) seen = roll.pushSeen(seen, ['x' + i]);
  assert.equal(seen.length, 300);
  assert.equal(seen[0], 'x100');
  assert.equal(seen[299], 'x399');
  seen = roll.pushSeen(seen, ['x150']);
  assert.equal(seen[seen.length - 1], 'x150');
  assert.equal(seen.filter((x) => x === 'x150').length, 1);
  assert.deepEqual(roll.pushSeen(['a', 'b'], ['c', 'd'], 3), ['b', 'c', 'd']);
});

test('AC 118 (property): in one room no two seats share a prompt, over n = 3..10 seats with a reroll each, and every seat respects its own window', () => {
  const rng = mulberry32(118);
  for (let n = 3; n <= 10; n++) {
    for (let g = 0; g < 20; g++) {
      const seenBySeat = Array.from({ length: n }, () => roll.pushSeen([], bank.active.slice(0, 250).map((p) => p.id).sort(() => rng() - 0.5)));
      const rolls = roll.rollRoom({ bank, seenBySeat, rng });
      const used = [];
      rolls.forEach((ids, s) => {
        assert.equal(new Set(ids.map(cat)).size, 3);
        for (const id of ids) {
          assert.ok(!seenBySeat[s].includes(id), 'inside the seat window');
          assert.ok(!used.includes(id), 'shared with another seat');
          used.push(id);
        }
      });
      for (let s = 0; s < n; s++) {
        const again = roll.reroll({ bank, seen: seenBySeat[s], firstIds: rolls[s], exclude: used, rng });
        for (const id of again.ids) {
          assert.ok(!used.includes(id), 'a reroll never shares either');
          used.push(id);
        }
      }
      assert.equal(new Set(used).size, used.length);
    }
  }
});

test('4.1: when the pool is too small the oldest ids drop out of the window until a roll is possible (relaxed), never fewer than 3 distinct', () => {
  const tiny = { byCat: { A: [{ id: 'a1' }, { id: 'a2' }], B: [{ id: 'b1' }, { id: 'b2' }], C: [{ id: 'c1' }, { id: 'c2' }] } };
  const rng = mulberry32(4);
  const all = ['a1', 'a2', 'b1', 'b2', 'c1', 'c2'];
  const r = roll.rollThree({ bank: tiny, seen: all, rng });
  assert.equal(r.ids.length, 3);
  assert.equal(new Set(r.ids).size, 3);
  assert.equal(r.relaxed, true);
  // everything excluded even after the window shrinks: the exclusion is the last thing dropped
  const r2 = roll.rollThree({ bank: tiny, seen: all, exclude: all, rng });
  assert.equal(r2.ids.length, 3);
});

test('AC 119: a pick is valid only when the rollId is the current one and the id is in it', () => {
  const current = { rollId: 'rAAA', ids: ['A01', 'B02', 'C03'] };
  assert.equal(roll.pickValid(current, 'rAAA', 'B02'), true);
  assert.equal(roll.pickValid(current, 'rAAA', 'A99'), false);
  assert.equal(roll.pickValid(current, 'rOLD', 'B02'), false);
  assert.equal(roll.pickValid(null, 'rAAA', 'B02'), false);
  assert.equal(roll.pickValid(current, 'rAAA', 5), false);
  assert.match(roll.rollId(mulberry32(1)), /^r[a-z0-9]{11}$/);
});

test('AC 164-165 (core): MAX_REROLLS is 5 and comes from the config; the record counts rerolls, grows shownIds to 18 and runs out', () => {
  const { CONFIG } = require('../core/config');
  assert.equal(roll.MAX_REROLLS, 5);
  assert.equal(CONFIG.roll.rerollsPerPick, 5);
  const rng = mulberry32(164);
  let rec = roll.newRec('r0', roll.rollThree({ bank, seen: [], rng }).ids);
  const sets = [rec.ids];
  assert.deepEqual([roll.rerollsOf(rec), roll.rerollLeft(rec)], [0, 5]);
  for (let n = 1; n <= 5; n++) {
    const again = roll.reroll({ bank, seen: roll.shownOf(rec), firstIds: roll.shownOf(rec), rng });
    assert.equal(new Set(again.ids.map(cat)).size, 3);
    rec = roll.nextRec(rec, 'r' + n, again.ids);
    sets.push(again.ids);
    assert.deepEqual([roll.rerollsOf(rec), roll.rerollLeft(rec)], [n, 5 - n]);
  }
  assert.equal(new Set(sets.flat()).size, 18, 'no id repeats over the six sets');
  assert.deepEqual(roll.shownOf(rec), sets.flat());
  assert.equal(roll.rerollLeft(rec), 0);
  // a record written before rev. 2.1 only has the boolean
  assert.equal(roll.rerollLeft({ rerolled: true }), 4);
  assert.equal(roll.rerollLeft({ rerolled: false }), 5);
  assert.deepEqual(roll.shownOf({ ids: ['A', 'B'], prevIds: ['C', 'A'] }), ['A', 'B', 'C']);
});

test('AC 117 (property, rev. 2.1): over 200 picks with 0-5 rerolls each, no id shown (picked or not) reappears within the last 300 shown ids', () => {
  const rng = mulberry32(1170);
  let seen = [];
  for (let pick = 0; pick < 200; pick++) {
    let rec = roll.newRec('r', roll.rollThree({ bank, seen, rng }).ids);
    seen = roll.pushSeen(seen, rec.ids);
    const times = Math.floor(rng() * 6);
    for (let n = 0; n < times; n++) {
      const window = seen.slice();
      const again = roll.reroll({ bank, seen, firstIds: roll.shownOf(rec), rng });
      for (const id of again.ids) {
        assert.ok(!window.includes(id), 'within the last 300 shown');
        assert.ok(!bank.byId[id].retired);
      }
      rec = roll.nextRec(rec, 'r' + n, again.ids);
      seen = roll.pushSeen(seen, again.ids);
    }
    assert.ok(roll.shownOf(rec).length <= 18);
  }
});

test('AC 118 (property, rev. 2.1): in one room no prompt is shown to two seats over 5 rerolls each, for n = 3..10 seats', () => {
  const rng = mulberry32(1180);
  for (let n = 3; n <= 10; n++) {
    for (let g = 0; g < 10; g++) {
      const seen = Array.from({ length: n }, () => roll.pushSeen([], bank.active.slice(0, 280).map((p) => p.id).sort(() => rng() - 0.5)));
      const first = roll.rollRoom({ bank, seenBySeat: seen, rng });
      const recs = first.map((ids, i) => roll.newRec('r' + i, ids));
      const used = first.flat();
      // interleaved like concurrent seats: round-robin, 5 rounds
      for (let round = 1; round <= 5; round++) {
        for (let s = 0; s < n; s++) {
          const win = seen[s];
          const again = roll.reroll({ bank, seen: win, firstIds: roll.shownOf(recs[s]), exclude: used, rng });
          assert.equal(new Set(again.ids.map(cat)).size, 3);
          for (const id of again.ids) {
            assert.ok(!used.includes(id), 'shared with a set shown in the room (seat ' + s + ', reroll ' + round + ')');
            assert.ok(!win.includes(id), 'inside the seat window');
            assert.ok(!bank.byId[id].retired);
          }
          recs[s] = roll.nextRec(recs[s], 'r' + s + round, again.ids);
          used.push(...again.ids);
        }
      }
      assert.equal(used.length, n * 18);
      assert.equal(new Set(used).size, used.length);
    }
  }
});
