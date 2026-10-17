'use strict';
// Security-audit fixes (M1, M3, L1, L2, L3, L4, L5) on the REAL functions and the fake database.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const sync = require('../scripts/sync-core');
const { makeBackend, disposeStages, BJ } = require('./helpers/backends');
const { sdk } = require('./helpers/real-backend');
const { CONFIG } = require('../../game/core/config');
const EV = require('../../game/core/events');
const { CLIENT_FUNCTIONS, TIMERS } = require('../../game/js/mock-server');

const CF = sync.CF_ROOT;
const T1 = '20261105';
const real = (o) => makeBackend('real', o);
test.after(() => disposeStages());

async function openRound(be, host) {
  const r = await be.call(host, 'createRound', { spectrumId: be.content.spectra[3].id });
  assert.equal((await be.clue(host, r.roundId)).ok, true);
  return r;
}

// ---- M3 ---------------------------------------------------------------------------------------------------------------

test('M3: every client function has a per-openid per-minute limit; the call after the limit is RATE_LIMITED (scope minute), another user and the next minute are unaffected', async () => {
  assert.deepEqual(Object.keys(CONFIG.limits.perMinute).sort(), [...CLIENT_FUNCTIONS, 'admin'].sort(), 'the table covers exactly the client functions (and admin, for an allow-listed openid)');
  const be = real({ limits: true });
  try {
    for (const fn of CLIENT_FUNCTIONS) {
      const limit = CONFIG.limits.perMinute[fn];
      assert.ok(limit >= 10 && limit <= 60, fn);
      for (let i = 0; i < limit; i++) {
        const r = await be.call('spammer', fn, { bad: 'input' }); // invalid input is cheap and still counts
        assert.notEqual(r.code, 'RATE_LIMITED', `${fn} call ${i + 1}`);
      }
      const over = await be.call('spammer', fn, { bad: 'input' });
      assert.equal(over.code, 'RATE_LIMITED', fn);
      assert.equal(over.scope, 'minute', fn);
      assert.notEqual((await be.call('other', fn, { bad: 'input' })).code, 'RATE_LIMITED', fn + ' is per openid');
      be.clock.add(60000);
      assert.notEqual((await be.call('spammer', fn, { bad: 'input' })).code, 'RATE_LIMITED', fn + ' resets next minute');
    }
  } finally {
    be.dispose();
  }
});

test('M3: reads are about 60 a minute, writes about 20 (the documented table)', () => {
  const p = CONFIG.limits.perMinute;
  for (const fn of ['getDaily', 'getArchive', 'getArchiveDay', 'getRound']) assert.equal(p[fn], 60, fn);
  for (const fn of ['submitGuess', 'createRound', 'setClue', 'revealRound', 'subscribeRound', 'joinGroup']) assert.equal(p[fn], 20, fn);
});

test('M3: getBonusCard is charged BEFORE the 60-set scan: a refused call reads no daily_sets', async () => {
  const be = real({ limits: true, date: '20261110' });
  try {
    const limit = CONFIG.limits.perMinute.getBonusCard;
    for (let i = 0; i < limit; i++) await be.call('u', 'getBonusCard', {});
    let sets = 0;
    be.db.onQuery = (name) => { if (name === 'kedupan_daily_sets') sets++; };
    const r = await be.call('u', 'getBonusCard', {});
    assert.equal(r.code, 'RATE_LIMITED');
    assert.equal(sets, 0, 'no scan for a refused call');
  } finally {
    be.dispose();
  }
});

test('M3: late guesses shown in a reveal are capped (on-time guesses are never cut)', async () => {
  const be = real();
  try {
    const r = await openRound(be, 'host');
    for (const [i, u] of ['a', 'b', 'c'].entries()) await be.call(u, 'submitGuess', { roundId: r.roundId, pos: 20 + i * 10 });
    assert.equal((await be.call('host', 'revealRound', { roundId: r.roundId })).ok, true);
    const cap = CONFIG.caps.guessesShown;
    for (let i = 0; i < cap + 100; i++) be.db.put('kedupan_guesses', { _id: `${r.roundId}_late${i}`, roundId: r.roundId, openid: 'late' + i, pos: 50, ts: 1000 + i, late: true, groupRef: null });
    const v = await be.call('host', 'getRound', { roundId: r.roundId });
    const late = v.reveal.rows.filter((row) => row[3] === 1);
    assert.equal(late.length, cap);
    assert.equal(v.reveal.rows.filter((row) => row[3] === 0 && row[4] === 0).length, 3, 'all on-time guesses present');
    assert.equal(v.reveal.mq, (await be.call('a', 'getRound', { roundId: r.roundId })).reveal.mq);
  } finally {
    be.dispose();
  }
});

