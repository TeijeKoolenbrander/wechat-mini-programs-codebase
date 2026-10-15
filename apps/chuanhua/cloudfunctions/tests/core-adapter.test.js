'use strict';
// The seam to the game core (common/coreapi.js): contract shapes, injected modules, and, when
// apps/chuanhua/game/core exists in the tree, parity checks against the REAL core.
const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { createHarness } = require('./helpers/harness');
const F = require('./helpers/flow');
const sync = require('../scripts/sync-core');

let h;
const [A, B] = F.PEOPLE;
beforeEach(() => { h = createHarness(); });
afterEach(() => h.teardown());

test('the blocklist is flattened from the core shape {categories:{name:[terms]}} (every category applies)', async () => {
  await F.player(h, A);
  assert.equal((await h.call('createChain', { customText: '测试敏感词出现' }, { openid: A })).code, 'TEXT_REJECTED');
  h.advance(1000);
  assert.equal((await h.call('createChain', { customText: '另一个坏词呀' }, { openid: A })).code, 'TEXT_REJECTED');
  h.advance(1000);
  assert.equal((await h.call('createChain', { customText: '会飞的西瓜' }, { openid: A })).ok, true);
});

test('core/daily.js dailyIds is used when present; LAUNCH_DATE_KEY overrides, otherwise the core default launch applies', async () => {
  const seen = [];
  const core = h.mod('getHome/common/coreapi.js');
  core.resetForTests({ daily: { dailyIds: (d, l) => { seen.push([d, l]); return ['A03', 'A02', 'A01']; } } });
  const r = await h.call('getHome', {}, { openid: A });
  assert.deepEqual(r.daily.prompts.map((p) => p.id), ['A03', 'A02', 'A01']);
  assert.deepEqual(seen[0], ['20261103', '20261101'], 'env override passed through');
  h.setEnv('LAUNCH_DATE_KEY', undefined);
  await h.call('getHome', {}, { openid: A });
  assert.deepEqual(seen[1], ['20261103', undefined], 'the core default launch date is used');
  assert.equal(h.db.get('meta', 'launch'), null, 'no meta/launch needed with the core');
  core.resetForTests();
});

test('without core/daily.js the fallback walk uses meta/launch and never repeats within the cycle', async () => {
  h.setEnv('LAUNCH_DATE_KEY', undefined);
  const r = await h.call('getHome', {}, { openid: A });
  assert.equal(r.daily.prompts.length, 3);
  assert.equal(h.db.get('meta', 'launch').dateKey, '20261103');
});

test('core/text.check runs in addition to the server rules (anything the client rejects is rejected here)', async () => {
  const gref = await F.player(h, A);
  await F.player(h, B);
  const id = F.seedChain(h, { authors: [A], openGId: F.GROUP_A });
  const cl = await F.claim(h, B, id, gref);
  h.mod('submitStep/common/coreapi.js').resetForTests({ text: { check: (s) => (s.includes('客户端禁用') ? { ok: false, reason: 'blocklist' } : { ok: true }) } });
  assert.equal((await F.submit(h, B, id, cl.claimId, { text: '客户端禁用词' })).code, 'TEXT_REJECTED');
  assert.equal(h.sdk.count('msgSecCheck'), 0);
  assert.equal((await F.submit(h, B, id, cl.claimId, { text: '普通的一句话' })).state, 'passed');
  h.mod('submitStep/common/coreapi.js').resetForTests();
});

test('the core rasteriser is preferred for the moderation PNG when present (pixel parity with the client)', async () => {
  const gref = await F.player(h, A);
  const calls = [];
  h.mod('common/coreapi.js'); // staged copy exists
  h.mod('submitStep/common/coreapi.js').resetForTests({
    raster: { rasterize: (d) => { calls.push(['rasterize', d.s.length]); return { width: 1, height: 1, data: new Uint8Array([1, 2, 3]) }; } },
    png: { encodePng: (r, o) => { calls.push(['encode', typeof o.deflate]); return new Uint8Array([137, 80, 78, 71, 9]); } },
  });
  const c = await F.create(h, A, { groupRef: gref });
  await F.submit(h, A, c.chainId, c.claim.claimId, { strokes: F.strokes(2) });
  assert.deepEqual(calls, [['rasterize', 2], ['encode', 'function']]);
  const file = [...h.sdk.files.values()][0];
  assert.deepEqual([...file], [137, 80, 78, 71, 9]);
  h.mod('submitStep/common/coreapi.js').resetForTests();
});

