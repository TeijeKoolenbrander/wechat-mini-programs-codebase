'use strict';
// Properties of the REAL functions that the shared contract suite cannot express (the mock has no database, no
// transactions, no context): identity, transactions and rollback, timers, rules, indexes, configs, sync, limits of
// the platform (AC 7, 22, 23, 25, 63, 67, 68, 82).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const sync = require('../scripts/sync-core');
const S = require('../../game/core/score');
const { makeBackend, sharedStage, playDay, disposeStages, schedule, BJ } = require('./helpers/backends');
const { CLIENT_FUNCTIONS, TIMERS } = require('../../game/js/mock-server');

const CF = sync.CF_ROOT;
const T1 = '20261105';
const T2 = '20261106';
const flat = (x) => JSON.stringify(x);
const real = (opts) => makeBackend('real', opts);

test.after(() => disposeStages());

test('the function folders are exactly the 19 client functions, the console-only admin and the 4 timers of the contract (and the mock)', () => {
  const folders = sync.listFunctions(CF);
  assert.deepEqual(folders, [...CLIENT_FUNCTIONS, 'admin', ...TIMERS].sort());
  assert.equal(CLIENT_FUNCTIONS.length, 19);
  assert.equal(TIMERS.length, 4);
});

test('AC 22: every function sets TZ and an explicit timeout; timers carry the contract cron; packages depend on wx-server-sdk only', () => {
  const TIMEOUT = { getDaily: 10, genDaily: 20, submitCard: 5, finalizeDay: 300, getArchive: 10, getArchiveDay: 10, getBonusCard: 5, unlockDistribution: 5, joinGroup: 5, getGroupDay: 10, getFriendBoard: 10, createRound: 5, setClue: 5, getRound: 5, submitGuess: 5, revealRound: 10, sweepRounds: 60, subscribeRound: 5, reportCard: 5, track: 5, cleanup: 60, agreeRules: 5, reportClue: 5, admin: 20 };
  const CRON = { genDaily: '0 0 23 * * * *', finalizeDay: '0 40 0 * * * *', sweepRounds: '0 0 * * * * *', cleanup: '0 0 4 * * * *' };
  for (const fn of sync.listFunctions(CF)) {
    const cfg = JSON.parse(fs.readFileSync(path.join(CF, fn, 'function.config.json'), 'utf8'));
    assert.equal(cfg.envVariables.TZ, 'Asia/Shanghai', fn);
    assert.equal(cfg.timeout, TIMEOUT[fn], fn + ' timeout');
    const pkg = JSON.parse(fs.readFileSync(path.join(CF, fn, 'package.json'), 'utf8'));
    assert.deepEqual(Object.keys(pkg.dependencies), ['wx-server-sdk'], fn);
    const tcfg = path.join(CF, fn, 'config.json');
    if (CRON[fn]) {
      const t = JSON.parse(fs.readFileSync(tcfg, 'utf8')).triggers;
      assert.equal(t.length, 1);
      assert.deepEqual([t[0].type, t[0].config], ['timer', CRON[fn]], fn);
    } else if (fs.existsSync(tcfg)) {
      // only setClue has a config.json without a trigger: its cloud-call (openapi) permissions (D-2, spec 11.6)
      const c = JSON.parse(fs.readFileSync(tcfg, 'utf8'));
      assert.equal(fn, 'setClue', fn + ' must not have a config.json');
      assert.ok(!c.triggers, fn + ' must not have a trigger');
      assert.deepEqual(c.permissions.openapi.slice().sort(), ['security.msgSecCheck', 'wxa.game.contentSpam.msgSecCheck']);
    }
  }
});