test('M3: board_list server events are sampled (1 in N, carrying N); N = 1 writes every one', async () => {
  const be = real();
  const rnd = Math.random;
  try {
    await be.call('u', 'getDaily', {});
    const count = () => be.db.all('kedupan_events').filter((e) => e.name === 'board_list').length;
    process.env.KD_EVENT_SAMPLE_EVERY = '1';
    await be.call('u', 'getFriendBoard', { dateKey: T1 });
    assert.equal(count(), 1);
    delete process.env.KD_EVENT_SAMPLE_EVERY; // production default: CONFIG.caps.boardEventEvery
    Math.random = () => 0.5; // not the lucky 1-in-N
    await be.call('u', 'getFriendBoard', { dateKey: T1 });
    assert.equal(count(), 1, 'sampled out');
    Math.random = () => 0; // the lucky one
    await be.call('u', 'getFriendBoard', { dateKey: T1 });
    assert.equal(count(), 2);
    const kept = be.db.all('kedupan_events').filter((e) => e.name === 'board_list').pop();
    assert.equal(kept.props.every, CONFIG.caps.boardEventEvery);
  } finally {
    Math.random = rnd;
    process.env.KD_EVENT_SAMPLE_EVERY = '1';
    be.dispose();
  }
});

// ---- M1 ---------------------------------------------------------------------------------------------------------------

test('M1: joinGroup resolves the raw cloudID with cloud.getOpenData({list:[cloudID]}) and never reads event.groupData', async () => {
  const be = real();
  try {
    const cid = be.cloudID('GROUP-X', 3);
    const r = await be.call('alice', 'joinGroup', { cloudID: cid, groupData: { data: { opengid: 'EVIL', chat_type: 3 } } });
    assert.equal(r.ok, true);
    assert.deepEqual(sdk.state.openData.map((a) => a.list), [[cid]]);
    assert.ok(be.db.get('kedupan_group_members', 'GROUP-X_alice'), 'joined the resolved group');
    assert.equal(be.db.get('kedupan_group_members', 'EVIL_alice'), undefined, 'the client-shaped payload was ignored');
    // the forged object is rejected without any platform call
    const before = sdk.state.openData.length;
    for (const forged of [{ groupData: { cloudID: 'c', data: { opengid: 'G', chat_type: 3 } } }, { cloudID: { cloudID: 'c', data: { opengid: 'G', chat_type: 3 } } }, { groupData: 'G' }]) {
      assert.equal((await be.call('mallory', 'joinGroup', forged)).code, 'BAD_CLOUDID');
    }
    assert.equal(sdk.state.openData.length, before);
    assert.equal(be.db.size('kedupan_group_members'), 1);
  } finally {
    be.dispose();
  }
});

test('M1: item parsing: errCode, foreign cloudID, non-object data, missing or foreign chat_type are refused', async () => {
  const be = real();
  try {
    const mod = require(path.join(require('./helpers/backends').sharedStage(true).root, 'joinGroup', 'index.js'));
    const ok = { cloudID: 'c', data: { opengid: 'G', chat_type: 3 } };
    assert.deepEqual(mod.groupOf(mod.payloadOf(ok, 'c')), { openGId: 'G' });
    assert.equal(mod.payloadOf({ cloudID: 'c', json: JSON.stringify({ opengid: 'G', chat_type: 3 }) }, 'c'), null, 'only the documented data object counts');
    assert.equal(mod.payloadOf({ ...ok, errCode: -1 }, 'c'), null);
    assert.equal(mod.payloadOf({ ...ok, errcode: 40001 }, 'c'), null);
    assert.equal(mod.payloadOf(ok, 'other'), null, 'an item for another cloudID');
    assert.equal(mod.payloadOf({ cloudID: 'c', data: [1] }, 'c'), null);
    assert.equal(mod.payloadOf({ cloudID: 'c', data: 'x' }, 'c'), null);
    assert.equal(mod.payloadOf(null, 'c'), null);
    assert.equal(mod.groupOf(null).code, 'BAD_CLOUDID');
    assert.deepEqual(mod.groupOf({ opengid: 'G' }), { openGId: 'G' }, 'chat_type absent is accepted (CTO ruling)');
    assert.deepEqual(mod.groupOf({ opengid: 'G', chat_type: 4 }), { openGId: 'G' });
    for (const d of [{ open_single_roomid: 'R' }, { open_single_roomid: 'R', chat_type: 3 }, { opengid: 'G', chat_type: null }, { opengid: 'G', chat_type: 1 }, { opengid: 'G', chat_type: 'x' }, { opengid: 'G', chat_type: 3.5 }, { chat_type: 3 }, { opengid: 5, chat_type: 3 }, { opengid: 'x'.repeat(129), chat_type: 3 }]) {
      assert.equal(mod.groupOf(d).code, 'NOT_GROUP', JSON.stringify(d));
    }
    // a platform error from getOpenData itself
    const orig = sdk.getOpenData;
    sdk.getOpenData = async () => { throw new Error('boom'); };
    try {
      assert.equal((await be.call('alice', 'joinGroup', { cloudID: be.cloudID('G', 3) })).code, 'BAD_CLOUDID');
    } finally {
      sdk.getOpenData = orig;
    }
  } finally {
    be.dispose();
  }
});

