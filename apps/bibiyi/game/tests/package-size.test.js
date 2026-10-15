'use strict';
// Package budget (spec 1, AC 80): main package <= 4 MB including opendata/, total <= 30 MB. The code and the free fact pool
// are a small fraction of that; this test keeps them honest so frontend-ui and content keep room for sounds and the font.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const GAME = path.join(__dirname, '..');

function size(dir) {
  let total = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) total += size(p);
    else if (!/\.md$/.test(p)) total += fs.statSync(p).size;
  }
  return total;
}

test('code + free content stay under 1 MB of the 4 MB main package (AC 80)', () => {
  const parts = { core: size(path.join(GAME, 'core')), js: size(path.join(GAME, 'js')) };
  if (fs.existsSync(path.join(GAME, 'opendata'))) parts.opendata = size(path.join(GAME, 'opendata'));
  const total = Object.keys(parts).reduce((a, k) => a + parts[k], 0);
  assert.ok(total < 1024 * 1024, 'logic + content = ' + total + ' bytes ' + JSON.stringify(parts));
});

test('the bundled free pool stays small enough for a mini game (the real 440 facts are about the same size)', () => {
  const f = fs.statSync(path.join(GAME, 'core', 'content', 'facts.free.js')).size;
  assert.ok(f < 400 * 1024, 'facts.free.js = ' + f + ' bytes');
});

test('building a free deck is fast enough for a mid-range phone (well under 100 ms on a dev machine)', () => {
  const { buildFreeDeck } = require('../core/deck');
  const t0 = Date.now();
  const N = 60;
  for (let s = 1; s <= N; s++) buildFreeDeck(s * 7, 1, 1, s % 2 ? 'all' : 'animal');
  const avg = (Date.now() - t0) / N;
  assert.ok(avg < 60, 'average free deck build ' + avg + ' ms');
});