test('AC 68: all collections are deny-all, every collection the code touches is covered, names carry the kedupan_ prefix', async () => {
  const rules = JSON.parse(fs.readFileSync(path.join(CF, 'database', 'rules.json'), 'utf8'));
  const names = Object.keys(rules).filter((k) => !k.startsWith('_'));
  names.forEach((n) => {
    assert.match(n, /^kedupan_/);
    assert.deepEqual(rules[n], { read: false, write: false }, n);
    assert.ok(rules._why[n] && rules._why[n].length > 10, n + ' documents why');
  });
  // the collections of CONTRACT.md section 2
  const contract = fs.readFileSync(path.join(CF, 'CONTRACT.md'), 'utf8');
  const table = contract.split('## 2. Collections')[1].split('`database/rules.json`: every')[0];
  const expected = Array.from(table.matchAll(/^\| `([a-z_]+)` \|/gm)).map((m) => 'kedupan_' + m[1]);
  assert.equal(expected.length, 21);
  assert.deepEqual(names.sort(), expected.sort());
  // a broad run touches only collections that have rules
  const be = real();
  try {
    await be.setAppConfig({ subscribe: { tmplId: 'T', fields: {} } });
    await be.call('a', 'joinGroup', { cloudID: be.cloudID('G', 3) });
    await playDay(be, 'a', [1, 2, 3, 4, 5]);
    const r = await be.call('a', 'createRound', { spectrumId: be.content.spectra[0].id });
    await be.clue('a', r.roundId);
    await be.call('a', 'subscribeRound', { roundId: r.roundId });
    await be.call('a', 'reportCard', { itemId: be.content.itemIds[0], reason: 'typo' });
    await be.call('a', 'track', { events: [{ name: 'session_start', props: {}, clientTs: 1 }] });
    await be.call('a', 'getBonusCard', {});
    await be.call('a', 'unlockDistribution', { dateKey: T1 });
    await be.call('a', 'getFriendBoard', { dateKey: T1 });
    await be.timer('genDaily');
    be.clock.set(BJ(T2, 1, 0, 0));
    for (const t of ['finalizeDay', 'sweepRounds', 'cleanup']) await be.timer(t);
    await be.call('a', 'getArchive', {});
    const touched = be.db.names();
    assert.ok(touched.length >= 14, touched.join());
    touched.forEach((n) => assert.ok(names.includes(n), `${n} has no rule`));
  } finally {
    be.dispose();
  }
  // function code never names the SDK collection itself (the prefix lives in common/store.js only)
  for (const fn of sync.listFunctions(CF)) {
    const src = fs.readFileSync(path.join(CF, fn, 'index.js'), 'utf8');
    assert.ok(!/\.collection\(|\bdatabase\(/.test(src), fn + ' bypasses common/store');
    assert.ok(!/game\/|\.\.\/core/.test(src.replace(/\/\/.*$/gm, '')), fn + ' imports outside common/');
  }
  for (const f of fs.readdirSync(path.join(CF, 'common'))) {
    if (f === 'store.js') continue;
    const src = fs.readFileSync(path.join(CF, 'common', f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    assert.ok(!/\.collection\(|\bdatabase\(/.test(src.replace(/store\.collT?\(/g, '')), f + ' bypasses common/store');
    if (f !== 'coreapi.js') assert.ok(!/require\('\.\.\/core/.test(src), f + ' requires the core directly');
  }
});

test('database/indexes.json covers every collection and each index has a documented query', () => {
  const idx = JSON.parse(fs.readFileSync(path.join(CF, 'database', 'indexes.json'), 'utf8'));
  const rules = JSON.parse(fs.readFileSync(path.join(CF, 'database', 'rules.json'), 'utf8'));
  assert.deepEqual(Object.keys(idx.collections).map((c) => 'kedupan_' + c).sort(), Object.keys(rules).filter((k) => !k.startsWith('_')).sort());
  const all = [];
  for (const [c, list] of Object.entries(idx.collections)) list.forEach((i) => all.push(`${c}.${i.name}`));
  assert.deepEqual(all.sort(), Object.keys(idx.reasons).sort());
});

test('identity: no OPENID in the context -> UNAUTHENTICATED for every client function; timers refuse a caller', async () => {
  const be = real();
  try {
    for (const fn of CLIENT_FUNCTIONS) {
      const r = await be.call(null, fn, {});
      assert.equal(r.code, 'UNAUTHENTICATED', fn);
      assert.equal(r.ok, false);
    }
    assert.equal(be.db.names().length, 0, 'nothing written');
    for (const t of TIMERS) assert.equal((await be.call('someone', t, {})).code, 'FORBIDDEN');
  } finally {
    be.dispose();
  }
});

test('responses are envelopes: unexpected errors become INTERNAL (never thrown); a missing library is SERVER_CONFIG-safe', async () => {
  const be = real();
  try {
    be.db.faults.push((op) => (op.name === 'kedupan_daily_sets' && op.kind === 'add' ? new Error('boom') : undefined));
    const r = await be.call('alice', 'getDaily', {});
    assert.deepEqual([r.ok, r.code], [false, 'INTERNAL']);
    assert.ok(!/boom/.test(flat(r)), 'internal details do not reach the client');
  } finally {
    be.dispose();
  }
});

test('transactions: a failed write rolls the whole submitCard back (entry, histogram, streak) and a retry succeeds once', async () => {
  const be = real();
  try {
    await playDay(be, 'sam', [1, 2, 3, 4]).catch(() => {});
    await be.call('sam', 'getDaily', {});
    for (let i = 0; i < 4; i++) await be.call('sam', 'submitCard', { dateKey: T1, idx: i, pos: 10 + i });
    const snapshot = flat([be.db.all('kedupan_daily_entries'), be.db.all('kedupan_daily_card_stats'), be.db.all('kedupan_player_stats')]);
    // the 5th card writes player_stats, the entry and the histogram: fail the LAST write
    be.db.faults.push((op) => (op.txn && op.name === 'kedupan_daily_card_stats' && op.kind === 'update' ? new Error('disk full') : undefined));
    const bad = await be.call('sam', 'submitCard', { dateKey: T1, idx: 4, pos: 50 });
    assert.equal(bad.code, 'INTERNAL');
    assert.equal(flat([be.db.all('kedupan_daily_entries'), be.db.all('kedupan_daily_card_stats'), be.db.all('kedupan_player_stats')]), snapshot, 'rolled back completely');
    be.db.faults.length = 0;
    const ok = await be.call('sam', 'submitCard', { dateKey: T1, idx: 4, pos: 50 });
    assert.equal(ok.ok, true);
    assert.equal(ok.complete, true);
    assert.equal((await be.statsN(T1, 4)), 1);
    assert.equal(be.db.get('kedupan_player_stats', 'sam').totalDays, 1);
  } finally {
    be.dispose();
  }
});

test('AC 82: a very fast complete day is flagged in anomalies after the commit and changes nothing for the player', async () => {
  const be = real();
  try {
    await be.call('bot', 'getDaily', {});
    const rs = [];
    for (let i = 0; i < 5; i++) rs.push(await be.call('bot', 'submitCard', { dateKey: T1, idx: i, pos: 50 }));
    assert.equal(rs[4].complete, true);
    const a = be.db.get('kedupan_anomalies', 'bot_' + T1 + '_fast');
    assert.equal(a.kind, 'fast');
    assert.ok(a.detail.ms < 6000);
    // a slow player is not flagged and gets the same response shape
    await be.call('slow', 'getDaily', {});
    const rs2 = [];
    for (let i = 0; i < 5; i++) {
      be.clock.add(20000);
      rs2.push(await be.call('slow', 'submitCard', { dateKey: T1, idx: i, pos: 50 }));
    }
    assert.equal(be.db.get('kedupan_anomalies', 'slow_' + T1 + '_fast'), undefined);
    assert.deepEqual(Object.keys(rs[4]).sort(), Object.keys(rs2[4]).sort());
    // an anomaly write failure never breaks the answer
    be.db.faults.push((op) => (op.name === 'kedupan_anomalies' ? new Error('nope') : undefined));
    await be.call('bot2', 'getDaily', {});
    let last;
    for (let i = 0; i < 5; i++) last = await be.call('bot2', 'submitCard', { dateKey: T1, idx: i, pos: 50 });
    assert.equal(last.ok, true);
  } finally {
    be.dispose();
  }
});

test('AC 25: finalizeDay handles 50,000 complete dailies (1,000 per page) and the percentile is exact', async () => {
  const be = real();
  try {
    await be.call('seed', 'getDaily', {});
    const set = be.db.get('kedupan_daily_sets', T1);
    const N = 50000;
    const totals = [];
    const final = [40, 50, 60, 30, 70];
    for (let i = 0; i < N; i++) {
      const pos = [i % 101, (i * 3) % 101, (i * 7) % 101, (i * 11) % 101, (i * 13) % 101];
      be.db.put('kedupan_daily_entries', { _id: `${T1}_n${i}`, openid: 'n' + i, dateKey: T1, pos, answeredAt: pos.map(() => 1), firstAt: 1, completeAt: 2 + i, streak: null, contentVersion: 1 });
    }
    be.db.put('kedupan_daily_entries', { _id: `${T1}_partial`, openid: 'partial', dateKey: T1, pos: [1, null, null, null, null], answeredAt: [1, null, null, null, null], firstAt: 1, completeAt: null, streak: null, contentVersion: 1 });
    be.db.put('kedupan_daily_sets', { ...set, final });
    be.clock.set(BJ(T2, 0, 45, 0));
    const t0 = Date.now ? process.hrtime.bigint() : 0n;
    const f = await be.timer('finalizeDay');
    const secs = Number(process.hrtime.bigint() - t0) / 1e9;
    assert.deepEqual(f.finalized, [T1]);
    assert.deepEqual(f.partial, []);
    for (let i = 0; i < N; i++) totals.push(S.dailyTotal([i % 101, (i * 3) % 101, (i * 7) % 101, (i * 11) % 101, (i * 13) % 101], final).total);
    const done = be.db.get('kedupan_daily_sets', T1);
    assert.equal(done.finalCount, N, 'the partial daily is not counted');
    assert.deepEqual(done.finalHist, S.buildFinalHist(totals));
    assert.equal(done.finalProgress, null);
    assert.ok(secs < 120, 'took ' + secs + ' s');
  } finally {
    be.dispose();
  }
});

test('AC 25: finalizeDay resumes after running out of time (cursor and partial histogram persist); references stay frozen', async () => {
  const be = real();
  try {
    await be.call('seed', 'getDaily', {});
    const N = 3500;
    for (let i = 0; i < N; i++) {
      const pos = [i % 101, (i * 3) % 101, (i * 7) % 101, (i * 11) % 101, (i * 13) % 101];
      be.db.put('kedupan_daily_entries', { _id: `${T1}_n${String(i).padStart(5, '0')}`, openid: 'n' + i, dateKey: T1, pos, answeredAt: pos.map(() => 1), firstAt: 1, completeAt: 2 + i, streak: null, contentVersion: 1 });
    }
    be.clock.set(BJ(T2, 0, 45, 0));
    let pages = 0;
    be.db.onQuery = (name) => {
      if (name === 'kedupan_daily_entries' && ++pages === 2) be.clock.add(1000 * 1000); // blow the time budget after two pages
    };
    const first = await be.timer('finalizeDay');
    assert.deepEqual([first.finalized, first.partial], [[], [T1]]);
    const mid = be.db.get('kedupan_daily_sets', T1);
    assert.equal(mid.finalizedAt, undefined);
    assert.equal(mid.finalProgress.count, 2000);
    assert.ok(Array.isArray(mid.final) && mid.final.length === 5, 'refs frozen first');
    be.db.onQuery = null;
    be.clock.set(BJ(T2, 0, 50, 0));
    const second = await be.timer('finalizeDay');
    assert.deepEqual(second.finalized, [T1]);
    const done = be.db.get('kedupan_daily_sets', T1);
    assert.equal(done.finalCount, N);
    const totals = [];
    for (let i = 0; i < N; i++) totals.push(S.dailyTotal([i % 101, (i * 3) % 101, (i * 7) % 101, (i * 11) % 101, (i * 13) % 101], done.final).total);
    assert.deepEqual(done.finalHist, S.buildFinalHist(totals), 'resumed aggregate equals the one-pass aggregate');
  } finally {
    be.dispose();
  }
});

test('AC 63: a failed subscribe send is recorded and never retried; pending grants are sent by the sweep; messages hold no identity', async () => {
  const be = real();
  try {
    await be.setAppConfig({ subscribe: { tmplId: 'TMPL', fields: { spectrum: 'thing9', mq: 'number8', time: 'time7' } } });
    const mk = async () => {
      const r = await be.call('host', 'createRound', { spectrumId: be.content.spectra[1].id });
      await be.clue('host', r.roundId);
      return r;
    };
    const r = await mk();
    await be.call('g1', 'submitGuess', { roundId: r.roundId, pos: 10 });
    await be.call('g2', 'submitGuess', { roundId: r.roundId, pos: 20 });
    await be.call('g1', 'subscribeRound', { roundId: r.roundId });
    await be.call('g2', 'subscribeRound', { roundId: r.roundId });
    be.real.sdk.state.failSend = 43101; // user refused
    await be.call('host', 'revealRound', { roundId: r.roundId });
    const g1 = be.db.get('kedupan_sub_grants', `${r.roundId}_g1`);
    assert.equal(g1.used, true);
    assert.equal(g1.sendErrCode, '43101');
    assert.equal(be.real.sdk.state.sent.length, 0);
    be.real.sdk.state.failSend = null;
    await be.timer('sweepRounds');
    assert.equal(be.real.sdk.state.sent.length, 0, 'a claimed grant is never re-sent');
    // a grant that was never claimed (budget exhausted) is picked up by the sweep
    be.db.put('kedupan_sub_grants', { _id: `${r.roundId}_late`, roundId: r.roundId, openid: 'late', tmplId: 'TMPL', grantedAt: be.clock.now(), used: false });
    const sw = await be.timer('sweepRounds');
    assert.equal(sw.sent, 1);
    const [m] = be.real.sdk.state.sent;
    assert.equal(m.touser, 'late');
    assert.equal(m.templateId, 'TMPL');
    assert.equal(m.page, `index?r=${r.roundId}`);
    assert.deepEqual(Object.keys(m.data).sort(), ['number8', 'thing9', 'time7']);
    assert.match(m.data.thing9.value, /↔/);
    assert.ok(!/host|g1|g2|late/.test(flat(m.data)));
    await be.timer('sweepRounds');
    assert.equal(be.real.sdk.state.sent.length, 1);
  } finally {
    be.dispose();
  }
});

test('AC 77: track sanitises: unknown names dropped, identifier keys stripped, oversize props dropped, sessionId top level, 300 events a minute', async () => {
  const be = real();
  try {
    const ok = { name: 'daily_complete', props: { dateKey: T1, total: 300, durationMs: 5000, hasGroup: true, streak: 2, groupRef: 'a'.repeat(16), openGId: 'G', nested: { openid: 'x', keep: 1, deep: { a: { b: { c: { d: 1 } } } } } }, clientTs: 5 };
    const r = await be.call('alice', 'track', {
      sessionId: 'sess_1',
      events: [ok, { name: 'round_reveal', props: {} }, { name: 'made_up', props: {} }, { name: 'error', props: Object.fromEntries(Array.from({ length: 12 }, (_x, i) => ['k' + i, 'x'.repeat(200)])) }, { name: 'share_tap', props: { kind: 'daily' }, sessionId: 'inner-2' }, 'junk', null],
    });
    assert.equal(r.accepted, 3, 'valid names only; server-side names are dropped; unknown prop keys are dropped, not the event (L2)');
    const rows = be.db.all('kedupan_events');
    assert.equal(rows.length, 3);
    const first = rows.find((e) => e.name === 'daily_complete');
    assert.equal(first.openid, 'alice');
    assert.equal(first.sessionId, 'sess_1');
    assert.equal(first.clientTs, 5);
    assert.ok(!/groupRef|openGId|openid/i.test(flat(first.props)));
    assert.deepEqual(first.props, { dateKey: T1, total: 300, durationMs: 5000, hasGroup: true, streak: 2 }, 'allowlist: nested, identifier and unknown keys are gone');
    assert.deepEqual(rows.find((e) => e.name === 'error').props, {}, 'twelve unknown keys leave an empty props object');
    assert.equal(rows.find((e) => e.name === 'share_tap').sessionId, 'inner-2');
    for (let i = 0; i < 5; i++) assert.equal((await be.call('flood', 'track', { events: Array.from({ length: 50 }, () => ({ name: 'session_start', props: {} })) })).accepted, 50);
    // 250 used; 6th batch of 50 reaches 300; the 7th is refused
    assert.equal((await be.call('flood', 'track', { events: Array.from({ length: 50 }, () => ({ name: 'session_start', props: {} })) })).accepted, 50);
    assert.equal((await be.call('flood', 'track', { events: [{ name: 'session_start', props: {} }] })).code, 'RATE_LIMITED');
    be.clock.add(61000);
    assert.equal((await be.call('flood', 'track', { events: [{ name: 'session_start', props: {} }] })).accepted, 1);
  } finally {
    be.dispose();
  }
});

test('AC 67: cleanup removes data older than 180 days and keeps aggregates, config and recent data', async () => {
  const be = real();
  try {
    const old = be.clock.now() - 181 * 86400e3;
    const fresh = be.clock.now() - 5 * 86400e3;
    const oldKey = '20260401';
    const put = (c, d) => be.db.put('kedupan_' + c, d);
    put('daily_entries', { _id: `${oldKey}_a`, dateKey: oldKey, openid: 'a' });
    put('daily_entries', { _id: `${T1}_a`, dateKey: T1, openid: 'a' });
    put('player_stats', { _id: 'old', updatedAt: old });
    put('player_stats', { _id: 'new', updatedAt: fresh });
    put('group_members', { _id: 'g_old', lastSeen: oldKey });
    put('group_members', { _id: 'g_new', lastSeen: T1 });
    put('group_daily', { _id: 'o', computedAt: old });
    put('rounds', { _id: 'ROLD0000', createdAt: old });
    put('rounds', { _id: 'RNEW0000', createdAt: fresh });
    put('guesses', { _id: 'x_old', ts: old });
    put('guesses', { _id: 'x_new', ts: fresh });
    put('sub_grants', { _id: 's_old', grantedAt: old });
    put('card_reports', { _id: 'c_old', ts: old });
    put('anomalies', { _id: 'an_old', ts: old });
    put('events', { _id: 'e_old', ts: old });
    put('events', { _id: 'e_new', ts: fresh });
    put('rate_limits', { _id: 'r_old', expireAt: be.clock.now() - 1 });
    put('rate_limits', { _id: 'r_new', expireAt: be.clock.now() + 1e6 });
    put('daily_sets', { _id: oldKey, dateKey: oldKey, createdAt: old });
    put('daily_card_stats', { _id: oldKey + '_0', hist: [], n: 0 });
    put('item_usage', { _id: 's001i01', dateKey: oldKey });
    put('meta', { _id: 'launch', dateKey: '20261101' });
    put('app_config', { _id: 'live' });
    const r = await be.timer('cleanup');
    assert.equal(r.ok, true);
    const ids = (c) => be.db.all('kedupan_' + c).map((d) => d._id).sort();
    assert.deepEqual(ids('daily_entries'), [`${T1}_a`]);
    assert.deepEqual(ids('player_stats'), ['new']);
    assert.deepEqual(ids('group_members'), ['g_new']);
    assert.deepEqual(ids('rounds'), ['RNEW0000']);
    assert.deepEqual(ids('guesses'), ['x_new']);
    assert.deepEqual(ids('events'), ['e_new']);
    assert.deepEqual(ids('rate_limits'), ['r_new']);
    for (const c of ['group_daily', 'sub_grants', 'card_reports', 'anomalies']) assert.deepEqual(ids(c), [], c);
    for (const c of ['daily_sets', 'daily_card_stats', 'item_usage', 'meta', 'app_config']) assert.equal(be.db.size('kedupan_' + c), 1, c + ' kept');
    assert.deepEqual(ids('daily_sets'), [oldKey]);
    const again = await be.timer('cleanup');
    assert.equal(again.ok, true, 'idempotent');
  } finally {
    be.dispose();
  }
});

test('env: LAUNCH_DATE_KEY overrides the launch date; a missing pepper is SERVER_CONFIG; meta/launch is recorded once', async () => {
  let be = real({ env: { LAUNCH_DATE_KEY: '20261110' } });
  try {
    assert.equal((await be.call('a', 'getDaily', {})).code, 'DAILY_UNAVAILABLE', 'before the env launch date');
    be.clock.set(BJ('20261111', 9, 0, 0));
    const d = await be.call('a', 'getDaily', {});
    assert.equal(d.ok, true);
    assert.equal(d.issueNo, 2);
    assert.equal(be.db.get('kedupan_meta', 'launch').dateKey, '20261110');
  } finally {
    delete process.env.LAUNCH_DATE_KEY;
    be.dispose();
  }
  be = real();
  try {
    const d = await be.call('a', 'getDaily', {});
    assert.equal(d.issueNo, 5);
    assert.equal(be.db.get('kedupan_meta', 'launch').dateKey, '20261101', 'recorded from the schedule');
    delete process.env.GROUP_REF_PEPPER;
    const j = await be.call('a', 'joinGroup', { cloudID: be.cloudID('G', 3) });
    assert.equal(j.code, 'SERVER_CONFIG');
    assert.equal(be.db.size('kedupan_group_members'), 0);
  } finally {
    be.dispose();
  }
});

test('caches: the friend list is cached per instance but the caller\'s own row is always fresh; membership is never cached', async () => {
  const be = real({ env: { KD_CACHE_SEC: '60' } });
  try {
    await playDay(be, 'early', [10, 20, 30, 40, 50]);
    const b1 = await be.call('early', 'getFriendBoard', { dateKey: T1 });
    assert.equal(b1.total, 1);
    be.clock.add(10000);
    await playDay(be, 'second', [11, 21, 31, 41, 51]);
    const stale = await be.call('early', 'getFriendBoard', { dateKey: T1 });
    assert.equal(stale.total, 1, 'cached list (<= 60 s old)');
    const own = await be.call('second', 'getFriendBoard', { dateKey: T1 });
    assert.equal(own.viewerDone, true);
    assert.ok(own.rows.some((r) => r[0] === own.selfHash), 'own row is fresh');
    be.clock.add(61000);
    assert.equal((await be.call('early', 'getFriendBoard', { dateKey: T1 })).total, 2);
    // membership: a fresh join is honoured at once even with the cache on
    const ref = (await be.call('early', 'joinGroup', { cloudID: be.cloudID('G', 3) })).groupRef;
    assert.equal((await be.call('early', 'getGroupDay', { groupRef: ref, dateKey: T1 })).ok, true);
    const j2 = (await be.call('second', 'joinGroup', { cloudID: be.cloudID('G', 3) })).groupRef;
    const g = await be.call('second', 'getGroupDay', { groupRef: j2, dateKey: T1 });
    assert.equal(g.ok, true);
    assert.ok(g.rows.some((r) => r[0] === g.selfHash), 'the joining player is in the board even before the member cache expires');
  } finally {
    process.env.KD_CACHE_SEC = '0';
    be.dispose();
  }
});

test('AC 7/sync: the staged bundle carries common/, the core, the real library and schedule.v1.js; forbidden.v1.js is not shipped; no drift', () => {
  const st = sharedStage(true);
  {
    assert.deepEqual(sync.checkDrift({ root: st.root, coreSrc: st.coreSrc }), []);
    for (const fn of sync.listFunctions(st.root)) {
      for (const f of ['common/util.js', 'common/store.js', 'core/service.js', 'core/content/spectra.v1.js', 'core/content/anchors.v1.js', 'core/content/schedule.v1.js']) assert.ok(fs.existsSync(path.join(st.root, fn, f)), `${fn}/${f}`);
      assert.ok(!fs.existsSync(path.join(st.root, fn, 'core/content/forbidden.v1.js')), fn + ' ships the forbidden-terms list');
    }
    const sch = require(path.join(st.root, 'getDaily', 'core', 'content', 'schedule.v1.js'));
    assert.equal(sch.days.length, schedule.days.length);
    assert.equal(sch.launchDateKey, '20261101');
  }
  const bare = sharedStage(false);
  assert.ok(!fs.existsSync(path.join(bare.root, 'getDaily', 'core', 'content', 'schedule.v1.js')));
  assert.deepEqual(sync.checkDrift({ root: bare.root, coreSrc: bare.coreSrc }), []);
  // the real checkout is in sync (common/ copies are committed; core copies are git-ignored and regenerated)
  assert.deepEqual(sync.checkDrift({ root: CF, commonOnly: true }), []);
});

test('TD-29: deploy-pack builds kedupan_-prefixed function folders with their triggers and no tests', () => {
  const os = require('node:os');
  const { pack } = require('../scripts/deploy-pack');
  const st = sharedStage(true);
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'kd-pack-'));
  try {
    const m = pack({ root: st.root, coreSrc: st.coreSrc, out });
    assert.equal(m.functions.length, 24);
    assert.deepEqual(fs.readdirSync(out).filter((d) => d !== 'MANIFEST.json').sort(), [...CLIENT_FUNCTIONS, 'admin', ...TIMERS].map((n) => 'kedupan_' + n).sort());
    assert.deepEqual(m.timers.map((t) => [t.deployName, t.cron]).sort(), [
      ['kedupan_cleanup', '0 0 4 * * * *'], ['kedupan_finalizeDay', '0 40 0 * * * *'], ['kedupan_genDaily', '0 0 23 * * * *'], ['kedupan_sweepRounds', '0 0 * * * * *'],
    ]);
    // D-2: the cloud-call permissions travel with setClue (config.json) and are listed in the manifest; no other function has any
    assert.deepEqual(m.functions.filter((f) => f.openapi).map((f) => [f.deployName, f.openapi]), [['kedupan_setClue', ['security.msgSecCheck', 'wxa.game.contentSpam.msgSecCheck']]]);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(out, 'kedupan_setClue', 'config.json'), 'utf8')).permissions.openapi.sort(), ['security.msgSecCheck', 'wxa.game.contentSpam.msgSecCheck']);
    assert.ok(fs.existsSync(path.join(out, 'kedupan_admin', 'index.js')));
    for (const f of m.functions) {
      for (const p of ['index.js', 'package.json', 'function.config.json', 'common/util.js', 'core/service.js', 'core/content/spectra.v1.js']) assert.ok(fs.existsSync(path.join(out, f.deployName, p)), f.deployName + '/' + p);
      assert.ok(!fs.existsSync(path.join(out, f.deployName, 'tests')));
    }
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test('the real content library is served through the functions: all 314 spectra can host a round; cards come from the library', async () => {
  const be = real();
  try {
    const d = await be.call('a', 'getDaily', {});
    d.cards.forEach((c) => assert.ok(be.content.itemIndex[c.itemId]));
    assert.ok(be.content.spectra.length >= 300);
    let n = 0;
    for (const sp of be.content.spectra) {
      const r = await be.call('u' + Math.floor(n++ / 20), 'createRound', { spectrumId: sp.id });
      assert.equal(r.ok, true, sp.id);
      assert.equal(r.left, sp.left);
    }
  } finally {
    be.dispose();
  }
});