// ---- L5 ---------------------------------------------------------------------------------------------------------------

test('L5: GROUP_REF_PEPPER must be at least 32 characters', async () => {
  const short = real({ env: { GROUP_REF_PEPPER: 'x'.repeat(31) } });
  try {
    assert.equal((await short.call('a', 'joinGroup', { cloudID: short.cloudID('G', 3) })).code, 'SERVER_CONFIG');
    assert.equal(short.db.size('kedupan_group_members'), 0);
  } finally {
    short.dispose();
  }
  const ok = real({ env: { GROUP_REF_PEPPER: 'x'.repeat(32) } });
  try {
    assert.equal((await ok.call('a', 'joinGroup', { cloudID: ok.cloudID('G', 3) })).ok, true);
  } finally {
    ok.dispose();
  }
  const readme = fs.readFileSync(path.join(CF, 'README.md'), 'utf8');
  assert.match(readme, /Missing or shorter than 32 characters/);
});

// ---- L1 ---------------------------------------------------------------------------------------------------------------

test('L1: the lazy discard re-reads inside a transaction: a draft that was opened meanwhile survives', async () => {
  const be = real();
  try {
    const r = await openRound(be, 'host'); // status open
    const doc = be.db.get('kedupan_rounds', r.roundId);
    be.db.put('kedupan_rounds', { ...doc, status: 'draft', createdAt: be.clock.now() - 31 * 60000 }); // looks stale
    const orig = be.db.runTransaction.bind(be.db);
    let raced = false;
    be.db.runTransaction = async (fn) => {
      if (!raced) { raced = true; be.db.put('kedupan_rounds', { ...doc, status: 'open', createdAt: be.clock.now() - 31 * 60000 }); } // setClue wins the race
      return orig(fn);
    };
    const v = await be.call('guest', 'getRound', { roundId: r.roundId });
    assert.equal(v.ok, true);
    assert.equal(be.db.get('kedupan_rounds', r.roundId).status, 'open', 'not discarded on stale data');
    be.db.runTransaction = orig;
    // and a genuinely stale draft is still discarded
    be.db.put('kedupan_rounds', { ...doc, status: 'draft', createdAt: be.clock.now() - 31 * 60000 });
    assert.equal((await be.call('guest', 'getRound', { roundId: r.roundId })).code, 'ROUND_NOT_FOUND');
    assert.equal(be.db.get('kedupan_rounds', r.roundId), undefined);
  } finally {
    be.dispose();
  }
});

test('L1: the lazy noGuesses re-reads inside a transaction: a guess that landed meanwhile turns it into a timer reveal', async () => {
  const be = real();
  try {
    const r = await openRound(be, 'host');
    const doc = be.db.get('kedupan_rounds', r.roundId);
    const old = be.clock.now() - 25 * 3600e3;
    be.db.put('kedupan_rounds', { ...doc, createdAt: old, guessCount: 0 });
    const orig = be.db.runTransaction.bind(be.db);
    let raced = false;
    be.db.runTransaction = async (fn) => {
      if (!raced) {
        raced = true;
        be.db.put('kedupan_rounds', { ...doc, createdAt: old, guessCount: 1 });
        be.db.put('kedupan_guesses', { _id: `${r.roundId}_g`, roundId: r.roundId, openid: 'g', pos: 40, ts: old + 1000, late: false, groupRef: null });
      }
      return orig(fn);
    };
    const v = await be.call('host', 'getRound', { roundId: r.roundId });
    be.db.runTransaction = orig;
    assert.equal(v.status, 'revealed', 'revealed by timer, not marked noGuesses');
    assert.equal(be.db.get('kedupan_rounds', r.roundId).revealBy, 'timer');
    // untouched stale open round without guesses does become noGuesses
    const r2 = await openRound(be, 'host2');
    const d2 = be.db.get('kedupan_rounds', r2.roundId);
    be.db.put('kedupan_rounds', { ...d2, createdAt: old });
    assert.equal((await be.call('host2', 'getRound', { roundId: r2.roundId })).status, 'noGuesses');
  } finally {
    be.dispose();
  }
});