test('a missing prompt bank is a server configuration error, not a crash', async () => {
  await F.player(h, A);
  const core = h.mod('createChain/common/coreapi.js');
  core.resetForTests({ prompts: null });
  assert.equal((await h.call('createChain', { promptId: 'A01' }, { openid: A })).code, 'SERVER_CONFIG');
  core.resetForTests();
});

// ------------------------------------------------------------------ parity with the REAL core (only when it is in the tree)

const CORE = sync.DEFAULT_CORE;
const haveCore = fs.existsSync(path.join(CORE, 'strokes.js')) && fs.existsSync(path.join(CORE, 'raster.js'));
const real = (m) => require(path.join(CORE, m));

test('REAL CORE: content shapes load through coreapi; every prompt passes the server text rules', { skip: !haveCore }, () => {
  const api = h.mod('common/coreapi.js');
  api.resetForTests({ prompts: real('content/prompts.v1'), blocklist: real('content/blocklist.v1'), daily: real('daily'), text: real('text') });
  assert.ok(api.prompts().length >= 400);
  assert.ok(api.blocklist().length > 50, 'categories flattened');
  const { validateText } = h.mod('common/text.js');
  for (const p of api.prompts()) {
    const v = validateText(p.text, { min: 2, max: 12, blocklist: api.blocklist() });
    assert.equal(v.ok, true, `${p.id} ${p.text}: ${v.reason}`);
    assert.equal(api.coreTextCheck(p.text, 'prompt').ok, true, `${p.id} core text check`);
  }
  for (const d of ['20261101', '20261102', '20261231', '20270301']) {
    assert.deepEqual(api.dailyPromptIds(d), real('daily').dailyIds(d));
    for (const id of api.dailyPromptIds(d)) assert.ok(api.promptById(id), `daily prompt ${id} exists`);
  }
  api.resetForTests();
});

test('REAL CORE: server stroke validation agrees with core strokes.validate on random drawings', { skip: !haveCore }, () => {
  const core = real('strokes');
  const { validateStrokes } = h.mod('common/strokes.js');
  let seed = 5;
  const rnd = (n) => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % n; };
  let valid = 0;
  let invalid = 0;
  for (let i = 0; i < 600; i++) {
    const s = [];
    const nStrokes = 1 + rnd(i % 7 === 0 ? 260 : 6);
    for (let k = 0; k < nStrokes; k++) {
      const row = [rnd(i % 11 === 0 ? 14 : 12), rnd(i % 13 === 0 ? 4 : 3), rnd(i % 5 === 0 ? 1100 : 1024), rnd(1024)];
      const pts = rnd(i % 9 === 0 ? 700 : 40);
      for (let p = 0; p < pts; p++) row.push(rnd(61) - 30, rnd(61) - 30);
      s.push(row);
    }
    const drawing = { v: 1, s };
    let mine = true;
    try { validateStrokes(drawing); } catch (e) { mine = false; }
    const theirs = core.validate(drawing).ok === true;
    assert.equal(mine, theirs, `drawing ${i}: server ${mine}, core ${theirs}`);
    if (mine) valid += 1; else invalid += 1;
  }
  assert.ok(valid > 50 && invalid > 50, `mix ${valid}/${invalid}`);
});

