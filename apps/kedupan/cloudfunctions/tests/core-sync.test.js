'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const sync = require('../scripts/sync-core');
const util = require('../common/util');
const { sha256Hex } = require('../../game/opendata/sha256');

function stage() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kd-cf-'));
  fs.cpSync(path.join(sync.CF_ROOT, 'common'), path.join(root, 'common'), { recursive: true });
  fs.mkdirSync(path.join(root, 'fnA'));
  fs.writeFileSync(path.join(root, 'fnA', 'index.js'), "exports.main = async () => ({ ok: true });\n");
  fs.mkdirSync(path.join(root, 'fnB'));
  fs.writeFileSync(path.join(root, 'fnB', 'index.js'), "exports.main = async () => ({ ok: true });\n");
  return root;
}

test('sync copies common/ and the game core into every function folder; drift is detected', () => {
  const root = stage();
  assert.deepEqual(sync.listFunctions(root), ['fnA', 'fnB']);
  assert.ok(sync.checkDrift({ root }).length > 0, 'nothing synced yet: reported');
  sync.syncAll({ root });
  assert.deepEqual(sync.checkDrift({ root }), []);
  ['fnA', 'fnB'].forEach((fn) => {
    ['score.js', 'service.js', 'date.js', 'content.js', 'config.js'].forEach((f) => assert.ok(fs.existsSync(path.join(root, fn, 'core', f)), fn + '/core/' + f));
    assert.ok(fs.existsSync(path.join(root, fn, 'common', 'util.js')));
  });
  fs.appendFileSync(path.join(root, 'fnA', 'core', 'score.js'), '\n// tampered\n');
  assert.ok(sync.checkDrift({ root }).some((p) => /differs .*fnA.*score\.js/.test(p)));
  sync.syncAll({ root });
  assert.deepEqual(sync.checkDrift({ root }), []);
  fs.appendFileSync(path.join(root, 'common', 'util.js'), '\n// changed at the source\n');
  assert.ok(sync.checkDrift({ root }).some((p) => /differs .*fnB.*util\.js/.test(p)));
  fs.rmSync(root, { recursive: true, force: true });
});

test('AC 7: the synced core scores identically to the client core on 1,000 random fixtures (drift test)', () => {
  const root = stage();
  sync.syncAll({ root });
  const client = { S: require('../../game/core/score'), G: require('../../game/core/group') };
  const server = { S: require(path.join(root, 'fnA', 'core', 'score')), G: require(path.join(root, 'fnA', 'core', 'group')) };
  let seed = 4242;
  const rnd = (n) => ((seed = (seed * 1664525 + 1013904223) >>> 0) % n);
  for (let t = 0; t < 1000; t++) {
    const hist = client.S.emptyHist();
    const m = rnd(60);
    for (let i = 0; i < m; i++) hist[rnd(101)]++;
    const anchor = 5 + rnd(91);
    const pos = [rnd(101), rnd(101), rnd(101), rnd(101), rnd(101)];
    const refs = [0, 1, 2, 3, 4].map(() => rnd(201) / 2);
    const group = [pos, pos.map((p) => (p + rnd(30)) % 101), pos.map((p) => (p + rnd(60)) % 101)];
    const pairs = [
      [(S) => S.nationRef(hist, anchor)],
      [(S) => S.histMedian(hist)],
      [(S) => S.agreePct(hist, pos[0])],
      [(S) => S.dailyTotal(pos, refs)],
      [(S) => S.scoreAt(pos[1], refs[1])],
      [(S) => S.distribution21(hist)],
      [(S, G) => G.groupMq(group)],
      [(S, G) => G.leaveOneOutScore(group, 1)],
    ];
    pairs.forEach(([f]) => assert.deepEqual(f(server.S, server.G), f(client.S, client.G)));
  }
  fs.rmSync(root, { recursive: true, force: true });
});

test('coreapi loads against the synced core and exposes the shared modules', () => {
  const root = stage();
  sync.syncAll({ root });
  const api = require(path.join(root, 'fnA', 'common', 'coreapi'));
  assert.equal(api.dateKeyAt(Date.UTC(2026, 10, 1, 15, 59, 59)), '20261101');
  assert.equal(api.dateKeyAt(Date.UTC(2026, 10, 1, 16, 0, 0)), '20261102');
  assert.equal(typeof api.core.SV.applySubmit, 'function');
  assert.equal(api.CONFIG.score.priorVotes, 10);
  assert.equal(api.launchKeyFromEnv(), null);
  fs.rmSync(root, { recursive: true, force: true });
});

test('util: the row hash equals the open data domain\'s sha256(openid|salt)[0..12) rule; salts and ids are well formed', () => {
  for (const [o, s] of [['oAbC123', 'deadbeef'], ['x', 'y'], ['微信', 's']]) assert.equal(util.rowHash(o, s), sha256Hex(o + '|' + s).slice(0, 12));
  assert.match(util.newRoundId(), /^[A-Z2-7]{8}$/);
  assert.match(util.newSalt(), /^[0-9a-f]{32}$/);
  assert.match(util.groupRefOf('gid', 'pepper'), /^[0-9a-f]{16}$/);
  assert.notEqual(util.groupRefOf('gid', 'pepper'), 'gid');
  assert.notEqual(util.groupRefOf('gid', 'a'), util.groupRefOf('gid', 'b'));
  assert.equal(new Set(Array.from({ length: 200 }, () => util.newRoundId())).size, 200);
  assert.ok(util.isDateKey('20261101') && !util.isDateKey('20261301'));
});

test('AC 26 (server): crypto target draw through core drawTarget is 5..95 and roughly uniform over 10,000 draws', () => {
  const { drawTarget } = require('../../game/core/rounds');
  const dec = new Array(10).fill(0);
  let min = 999;
  let max = -1;
  for (let i = 0; i < 10000; i++) {
    const t = drawTarget(util.randomFloat());
    min = Math.min(min, t);
    max = Math.max(max, t);
    dec[Math.min(9, Math.floor((t - 5) / 9.1))]++;
  }
  assert.ok(min >= 5 && max <= 95);
  dec.forEach((c) => assert.ok(c >= 750 && c <= 1250, 'decile ' + c));
});

test('AC 68: no AppSecret, session_key or code2Session in the cloud code; identity only from the context OPENID', () => {
  const walk = (d, out = []) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (['node_modules', 'tests'].includes(e.name)) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p, out);
      else if (e.name.endsWith('.js') && !p.includes(path.sep + 'core' + path.sep)) out.push(p);
    }
    return out;
  };
  walk(sync.CF_ROOT).forEach((f) => {
    const src = fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    assert.ok(!/AppSecret|session_key|code2Session/.test(src), f);
    if (!/store\.js$/.test(f)) assert.ok(!/getWXContext/.test(src), f + ' reads the context outside common/store.js');
    assert.ok(!/event\.openid|event\.OPENID/i.test(src), f + ' trusts an openid from the event');
  });
});