// ---- L2 ---------------------------------------------------------------------------------------------------------------

test('L2: track keeps only the allowlisted, correctly typed props of each event', async () => {
  const be = real();
  try {
    const ev = (name, props) => ({ name, props });
    const r = await be.call('u', 'track', {
      sessionId: 's1',
      events: [
        ev('share_tap', { kind: 'daily', dateKey: T1, roundId: 'ABCDEFGH', free: 'text', isNewUser: true, contentVersion: 2, appVersion: '0.1.0' }),
        ev('share_tap', { kind: 'DROP TABLE', dateKey: '2026-11-05', roundId: 'abc', isNewUser: 'yes', contentVersion: 2.5, appVersion: 'x'.repeat(40) }),
        ev('daily_card_reveal', { dateKey: T1, idx: 9, d: 3, score: 90, label: '心有灵犀', hasGroup: false, n: 12, extra: { a: 1 } }),
        ev('daily_card_reveal', { dateKey: T1, idx: 2, d: '3', score: {}, label: 'x'.repeat(13), hasGroup: 1, n: null }),
        ev('error', { where: 'getDaily', code: 'RATE_LIMITED', openid: 'o', groupRef: 'g' }),
        ev('error', { where: 'has space', code: ['a'] }),
        ev('ad_show', { placement: 'banner', stub: false, errCode: 12 }),
        ev('ad_show', { placement: 'nope', stub: 'no' }),
      ],
    });
    assert.equal(r.accepted, 8);
    const rows = be.db.all('kedupan_events').sort((a, b) => 0);
    const props = rows.map((e) => e.props);
    assert.deepEqual(props[0], { kind: 'daily', dateKey: T1, roundId: 'ABCDEFGH', isNewUser: true, contentVersion: 2, appVersion: '0.1.0' });
    assert.deepEqual(props[1], {}, 'bad enum, date, round id, bool, int and length are all dropped');
    assert.deepEqual(props[2], { dateKey: T1, d: 3, score: 90, label: '心有灵犀', hasGroup: false, n: 12 }, 'idx 9 is out of range; extra is unknown');
    assert.deepEqual(props[3], { dateKey: T1, idx: 2, n: null });
    assert.deepEqual(props[4], { where: 'getDaily', code: 'RATE_LIMITED' });
    assert.deepEqual(props[5], {});
    assert.deepEqual(props[6], { placement: 'banner', stub: false, errCode: 12 });
    assert.deepEqual(props[7], {});
  } finally {
    be.dispose();
  }
});

test('L2: every prop key of every event has a type, and the sanitizer is a pure allowlist', () => {
  for (const [name, spec] of Object.entries(EV.EVENTS)) {
    for (const k of spec.map((x) => x.replace(/\?$/, '')).concat(EV.COMMON)) assert.ok(EV.PROP_TYPES[k], `${name}.${k} has no type`);
  }
  assert.deepEqual(EV.sanitizeProps('nope', { a: 1 }), {});
  assert.deepEqual(EV.sanitizeProps('howto_view', 'str'), {});
  assert.deepEqual(EV.sanitizeProps('howto_view', { auto: true, __proto__: { x: 1 }, constructor: 5 }), { auto: true });
});

// ---- L3 ---------------------------------------------------------------------------------------------------------------

test('L3: timers need the timer trigger marker as well as no openid; a bare call is FORBIDDEN, a console run with the marker works', async () => {
  const be = real();
  try {
    const timerMain = (name) => require(path.join(require('./helpers/backends').sharedStage(true).root, name, 'index.js')).main;
    sdk.state.openid = null;
    for (const t of TIMERS) {
      assert.equal((await timerMain(t)({})).code, 'FORBIDDEN', t + ' bare call');
      assert.equal((await timerMain(t)({ Type: 'Cron' })).code, 'FORBIDDEN', t + ' wrong type');
      assert.equal((await timerMain(t)({ TriggerName: '' })).code, 'FORBIDDEN', t + ' empty trigger name');
    }
    // studio standard: BOTH markers are required (Type 'Timer' and a non-empty TriggerName of at most 128 characters)
    for (const half of [{ Type: 'Timer' }, { TriggerName: 'manual' }, { Type: 'timer', TriggerName: 'manual' }, { Type: 'Timer', TriggerName: 'x'.repeat(129) }, { Type: 'Timer', TriggerName: 5 }]) {
      assert.equal((await timerMain('sweepRounds')(half)).code, 'FORBIDDEN', JSON.stringify(half).slice(0, 60));
    }
    assert.equal((await timerMain('sweepRounds')({ Type: 'Timer', TriggerName: 'manual' })).ok, true);
    assert.equal((await be.timer('cleanup')).ok, true);
  } finally {
    be.dispose();
  }
});