test('REAL CORE: server rasteriser and the core rasteriser agree (>= 95% identical pixels; the core renderer is the primary, AC 27); core PNG decodes', { skip: !haveCore }, () => {
  const png = h.mod('common/png.js');
  const raster = h.mod('common/raster.js');
  const api = h.mod('common/coreapi.js');
  api.resetForTests({ raster: real('raster'), png: real('png') });
  let seed = 11;
  const rnd = (n) => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % n; };
  for (let t = 0; t < 8; t++) {
    const s = [];
    for (let k = 0; k < 1 + rnd(8); k++) {
      const row = [rnd(12), rnd(3), 100 + rnd(800), 100 + rnd(800)];
      for (let p = 0; p < 1 + rnd(30); p++) row.push(rnd(81) - 40, rnd(81) - 40);
      s.push(row);
    }
    // keep every point inside the grid
    for (const row of s) { let x = row[2]; let y = row[3]; for (let i = 4; i < row.length; i += 2) { x += row[i]; y += row[i + 1]; if (x < 0 || x > 1023 || y < 0 || y > 1023) { row[i] = 0; row[i + 1] = 0; x = Math.max(0, Math.min(1023, x)); y = Math.max(0, Math.min(1023, y)); } } }
    const drawing = { v: 1, s };
    const mine = png.decodePng(raster.renderPng(drawing));
    const theirs = real('raster').rasterize(drawing);
    assert.equal(theirs.width, 512);
    let same = 0;
    for (let i = 0; i < 512 * 512; i++) if (mine.rgb[i * 3] === theirs.data[i * 3] && mine.rgb[i * 3 + 1] === theirs.data[i * 3 + 1] && mine.rgb[i * 3 + 2] === theirs.data[i * 3 + 2]) same += 1;
    assert.ok(same / (512 * 512) >= 0.95, `drawing ${t}: ${(same / 5242.88).toFixed(2)}% identical`); // fallback renderer only; the core renderer is primary
    const corePng = api.renderPngFromCore(drawing);
    const back = png.decodePng(corePng);
    assert.deepEqual([back.width, back.height], [512, 512]);
    assert.ok(Buffer.from(back.rgb).equals(Buffer.from(theirs.data)), 'core PNG round-trips the raster');
    assert.ok(corePng.length < 200000, 'compressed with zlib');
  }
  api.resetForTests();
});

test('REAL CORE: the server constants match core CONFIG', { skip: !haveCore }, () => {
  const { CONFIG } = real('config');
  const { LIMITS } = h.mod('common/config.js');
  const { LIMITS: S } = h.mod('common/strokes.js');
  assert.equal(LIMITS.claimTtlMs, CONFIG.chain.claimTtlMs);
  assert.equal(LIMITS.chainTtlMs, CONFIG.chain.lifetimeMs);
  assert.equal(LIMITS.perPersonMax, CONFIG.chain.maxPerPerson);
  assert.equal(LIMITS.revealMinPassed, CONFIG.chain.minReveal);
  assert.equal(LIMITS.freeStarts, CONFIG.allowances.startsFree);
  assert.equal(LIMITS.adStartsMax, CONFIG.allowances.startsAd);
  assert.equal(LIMITS.stepsPerDay, CONFIG.allowances.stepsPerDay);
  assert.equal(LIMITS.claimsPerChainPerDay, CONFIG.allowances.claimsPerChainPerDay);
  assert.equal(LIMITS.reportsPerDay, CONFIG.allowances.reportsPerDay);
  assert.equal(LIMITS.mediaTimeoutMs, CONFIG.moderation.recheckAfterMs);
  assert.equal(LIMITS.mediaTimeoutMs * 2, CONFIG.moderation.voidAfterMs);
  assert.deepEqual([LIMITS.mediaRetryGapMs, LIMITS.mediaRetryGapMs * 2], CONFIG.moderation.mediaRetryDelaysMs);
  assert.equal(LIMITS.rulesVersion, CONFIG.rulesVersion);
  assert.equal(LIMITS.groupFreshDays * 86400000, CONFIG.groupMemberFreshMs);
  assert.equal(LIMITS.strikeWindowMs, CONFIG.strikes.windowMs);
  assert.deepEqual([LIMITS.promptMin, LIMITS.promptMax, LIMITS.describeMin, LIMITS.describeMax], [CONFIG.text.promptMin, CONFIG.text.promptMax, CONFIG.text.descMin, CONFIG.text.descMax]);
  assert.deepEqual([S.maxStrokes, S.maxPoints, S.maxPointsPerStroke, S.maxJsonBytes, S.grid], [CONFIG.strokes.maxStrokes, CONFIG.strokes.maxPoints, CONFIG.strokes.maxPointsPerStroke, CONFIG.strokes.maxJsonBytes, CONFIG.strokes.grid]);
  assert.equal(CONFIG.moderation.mockStrokeCounts.risky, 13);
});
