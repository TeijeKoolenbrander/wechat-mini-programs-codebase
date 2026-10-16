/**
 * Security hardening on the client side and in the mock server (parity with cloudfunctions):
 * M1 joinGroup sends the raw cloudID, M3 RATE_LIMITED is handled like a bad connection and the mock applies the same limits,
 * L2 the event catalogue, item 7 launch-query parsing never throws, item 8 no answer key in the client package.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { boot } = require('./harness');
const { parseEnter, parseQuery } = require('../js/share');
const { createMockServer, RATE_LIMITS } = require('../js/mock-server');
const { NAMES } = require('../js/api');
const events = require('../core/events');
const analyticsLib = require('../js/analytics');

const ROOT = path.join(__dirname, '..');
const hit = (g, id) => g.app.ctl.onHit(id);
const view = (g) => g.app.ctl.view();

async function startUp(t, opts) {
  const g = boot(t, opts);
  await g.settle();
  g.tapId('sheet:close');
  return g;
}

// ---------------------------------------------------------------- item 7: launch query parsing

test('parseQuery / parseEnter never throw on malformed escapes or odd launch options', () => {
  assert.deepStrictEqual(parseQuery('c=%'), { c: '%' });
  assert.deepStrictEqual(parseQuery('c=%E0%A4%A&s=r&%=1&x=%zz'), { c: '%E0%A4%A', s: 'r', '%': '1', x: '%zz' });
  assert.deepStrictEqual(parseQuery('a=%41&b=%e4%b8%ad'), { a: 'A', b: '中' });
  assert.deepStrictEqual(parseQuery(undefined), {});
  assert.deepStrictEqual(parseQuery(null), {});
  assert.deepStrictEqual(parseQuery(''), {});
  assert.deepStrictEqual(parseQuery('=&&=x&novalue'), {});
  // __proto__ never becomes a key
  assert.strictEqual(Object.keys(parseQuery('__proto__=x&s=r')).indexOf('__proto__'), -1);
  assert.strictEqual(({}).x, undefined);
  assert.strictEqual(Object.keys(parseQuery(JSON.parse('{"__proto__":{"a":1},"s":"r"}'))).indexOf('__proto__'), -1);
  for (const bad of ['c=%', 'c=%E0%A4%A', '%=%', 'c=ABCD2345&s=%', { c: ['ABCD2345'] }, { c: 5 }, { c: null }, 12, true, [], {}, 'c=%FF&s=r']) {
    assert.doesNotThrow(() => parseEnter({ query: bad, shareTicket: 't', scene: 1044 }), JSON.stringify(bad));
  }
  assert.doesNotThrow(() => parseEnter(null));
  assert.doesNotThrow(() => parseEnter('str'));
  assert.doesNotThrow(() => parseEnter(42));
  assert.strictEqual(parseEnter({ query: 'c=%' }).kind, 'malformed');
  assert.strictEqual(parseEnter({ query: { c: ['ABCD2345'] } }).kind, 'malformed');
  assert.strictEqual(parseEnter({ query: { c: 12345678 } }).kind, 'malformed');
  assert.strictEqual(parseEnter({ query: 'c=ABCD2345' }).kind, 'challenge');
  assert.strictEqual(parseEnter({ query: 'c=ABCD%32345' }).challengeId, 'ABCD2345');
});

test('a game launched from a card with a malformed query starts normally and reports the entry as malformed', async (t) => {
  const g = await startUp(t, { enter: { scene: 1044, query: 'c=%E0%A4%A&x=%', shareTicket: 'T1', chatType: 3 } });
  assert.strictEqual(view(g).screen, 'home');
  const names = g.app.api.mock.db.events.concat(g.app.analytics.queue);
  assert.ok(names.some((e) => e.name === 'error' && e.props.code === 'malformed'));
  // a later warm start with a circular / odd query object does not throw either
  const circ = {};
  circ.self = circ;
  assert.doesNotThrow(() => g.app.ctl.onShow({ scene: 1044, query: circ, shareTicket: 'T2' }));
  assert.doesNotThrow(() => g.app.ctl.onShow({ scene: 1044, query: '%', shareTicket: 'T3' }));
});

// ---------------------------------------------------------------- M1: raw cloudID

test('M1: the client sends joinGroup {cloudID: <raw string>} and nothing else', async (t) => {
  const g = await startUp(t, { enter: { scene: 1044, query: { s: 'r', m: 'free', d: '' }, shareTicket: 'T1', chatType: 3 } });
  const joins = g.app.api.mock.calls.filter((c) => c.name === 'joinGroup');
  assert.strictEqual(joins.length, 1);
  assert.deepStrictEqual(joins[0].data, { cloudID: 'cloud-group-1' });
  assert.strictEqual(typeof joins[0].data.cloudID, 'string');
  assert.strictEqual(g.app.ctl.view().vm.hasGroupContext, true);
});

test('M1: the client source never builds a decrypted-looking object for joinGroup', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js', 'share.js'), 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(!/groupData|CloudID\(/.test(src));
  assert.ok(/joinGroup\(\{ cloudID: info\.cloudID \}\)/.test(src));
});

test('M1 mock parity: forged objects and payload cases', () => {
  const m = createMockServer({ now: () => Date.UTC(2026, 10, 20, 4, 0, 0) });
  m.rateLimits = false;
  const forged = { cloudID: 'whatever', data: { opengid: 'real-group-1', chat_type: 3 } };
  for (const d of [{ groupData: forged }, { cloudID: forged }, { cloudID: ['cid-aaaaaaaa'] }, { cloudID: 12345678 }, { cloudID: null }, { cloudID: '' }, { cloudID: 'short' }, { cloudID: 'x'.repeat(513) }, { cloudID: 'has spaces in it 12345' }, { groupData: 'cid-real-group-1' }, {}]) {
    const r = m.call('joinGroup', d);
    assert.deepStrictEqual([r.ok, r.code], [false, 'BAD_CLOUDID'], JSON.stringify(d).slice(0, 60));
  }
  assert.strictEqual(Object.keys(m.db.members).length, 0);
  // event.groupData is ignored even next to a valid cloudID
  m.openData['cid-good-0001'] = { opengid: 'G-real', chat_type: 3 };
  const ok = m.call('joinGroup', { cloudID: 'cid-good-0001', groupData: forged });
  assert.strictEqual(ok.ok, true);
  assert.strictEqual(Object.keys(m.db.members).length, 1);
  const cases = [
    [{ errCode: -601006, opengid: 'g', chat_type: 3 }, 'BAD_CLOUDID'],
    [null, 'BAD_CLOUDID'],
    [[{ opengid: 'g' }], 'BAD_CLOUDID'],
    [{ opengid: 'g1', chat_type: 1 }, 'NOT_GROUP'],
    [{ open_single_roomid: 'room-1' }, 'NOT_GROUP'],
    [{ open_single_roomid: 'room-1', chat_type: 3 }, 'NOT_GROUP'],
    [{ opengid: 'g1', chat_type: 0 }, 'NOT_GROUP'],
    [{ opengid: 'g1', chat_type: 2 }, 'NOT_GROUP'],
    [{ opengid: '', chat_type: 3 }, 'NOT_GROUP'],
    [{ opengid: 'x'.repeat(129), chat_type: 3 }, 'NOT_GROUP'],
    [{ opengid: { a: 1 }, chat_type: 3 }, 'NOT_GROUP'],
  ];
  cases.forEach(([entry, code], i) => {
    m.openData['cid-case-' + String(i).padStart(4, '0')] = entry;
    const r = m.call('joinGroup', { cloudID: 'cid-case-' + String(i).padStart(4, '0') });
    assert.deepStrictEqual([JSON.stringify(entry), r.ok, r.code], [JSON.stringify(entry), false, code]);
  });
  [{ opengid: 'g-3', chat_type: 3 }, { opengid: 'g-4', chat_type: 4 }, { opengid: 'g-s', chat_type: '3' }, { opengid: 'g-absent' }, { opengid: 'g-null', chat_type: null }, { opengid: 'y'.repeat(128) }].forEach((entry, i) => {
    m.openData['cid-good-' + String(i).padStart(4, '1')] = entry;
    assert.strictEqual(m.call('joinGroup', { cloudID: 'cid-good-' + String(i).padStart(4, '1') }).ok, true, JSON.stringify(entry));
  });
});

// ---------------------------------------------------------------- M3: RATE_LIMITED

test('M3 mock parity: every client function has a limit, the window rolls, track costs one per event', () => {
  assert.deepStrictEqual(Object.keys(RATE_LIMITS).sort(), NAMES.slice().sort());
  let clock = Date.UTC(2026, 10, 20, 4, 0, 0);
  const m = createMockServer({ now: () => clock });
  for (const fn of ['getHistory', 'getReplay', 'getChallenge']) {
    for (let i = 0; i < RATE_LIMITS[fn]; i++) assert.notStrictEqual(m.call(fn, {}).code, 'RATE_LIMITED', fn);
    assert.strictEqual(m.call(fn, {}).code, 'RATE_LIMITED', fn);
  }
  clock += 61000;
  assert.notStrictEqual(m.call('getHistory', {}).code, 'RATE_LIMITED');
  const batch = (n) => ({ events: new Array(n).fill({ name: 'error', props: { where: 'x' } }) });
  clock += 61000;
  for (let i = 0; i < 5; i++) assert.strictEqual(m.call('track', batch(50)).ok, true);
  assert.strictEqual(m.call('track', batch(49)).ok, true);
  assert.strictEqual(m.call('track', batch(2)).code, 'RATE_LIMITED');
  // the limiter can be switched off for suites that hammer one function
  m.rateLimits = false;
  assert.strictEqual(m.call('track', batch(50)).ok, true);
});

test('M3: RATE_LIMITED is treated like a bad connection: offline state with retry (history), analytics re-queue, queued submit', async (t) => {
  const g = await startUp(t);
  const mock = g.app.api.mock;
  const orig = mock.call.bind(mock);
  let limited = true;
  mock.call = (name, data) => (limited && name !== 'joinGroup' ? { ok: false, code: 'RATE_LIMITED', message: 'rate limited' } : orig(name, data));
  hit(g, 'home:history');
  await g.settle();
  assert.strictEqual(view(g).screen, 'history');
  assert.strictEqual(view(g).vm.state, 'offline', 'a rate-limited archive load shows the retry state, not a hard error');
  limited = false;
  hit(g, 'history:retry');
  await g.settle();
  assert.notStrictEqual(view(g).vm.state, 'offline');
  // analytics: a rate-limited batch goes back to the queue
  limited = true;
  g.app.analytics.track('error', { where: 'x', code: 'y' });
  const before = g.app.analytics.queue.length;
  await g.app.analytics.flush();
  assert.strictEqual(g.app.analytics.queue.length, before, 'nothing was dropped');
  assert.ok(before >= 1);
  limited = false;
  await g.app.analytics.flush();
  assert.strictEqual(g.app.analytics.queue.length, 0);
});

// ---------------------------------------------------------------- L2: event catalogue

test('L2: the client event list and the server catalogue name the same events; props the client sends are in the catalogue', () => {
  assert.deepStrictEqual(events.EVENT_NAMES.slice().sort(), analyticsLib.EVENTS.slice().sort());
  assert.strictEqual(events.cleanProps('daily_gen', {}), null);
  assert.strictEqual(events.cleanProps('__proto__', {}), null);
  assert.strictEqual(events.cleanProps('toString', {}), null);
  assert.deepStrictEqual(events.cleanProps('run_start', { runId: 'run-000001', mode: 'hack', openid: 'o', source: 'home' }), { runId: 'run-000001', source: 'home' });
  // every prop key the shipped client passes to analytics.track(name, {...}) is either allowlisted for that event or deliberately dropped
  const files = ['controller.js', 'ads.js', 'album.js', 'privacy.js', 'share.js', 'subscribe.js'];
  const unknown = [];
  files.forEach((f) => {
    const src = fs.readFileSync(path.join(ROOT, 'js', f), 'utf8');
    for (const m of src.matchAll(/\btrack\('([a-z_]+)',\s*\{([^}]*)\}/g)) {
      const name = m[1];
      if (!events.CATALOGUE[name]) {
        unknown.push(f + ':' + name);
        continue;
      }
      const keys = m[2].split(',').map((k) => k.trim().split(':')[0].trim()).filter((k) => /^[A-Za-z]+$/.test(k));
      keys.forEach((k) => {
        if (!(k in events.CATALOGUE[name]) && !(k in events.COMMON)) unknown.push(f + ':' + name + '.' + k);
      });
    }
  });
  assert.deepStrictEqual(unknown, []);
});

// ---------------------------------------------------------------- item 8: answer key never ships

test('item 8: no daily seed, sheet or best-lineup data in the client package (spec C5)', () => {
  const walk = (dir, out = []) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name === 'cloudfunctions-deploy' || e.name === 'tools' || e.name === 'tests') continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p, out);
      else out.push(p);
    }
    return out;
  };
  const files = walk(ROOT);
  assert.ok(files.length > 20);
  for (const f of files) {
    const rel = path.relative(ROOT, f).replace(/\\/g, '/');
    assert.ok(!/seed-bank|optimal-seeds|bank\.import|daily_seed|\.jsonl$/i.test(rel), 'unexpected data file ' + rel);
    if (!/\.(js|json)$/.test(f)) continue;
    const src = fs.readFileSync(f, 'utf8');
    assert.ok(!/optimal-seeds|daily_seed_bank|bank\.import|bestLineups?\b.*=\s*\[/i.test(src), 'answer-key reference in ' + rel);
  }
  // the mock server derives its seeds from a fixed string at runtime and is dev-only; it never embeds a lineup list
  const mock = fs.readFileSync(path.join(ROOT, 'js', 'mock-server.js'), 'utf8');
  assert.ok(!/optimal|12-0 lineup|bank/i.test(mock.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')));
});