test('L3: the storage rule file is deny-all, and the README documents the console steps', () => {
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(CF, 'storage', 'rules.json'), 'utf8')), { read: false, write: false });
  assert.ok(!sync.listFunctions(CF).includes('storage'), 'storage/ is not a function folder');
  const readme = fs.readFileSync(path.join(CF, 'README.md'), 'utf8');
  for (const needle of [/storage\/rules\.json/, /anonymous/i, /HTTP access/i, /"Type":"Timer"/]) assert.match(readme, needle);
});

// ---- L4 ---------------------------------------------------------------------------------------------------------------

async function revealedRound(be) {
  const r = await openRound(be, 'host');
  for (const [i, u] of ['a', 'b', 'c'].entries()) {
    be.clock.add(1000);
    await be.call(u, 'submitGuess', { roundId: r.roundId, pos: 30 + i * 20 });
  }
  assert.equal((await be.call('host', 'revealRound', { roundId: r.roundId })).ok, true);
  return r;
}

test('L4: a revealed round withholds the answer from a player who could still guess late until they ask; asking closes the late guess', async () => {
  const be = real();
  try {
    const r = await revealedRound(be);
    const hidden = await be.call('late', 'getRound', { roundId: r.roundId });
    assert.equal(hidden.status, 'revealed');
    assert.equal(hidden.answerHidden, true);
    assert.ok(!('reveal' in hidden) && !JSON.stringify(hidden).includes('"target"'), 'no target, no rows');
    assert.equal((await be.call('late', 'getRound', { roundId: r.roundId })).answerHidden, true, 'still hidden on the next read');
    // the host and a guesser get it by default
    assert.ok((await be.call('host', 'getRound', { roundId: r.roundId })).reveal);
    assert.ok((await be.call('a', 'getRound', { roundId: r.roundId })).reveal);
    // 先猜再看: guessing without having been served the answer works, and the guesser then sees the reveal
    const g = await be.call('late', 'submitGuess', { roundId: r.roundId, pos: r.target });
    assert.equal(g.ok, true);
    assert.equal(g.late, true);
    const row = g.reveal.rows.find((x) => x[3] === 1);
    assert.equal(row[2], null, 'a late row never shows a score');
    assert.ok((await be.call('late', 'getRound', { roundId: r.roundId })).reveal);
    // 直接看答案: asking is recorded and the late guess is refused afterwards
    const asked = await be.call('peek', 'getRound', { roundId: r.roundId, showAnswer: true });
    assert.ok(asked.reveal && !asked.answerHidden);
    assert.ok(be.db.get('kedupan_reveal_views', `${r.roundId}_peek`));
    assert.ok((await be.call('peek', 'getRound', { roundId: r.roundId })).reveal, 'stays visible');
    const refused = await be.call('peek', 'submitGuess', { roundId: r.roundId, pos: r.target });
    assert.equal(refused.code, 'ROUND_EXPIRED');
    assert.equal(be.db.get('kedupan_guesses', `${r.roundId}_peek`), undefined);
    // everyone sees the answer once guessing is closed (> 7 days)
    be.clock.add(8 * 86400e3);
    assert.ok((await be.call('newcomer', 'getRound', { roundId: r.roundId })).reveal);
  } finally {
    be.dispose();
  }
});

test('L4: no score appears on a late row in any reveal view', async () => {
  const be = real();
  try {
    const r = await revealedRound(be);
    await be.call('late', 'submitGuess', { roundId: r.roundId, pos: 50 });
    for (const u of ['host', 'a', 'late']) {
      const v = await be.call(u, 'getRound', { roundId: r.roundId });
      v.reveal.rows.filter((row) => row[3] === 1).forEach((row) => assert.equal(row[2], null));
      v.reveal.rows.filter((row) => row[3] === 0 && row[4] === 0).forEach((row) => assert.equal(typeof row[2], 'number'));
    }
  } finally {
    be.dispose();
  }
});
