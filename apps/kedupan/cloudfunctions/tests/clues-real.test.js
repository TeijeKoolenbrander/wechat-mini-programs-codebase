'use strict';
// Typed clues on the REAL functions + fake database + fake wx-server-sdk (D-2, AC 88-101): what the shared contract suite
// cannot express because it needs the live WeChat API (parameters, every fail-closed outcome, the 2 s timeout), the
// environment guard, the admin function, the sweep alerts and the analytics firewall.
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeBackend, disposeStages, playDay } = require('./helpers/backends');
const { sdk } = require('./helpers/real-backend');

test.after(() => disposeStages());
const LIVE = { ENV_KIND: 'prod', MODERATION_MODE: 'live' };
const real = (o) => makeBackend('real', { ...o, env: { ...LIVE, ...((o && o.env) || {}) } });
const flat = (x) => JSON.stringify(x);
const DAY = 86400e3;
const GOOD = '冬天的被窝';
const PASS = { errCode: 0, errMsg: 'ok', result: { suggest: 'pass', label: 100 }, trace_id: 'TRACE-OK-1' };

async function mk(be, host, i) {
  const r = await be.call(host, 'createRound', { spectrumId: be.content.spectra[i === undefined ? 3 : i].id });
  assert.equal(r.ok, true, flat(r));
  return r;
}
const agree = async (be, u) => assert.equal((await be.call(u, 'agreeRules', { rulesVersion: 1 })).ok, true);
const typed = (be, host, roundId, clueText) => be.call(host, 'setClue', { roundId, clueMode: 'text', clueText });
/** capture console.error lines while fn runs */
async function alerts(fn) {
  const lines = [];
  const orig = console.error;
  console.error = (...a) => lines.push(a.join(' '));
  try {
    await fn();
  } finally {
    console.error = orig;
  }
  return lines;
}
const quiet = async (fn) => {
  const orig = console.warn;
  console.warn = () => {};
  try {
    return await fn();
  } finally {
    console.warn = orig;
  }
};

test('AC 89: live: the game msgSecCheck is called once with version 2, scene 3, the host\'s openid and the NORMALISED clue; the result is stored in clueMod and mod_log (no text on a pass)', async () => {
  const be = real();
  try {
    sdk.state.mod.game = () => PASS;
    await agree(be, 'host-open-1');
    const r = await mk(be, 'host-open-1');
    const res = await typed(be, 'host-open-1', r.roundId, ' 冬 天 的 被 窝 😀');
    assert.deepEqual(res, { ok: true, status: 'open', clueMode: 'text', clueText: GOOD });
    assert.equal(sdk.state.modCalls.length, 1);
    assert.deepEqual(sdk.state.modCalls[0], { api: 'game', params: { openid: 'host-open-1', version: 2, scene: 3, content: GOOD } });
    const doc = await be.roundDoc(r.roundId);
    assert.deepEqual([doc.clueMode, doc.clueText, doc.status], ['text', GOOD, 'open']);
    assert.deepEqual({ ...doc.clueMod, ts: 0 }, { api: 'game', suggest: 'pass', label: 100, traceId: 'TRACE-OK-1', ts: 0 });
    const log = await be.modLog();
    assert.equal(log.length, 1);
    assert.equal(log[0].api, 'game');
    assert.equal(log[0].result, 'pass');
    assert.equal(log[0].traceId, 'TRACE-OK-1');
    assert.equal(log[0].label, 100);
    assert.equal(log[0].openid, 'host-open-1');
    assert.ok(!('text' in log[0]), 'a pass keeps no words');
    assert.equal(typeof log[0].latencyMs, 'number');
    // nothing a client can read has the trace id or the moderation block
    for (const who of ['host-open-1', 'guest']) assert.ok(!/TRACE-OK|"clueMod"|"traceId"/.test(flat(await be.call(who, 'getRound', { roundId: r.roundId }))), who);
    // an identical retry makes no second call
    assert.equal((await typed(be, 'host-open-1', r.roundId, GOOD)).ok, true);
    assert.equal(sdk.state.modCalls.length, 1);
  } finally {
    be.dispose();
  }
});

test('AC 89: app_config.moderation.textApi "general" switches to security.msgSecCheck (same params, `review` blocks without a strike)', async () => {
  const be = real({ appConfig: { moderation: { textApi: 'general' } } });
  try {
    sdk.state.mod.general = (p) => ({ errCode: 0, result: { suggest: p.content === '测试复审' ? 'review' : 'pass', label: 100 }, trace_id: 'G-1' });
    await agree(be, 'h');
    const r = await mk(be, 'h');
    assert.equal((await typed(be, 'h', r.roundId, GOOD)).ok, true);
    assert.deepEqual(sdk.state.modCalls.map((c) => c.api), ['general']);
    assert.deepEqual(sdk.state.modCalls[0].params, { content: GOOD, version: 2, scene: 3, openid: 'h' });
    assert.equal((await be.roundDoc(r.roundId)).clueMod.api, 'general');
    const r2 = await mk(be, 'h');
    const rev = await typed(be, 'h', r2.roundId, '测试复审');
    assert.equal(rev.code, 'TEXT_BLOCKED');
    assert.equal(((await be.playerDoc('h')).strikes || []).length, 0, 'review: no strike');
    assert.equal((await be.roundDoc(r2.roundId)).status, 'draft');
    const log = (await be.modLog()).find((l) => l.result === 'review');
    assert.equal(log.text, '测试复审');
    assert.equal(log.api, 'general');
  } finally {
    be.dispose();
  }
});

test('AC 90: every WeChat outcome fails closed (live game API): only a clean `pass` opens the round; risky strikes; the rest are MODERATION_BUSY with no strike', async () => {
  const be = real();
  try {
    await agree(be, 'host');
    const never = () => new Promise(() => {});
    const cases = [
      // [label, handler, code, strike]
      ['risky', () => ({ errCode: 0, result: { suggest: 'risky', label: 20002 }, trace_id: 'T' }), 'TEXT_BLOCKED', true],
      ['review on the game API (it has none)', () => ({ errCode: 0, result: { suggest: 'review', label: 21000 } }), 'MODERATION_BUSY', false],
      ['thrown error', () => { throw Object.assign(new Error('network'), { errCode: -1 }); }, 'MODERATION_BUSY', false],
      ['rejected promise', () => Promise.reject(new Error('boom')), 'MODERATION_BUSY', false],
      ['non-zero errcode (snake)', () => ({ errcode: 87014, errmsg: 'risky content' }), 'MODERATION_BUSY', false],
      ['non-zero errCode', () => ({ errCode: 40001 }), 'MODERATION_BUSY', false],
      ['quota 750033', () => ({ errCode: 750033, errMsg: 'quota' }), 'MODERATION_BUSY', false],
      ['quota 750032', () => { throw Object.assign(new Error('rate'), { errCode: 750032 }); }, 'MODERATION_BUSY', false],
      ['missing permission', () => { throw Object.assign(new Error('no permission'), { errCode: -604101 }); }, 'MODERATION_BUSY', false],
      ['missing result', () => ({ errCode: 0 }), 'MODERATION_BUSY', false],
      ['empty result', () => ({ errCode: 0, result: {} }), 'MODERATION_BUSY', false],
      ['unknown suggest', () => ({ errCode: 0, result: { suggest: 'maybe' } }), 'MODERATION_BUSY', false],
      ['suggest in the wrong case', () => ({ errCode: 0, result: { suggest: 'Pass' } }), 'MODERATION_BUSY', false],
      ['suggest null', () => ({ errCode: 0, result: { suggest: null } }), 'MODERATION_BUSY', false],
      ['suggest a number', () => ({ errCode: 0, result: { suggest: 1 } }), 'MODERATION_BUSY', false],
      ['empty response', () => null, 'MODERATION_BUSY', false],
      ['undefined response', () => undefined, 'MODERATION_BUSY', false],
      ['string response', () => 'pass', 'MODERATION_BUSY', false],
    ];
    let strikes = 0;
    for (const [label, h, code, strike] of cases) {
      sdk.state.mod.game = h;
      const r = await mk(be, 'host');
      const before = (await be.modLog()).length;
      const res = await quiet(() => typed(be, 'host', r.roundId, '月光糖葫芦'));
      assert.equal(res.ok, false, label);
      assert.equal(res.code, code, label + ' ' + flat(res));
      const doc = await be.roundDoc(r.roundId);
      assert.equal(doc.status, 'draft', label);
      assert.equal(doc.clueText, null, label);
      assert.ok(!doc.clueMod, label);
      assert.equal((await be.call('guest', 'getRound', { roundId: r.roundId })).code, 'ROUND_NOT_FOUND', label);
      const log = (await be.modLog()).slice(before);
      assert.equal(log.length, 1, label + ': one mod_log row');
      assert.equal(log[0].text, '月光糖葫芦', label + ': evidence');
      assert.equal(log[0].result, strike ? 'risky' : 'busy', label);
      if (strike) strikes++;
      assert.equal(((await be.playerDoc('host')).strikes || []).length, strikes, label + ': strikes');
      be.clock.add(2 * DAY); // a restriction after the strike would not matter: the player is never restricted below 2 strikes
    }
  } finally {
    be.dispose();
  }
});

test('AC 90: a 2.1 s WeChat call times out at 2 s: MODERATION_BUSY, nothing stored, no strike; a fast pass afterwards still opens the round', async () => {
  const be = real();
  try {
    await agree(be, 'host');
    sdk.state.mod.game = () => new Promise((resolve) => setTimeout(() => resolve(PASS), 2100));
    const r = await mk(be, 'host');
    const t0 = Date.now ? process.hrtime.bigint() : 0n;
    const res = await quiet(() => typed(be, 'host', r.roundId, GOOD));
    const ms = Number((process.hrtime.bigint() - t0) / 1000000n);
    assert.equal(res.code, 'MODERATION_BUSY');
    assert.ok(ms >= 1900, 'waited for the 2 s timeout, took ' + ms + ' ms');
    assert.equal((await be.roundDoc(r.roundId)).status, 'draft');
    assert.equal(((await be.playerDoc('host')).strikes || []).length, 0);
    const log = await be.modLog();
    assert.equal(log[0].result, 'busy');
    assert.equal(log[0].errCode, 'TIMEOUT');
    // the late answer of the abandoned call changes nothing
    await new Promise((resolve) => setTimeout(resolve, 200));
    assert.equal((await be.roundDoc(r.roundId)).status, 'draft');
    sdk.state.mod.game = () => PASS;
    assert.equal((await typed(be, 'host', r.roundId, GOOD)).ok, true);
  } finally {
    be.dispose();
  }
});

test('AC 90: ENV_KIND=prod with MODERATION_MODE=mock (or an unknown mode) is SERVER_CONFIG on every typed-clue call, with an [ALERT] and no WeChat call; presets and guessing are unaffected', async () => {
  for (const env of [{ ENV_KIND: 'prod', MODERATION_MODE: 'mock' }, { ENV_KIND: undefined, MODERATION_MODE: 'mock' }, { ENV_KIND: 'staging', MODERATION_MODE: 'mock' }, { ENV_KIND: 'dev', MODERATION_MODE: 'sandbox' }]) {
    const be = real({ env });
    try {
      for (const k of Object.keys(env)) if (env[k] === undefined) delete process.env[k];
      await agree(be, 'host');
      const r = await mk(be, 'host');
      const lines = await alerts(async () => {
        const res = await typed(be, 'host', r.roundId, GOOD);
        assert.equal(res.code, 'SERVER_CONFIG', flat(env));
        assert.equal((await typed(be, 'host', r.roundId, '测试违规')).code, 'SERVER_CONFIG', 'mock words are refused too');
        assert.equal((await typed(be, 'host', r.roundId, '七成')).code, 'SERVER_CONFIG', 'even a local rejection: the whole text path is closed');
      });
      assert.ok(lines.some((l) => l.startsWith('[ALERT]')), flat(env) + ' logs an [ALERT]');
      assert.equal(sdk.state.modCalls.length, 0);
      assert.equal((await be.roundDoc(r.roundId)).status, 'draft');
      assert.equal((await be.clue('host', r.roundId)).ok, true, 'presets are unaffected');
      assert.equal((await be.call('g', 'submitGuess', { roundId: r.roundId, pos: 40 })).ok, true);
    } finally {
      be.dispose();
    }
  }
});

test('AC 90: dev + mock works only with ENV_KIND=dev; the mock words decide; the mock never reaches WeChat', async () => {
  const be = real({ env: { ENV_KIND: 'dev', MODERATION_MODE: 'mock' } });
  try {
    await agree(be, 'host');
    const r = await mk(be, 'host');
    assert.equal((await typed(be, 'host', r.roundId, '测试违规')).code, 'TEXT_BLOCKED');
    assert.equal((await typed(be, 'host', r.roundId, '测试繁忙')).code, 'MODERATION_BUSY');
    assert.equal((await typed(be, 'host', r.roundId, GOOD)).ok, true);
    assert.equal(sdk.state.modCalls.length, 0);
    assert.deepEqual((await be.modLog()).map((l) => [l.api, l.result]), [['mock', 'risky'], ['mock', 'busy'], ['mock', 'pass']]);
  } finally {
    be.dispose();
  }
});

test('dev + live: a daily budget (MOD_TEXT_DAILY_BUDGET) protects the pre-publish quota; beyond it MODERATION_BUSY without a call; the next day resets', async () => {
  const be = real({ env: { ENV_KIND: 'dev', MODERATION_MODE: 'live', MOD_TEXT_DAILY_BUDGET: '2' } });
  try {
    await agree(be, 'host');
    const r = await mk(be, 'host');
    assert.equal((await typed(be, 'host', r.roundId, GOOD)).ok, true);
    assert.equal((await typed(be, 'host', r.roundId, '夏天的西瓜')).ok, true);
    assert.equal((await typed(be, 'host', r.roundId, '秋天的落叶')).code, 'MODERATION_BUSY');
    assert.equal(sdk.state.modCalls.length, 2);
    assert.equal((await be.roundDoc(r.roundId)).clueText, '夏天的西瓜');
    assert.equal(be.db.get('kedupan_mod_quota', '20261105').text, 2);
    be.clock.add(DAY);
    const r2 = await mk(be, 'host');
    assert.equal((await typed(be, 'host', r2.roundId, '秋天的落叶')).ok, true);
  } finally {
    be.dispose();
  }
});

test('a concurrent double send of the same clue leaves one consistent clue (both answers ok) and the round open', async () => {
  const be = real();
  try {
    await agree(be, 'host');
    const r = await mk(be, 'host');
    const [a, b] = await Promise.all([typed(be, 'host', r.roundId, GOOD), typed(be, 'host', r.roundId, GOOD)]);
    assert.equal(a.ok && b.ok, true, flat([a, b]));
    const doc = await be.roundDoc(r.roundId);
    assert.deepEqual([doc.status, doc.clueText], ['open', GOOD]);
    // a guess that lands while the check is out wins: the clue is frozen and the late setClue is refused cleanly
    const r2 = await mk(be, 'host');
    let release = null;
    sdk.state.mod.game = () => new Promise((resolve) => { release = () => resolve(PASS); });
    const p = typed(be, 'host', r2.roundId, '夏天的西瓜');
    for (let i = 0; i < 400 && !release; i++) await new Promise((resolve) => setTimeout(resolve, 5)); // wait until the check is really out
    assert.ok(release, 'the WeChat call was reached');
    await be.clue('host', r2.roundId); // a preset opens the round and a guess lands while the check is still out
    await be.call('g1', 'submitGuess', { roundId: r2.roundId, pos: 40 });
    release();
    const late = await p;
    assert.equal(late.code, 'ROUND_EXPIRED');
    const doc2 = await be.roundDoc(r2.roundId);
    assert.equal(doc2.clueMode, 'preset');
    assert.equal(doc2.clueText === '夏天的西瓜', false);
  } finally {
    be.dispose();
  }
});

test('player_stats: the streak and the UGC state live in one document and neither overwrites the other', async () => {
  const be = real();
  try {
    await agree(be, 'u');
    const r = await mk(be, 'u');
    await typed(be, 'u', r.roundId, '测试违规').catch(() => null);
    await playDay(be, 'u', [10, 20, 30, 40, 50]);
    let doc = await be.playerDoc('u');
    assert.equal(doc.curStreak, 1);
    assert.equal(doc.totalDays, 1);
    assert.equal(doc.rulesVersion, 1, 'the daily completion kept the agreement');
    assert.ok(doc.clueChecks && doc.clueChecks.n >= 1);
    be.clock.add(DAY);
    await be.call('u', 'agreeRules', { rulesVersion: 1 });
    doc = await be.playerDoc('u');
    assert.equal(doc.curStreak, 1, 'the agreement kept the streak');
    assert.equal((await be.call('u', 'getArchive', {})).bestStreak, 1);
    // a UGC-only player reads as a zero streak
    await agree(be, 'only-ugc');
    assert.equal((await be.call('only-ugc', 'getArchive', {})).bestStreak, 0);
    assert.deepEqual((await be.call('only-ugc', 'getDaily', {})).myStreak, { current: 0, best: 0 });
  } finally {
    be.dispose();
  }
});

// ---- admin (AC 93) --------------------------------------------------------------------------------------------------------

async function reportedRound(be, host, reporter, text) {
  await agree(be, host);
  const r = await mk(be, host);
  assert.equal((await typed(be, host, r.roundId, text || GOOD)).ok, true);
  assert.equal((await be.call(reporter, 'reportClue', { roundId: r.roundId, reason: 'abuse' })).ok, true);
  return r;
}
const admin = (be, d, openid) => be.call(openid === undefined ? null : openid, 'admin', d);

test('AC 93: admin gating: an OPENID that is not allow-listed is FORBIDDEN (no state change, no audit row); allow-listed openids and the console work; unknown ops are INVALID_INPUT', async () => {
  const be = real({ env: { ADMIN_OPENIDS: 'root-one, root-two' }, limits: true });
  try {
    const r = await reportedRound(be, 'host', 'rep');
    for (const who of ['host', 'rep', 'rando', 'root', 'root-on']) {
      const res = await admin(be, { op: 'hideClue', roundId: r.roundId }, who);
      assert.deepEqual([res.ok, res.code], [false, 'FORBIDDEN'], who);
    }
    assert.equal((await be.auditLog()).length, 0);
    assert.equal((await be.roundDoc(r.roundId)).clueHidden, true, 'untouched (the report hid it)');
    const ok = await admin(be, { op: 'listReports' }, 'root-two');
    assert.equal(ok.ok, true, flat(ok));
    assert.equal((await admin(be, { op: 'listReports' })).ok, true, 'console: no OPENID');
    for (const bad of [{}, { op: 5 }, { op: 'dropEverything' }, { op: '__proto__' }, { op: 'constructor' }, { op: 'toString' }]) assert.equal((await admin(be, bad)).code, 'INVALID_INPUT', flat(bad));
    // the allow-listed openid is rate limited at 60 a minute
    let last;
    for (let i = 0; i < 61; i++) last = await admin(be, { op: 'listReports' }, 'root-one');
    assert.equal(last.code, 'RATE_LIMITED');
    // the console carries no OPENID and is never limited
    for (let i = 0; i < 70; i++) assert.equal((await admin(be, { op: 'listReports' })).ok, true);
  } finally {
    be.dispose();
  }
});

test('AC 93: admin ops: listReports / getRound / sample show the text and the host openid, never a reporter; every op writes one audit row', async () => {
  const be = real({ env: { ADMIN_OPENIDS: 'root' } });
  try {
    const r = await reportedRound(be, 'host-secret-id', 'reporter-secret-id');
    const r2 = await openTypedFor(be, 'host-b', '夏天的西瓜');
    await be.call('other-reporter', 'reportClue', { roundId: r.roundId, reason: 'porn' });
    be.clock.add(60000);
    const list = await admin(be, { op: 'listReports', state: 'open', limit: 10 });
    assert.equal(list.items.length, 2);
    assert.equal(list.items[0].roundId, r.roundId);
    assert.equal(list.items[0].clue.text, GOOD, 'the admin sees the text of a hidden clue');
    assert.equal(list.items[0].clue.hidden, true);
    assert.equal(list.items[0].clue.hiddenBy, 'report');
    assert.ok(list.items[0].ageMs >= 60000);
    assert.ok(!/reporter-secret-id|other-reporter/.test(flat(list)), 'the reporter is never shown');
    assert.ok(!flat(list).includes('host-secret-id'), 'listReports does not name the host');
    assert.equal((await admin(be, { op: 'listReports', limit: 0 })).code, 'INVALID_INPUT');
    assert.equal((await admin(be, { op: 'listReports', limit: 51 })).code, 'INVALID_INPUT');
    const g = await admin(be, { op: 'getRound', roundId: r.roundId });
    assert.equal(g.round.hostOpenid, 'host-secret-id', 'the only place a host openid is shown');
    assert.equal(g.round.clue.mod.api, 'game');
    assert.equal(g.round.reports.length, 2);
    assert.ok(!/reporter-secret-id|other-reporter/.test(flat(g)));
    assert.equal(g.round.host.strikes30d, 0);
    assert.equal((await admin(be, { op: 'getRound', roundId: 'AAAAAAAA' })).code, 'ROUND_NOT_FOUND');
    assert.equal((await admin(be, { op: 'getRound', roundId: 'x' })).code, 'INVALID_INPUT');
    const s = await admin(be, { op: 'sample', n: 5 });
    assert.deepEqual(s.items.map((x) => x.text), ['夏天的西瓜'], 'only shown typed clues of the last 24 h');
    assert.equal(s.items[0].roundId, r2.roundId);
    assert.equal((await admin(be, { op: 'sample', n: 0 })).code, 'INVALID_INPUT');
    be.clock.add(25 * 3600e3);
    assert.equal((await admin(be, { op: 'sample' })).items.length, 0, 'older than 24 h');
    // reads write no audit row; the writes below write exactly one each
    assert.equal((await be.auditLog()).length, 0);
    let n = 0;
    for (const d of [{ op: 'hideClue', roundId: r2.roundId }, { op: 'restoreClue', roundId: r2.roundId }, { op: 'dismissReport', roundId: r2.roundId, restore: true }, { op: 'setModeration', textApi: 'general' }, { op: 'setUgc', viewEnabled: true }]) {
      const res = await admin(be, d);
      assert.equal(res.ok, true, flat(d) + flat(res));
      n++;
      const log = await be.auditLog();
      assert.equal(log.length, n, d.op);
      assert.equal(log[n - 1].op, d.op);
      assert.equal(log[n - 1].by, 'console');
      assert.equal(typeof log[n - 1].ts, 'number');
      assert.ok(!/冬天|夏天/.test(flat(log[n - 1])), 'the audit trail holds no clue text');
    }
    const viaOpenid = await admin(be, { op: 'hideClue', roundId: r2.roundId }, 'root');
    assert.equal(viaOpenid.ok, true);
    assert.equal((await be.auditLog()).pop().by, 'console/root');
  } finally {
    be.dispose();
  }
});

async function openTypedFor(be, host, text) {
  await agree(be, host);
  const r = await mk(be, host, 4);
  assert.equal((await typed(be, host, r.roundId, text)).ok, true);
  return r;
}

test('AC 91/92/93: upholdReport hides, upholds every report and adds ONE strike to the host (once per round); dismissReport {restore:true} shows the clue again, without restore it stays hidden', async () => {
  const be = real();
  try {
    const r = await reportedRound(be, 'host', 'rep1');
    await be.call('rep2', 'reportClue', { roundId: r.roundId, reason: 'ads' });
    const up = await admin(be, { op: 'upholdReport', roundId: r.roundId });
    assert.deepEqual([up.ok, up.strikes30d, up.reports], [true, 1, 2]);
    assert.deepEqual((await be.clueReports()).map((x) => x.state), ['upheld', 'upheld']);
    assert.equal((await be.roundDoc(r.roundId)).clueHidden, true);
    let host = await be.playerDoc('host');
    assert.equal(host.strikes.length, 1);
    assert.equal(host.warnPending, true);
    assert.deepEqual((await admin(be, { op: 'upholdReport', roundId: r.roundId })).already, true);
    assert.equal((await be.playerDoc('host')).strikes.length, 1, 'no second strike for the same round');
    assert.equal((await admin(be, { op: 'upholdReport', roundId: 'AAAAAAAA' })).code, 'ROUND_NOT_FOUND');
    // strike events carry cause upheld and no player
    const ev = (await be.allEvents()).filter((e) => e.name === 'strike');
    assert.deepEqual(ev.map((e) => [e.openid, e.props]), [['server', { cause: 'upheld', strikes30d: 1 }]]);
    // an upheld report that reaches strike 2 restricts for 24 h
    const r2 = await reportedRound(be, 'host', 'rep3', '夏天的西瓜');
    const up2 = await admin(be, { op: 'upholdReport', roundId: r2.roundId });
    assert.equal(up2.strikes30d, 2);
    assert.equal(up2.restrictedUntil, be.clock.now() + 24 * 3600e3);
    assert.equal((await typed(be, 'host', (await mk(be, 'host')).roundId, GOOD)).code, 'RESTRICTED');
    // dismiss: restore shows it again; no restore keeps it hidden
    const r3 = await reportedRound(be, 'host3', 'rep4', '秋天的落叶');
    const d1 = await admin(be, { op: 'dismissReport', roundId: r3.roundId });
    assert.equal(d1.restored, false);
    assert.equal((await be.call('g', 'getRound', { roundId: r3.roundId })).clue.state, 'hidden');
    assert.equal((await be.clueReports()).find((x) => x.roundId === r3.roundId).state, 'dismissed');
    const d2 = await admin(be, { op: 'dismissReport', roundId: r3.roundId, restore: true });
    assert.equal(d2.restored, true);
    const seen = await be.call('g', 'getRound', { roundId: r3.roundId });
    assert.deepEqual(seen.clue, { mode: 'text', text: '秋天的落叶', hidden: false, state: 'shown' });
    assert.equal(seen.me.canReport, true);
    assert.equal((await be.call('rep4', 'getRound', { roundId: r3.roundId })).me.canReport, false, 'the reporter already reported');
    assert.equal(((await be.playerDoc('host3')).strikes || []).length, 0, 'dismissed: no strike');
    assert.equal((await admin(be, { op: 'dismissReport', roundId: r3.roundId, restore: 'yes' })).code, 'INVALID_INPUT');
  } finally {
    be.dispose();
  }
});

test('AC 93: hideClue / restoreClue / deleteClue: delete removes the text from the round for good and keeps the mod_log evidence', async () => {
  const be = real();
  try {
    const r = await openTypedFor(be, 'host', GOOD);
    assert.equal((await admin(be, { op: 'hideClue', roundId: r.roundId })).changed, true);
    assert.equal((await admin(be, { op: 'hideClue', roundId: r.roundId })).changed, false, 'idempotent');
    assert.equal((await be.call('g', 'getRound', { roundId: r.roundId })).clue.state, 'hidden');
    assert.equal((await be.call('g', 'reportClue', { roundId: r.roundId, reason: 'porn' })).code, 'INVALID_INPUT', 'an admin-hidden clue is not reportable');
    assert.equal((await admin(be, { op: 'restoreClue', roundId: r.roundId })).restored, true);
    assert.equal((await be.call('g', 'getRound', { roundId: r.roundId })).clue.text, GOOD);
    const logs = (await be.modLog()).length;
    assert.equal((await admin(be, { op: 'deleteClue', roundId: r.roundId })).deleted, true);
    const doc = await be.roundDoc(r.roundId);
    assert.equal(doc.clueText, null);
    assert.ok(!flat(doc).includes('冬天'));
    assert.equal((await be.modLog()).length, logs, 'mod_log evidence stays');
    const g = await be.call('g', 'getRound', { roundId: r.roundId });
    assert.deepEqual(g.clue, { mode: 'text', text: null, hidden: true, state: 'hidden' });
    const back = await admin(be, { op: 'restoreClue', roundId: r.roundId });
    assert.deepEqual([back.restored, back.reason], [false, 'deleted']);
    assert.ok(!flat(await be.auditLog()).includes('冬天'));
    // a preset round has nothing to hide
    const pr = await mk(be, 'host-p');
    await be.clue('host-p', pr.roundId);
    for (const op of ['hideClue', 'restoreClue', 'deleteClue']) assert.equal((await admin(be, { op, roundId: pr.roundId })).code, 'INVALID_INPUT', op);
  } finally {
    be.dispose();
  }
});

test('AC 92/93: admin restrict / liftRestriction (days or permanent), never creating a player by typo; reviewFlag after four strikes', async () => {
  const be = real();
  try {
    await agree(be, 'offender');
    assert.equal((await admin(be, { op: 'restrict', openid: 'nobody-at-all', days: 3 })).code, 'INVALID_INPUT');
    assert.equal(be.db.get('kedupan_player_stats', 'nobody-at-all'), undefined);
    for (const bad of [{ days: 0 }, { days: 3651 }, { days: 1.5 }, {}, { days: '3' }, { openid: 'x', days: 3 }]) assert.equal((await admin(be, { op: 'restrict', openid: 'offender', ...bad })).code, 'INVALID_INPUT', flat(bad));
    const res = await admin(be, { op: 'restrict', openid: 'offender', days: 3 });
    assert.equal(res.restrictedUntil, be.clock.now() + 3 * DAY);
    const r = await mk(be, 'offender');
    assert.deepEqual(r.ugc.restriction, { until: be.clock.now() + 3 * DAY, permanent: false });
    assert.equal((await typed(be, 'offender', r.roundId, GOOD)).code, 'RESTRICTED');
    assert.equal((await admin(be, { op: 'restrict', openid: 'offender', permanent: true })).permanent, true);
    be.clock.add(400 * DAY);
    const rp = await mk(be, 'offender');
    assert.equal(rp.ugc.restriction.permanent, true);
    assert.equal((await typed(be, 'offender', rp.roundId, GOOD)).permanent, true);
    assert.equal((await admin(be, { op: 'liftRestriction', openid: 'offender' })).lifted, true);
    assert.equal((await mk(be, 'offender')).ugc.restriction, null);
    assert.equal((await typed(be, 'offender', (await mk(be, 'offender')).roundId, GOOD)).ok, true);
    assert.equal((await admin(be, { op: 'liftRestriction', openid: 'nobody-at-all' })).code, 'INVALID_INPUT');
    assert.deepEqual((await be.auditLog()).map((a) => a.op), ['restrict', 'restrict', 'liftRestriction']);
  } finally {
    be.dispose();
  }
});

test('AC 94: setUgc kill switches take effect at once and are audited; viewEnabled false pauses every typed clue; setModeration switches the API', async () => {
  const be = real();
  try {
    const r = await openTypedFor(be, 'host', GOOD);
    const res = await admin(be, { op: 'setUgc', viewEnabled: false });
    assert.equal(res.ugc.viewEnabled, false);
    assert.equal(res.ugc.createEnabled, true);
    assert.equal((await be.call('g', 'getRound', { roundId: r.roundId })).clue.state, 'paused');
    const ev = (await be.allEvents()).find((e) => e.name === 'ugc_pause');
    assert.deepEqual([ev.openid, ev.props], ['server', { createEnabled: true, viewEnabled: false }]);
    await admin(be, { op: 'setUgc', createEnabled: false, viewEnabled: true });
    assert.equal((await mk(be, 'host')).ugc.createEnabled, false);
    assert.equal((await typed(be, 'host', (await mk(be, 'host')).roundId, '夏天的西瓜')).code, 'UGC_PAUSED');
    assert.equal((await be.call('g', 'getRound', { roundId: r.roundId })).clue.text, GOOD);
    for (const bad of [{}, { createEnabled: 'no' }, { viewEnabled: 1 }]) assert.equal((await admin(be, { op: 'setUgc', ...bad })).code, 'INVALID_INPUT', flat(bad));
    assert.equal((await admin(be, { op: 'setModeration', textApi: 'weird' })).code, 'INVALID_INPUT');
    assert.equal((await admin(be, { op: 'setModeration', textApi: 'general' })).moderation.textApi, 'general');
    assert.equal(be.db.get('kedupan_app_config', 'live').moderation.textApi, 'general');
    assert.equal((await be.auditLog()).length, 3);
  } finally {
    be.dispose();
  }
});

// ---- watchdogs, retention and the analytics firewall ---------------------------------------------------------------------

test('sweepRounds: [ALERT] for a report open > 48 h and for a high busy rate; alert only, nothing is paused', async () => {
  const be = real();
  try {
    sdk.state.mod.game = () => PASS;
    const r = await reportedRound(be, 'host', 'rep');
    let out;
    let lines = await alerts(async () => {
      out = await be.timer('sweepRounds');
    });
    assert.deepEqual(out.alerts, { staleReports: 0, busy: false });
    assert.ok(!lines.some((l) => l.includes('[ALERT]')));
    be.clock.add(49 * 3600e3);
    lines = await alerts(async () => {
      out = await be.timer('sweepRounds');
    });
    assert.equal(out.alerts.staleReports, 1);
    assert.ok(lines.some((l) => l.startsWith('[ALERT] clue report open > 48 h')), lines.join('|'));
    await admin(be, { op: 'dismissReport', roundId: r.roundId });
    lines = await alerts(async () => {
      out = await be.timer('sweepRounds');
    });
    assert.equal(out.alerts.staleReports, 0, 'resolved reports stop alerting');
    // busy: 12 busy of 20 checks in the last hour
    sdk.state.mod.game = (p) => (p.content === '测试繁忙' ? null : PASS);
    const r2 = await mk(be, 'host');
    const fresh = ['夏天的西瓜', '秋天的落叶', '春天的细雨', '冬天的暖炉', '清晨的露珠', '午后的阳光', '傍晚的炊烟', '深夜的星空']; // distinct: an identical retry makes no check
    for (let i = 0; i < 20; i++) await quiet(() => typed(be, 'host', r2.roundId, i < 12 ? '测试繁忙' : fresh[i - 12]));
    lines = await alerts(async () => {
      out = await be.timer('sweepRounds');
    });
    assert.equal(out.alerts.busy, true);
    assert.ok(lines.some((l) => l.startsWith('[ALERT] moderation busy')), lines.join('|'));
    assert.equal((await mk(be, 'host')).ugc.createEnabled, true, 'alert only: typed clues are not paused automatically');
    // an hour later the window is clean again
    be.clock.add(2 * 3600e3);
    lines = await alerts(async () => {
      out = await be.timer('sweepRounds');
    });
    assert.equal(out.alerts.busy, false);
  } finally {
    be.dispose();
  }
});

test('cleanup (AC 67/101): clue_reports, mod_log, mod_quota and audit_log go at exactly 180 days; strikes and the rules record go with a stale player_stats', async () => {
  const be = real();
  try {
    const T = be.clock.now();
    const old = T - 180 * DAY - 1;
    const young = T - 180 * DAY + 1000;
    for (const [col, id] of [['clue_reports', 'a'], ['mod_log', 'b'], ['mod_quota', 'c'], ['audit_log', 'd']]) {
      be.db.put('kedupan_' + col, { _id: id + '-old', ts: old });
      be.db.put('kedupan_' + col, { _id: id + '-young', ts: young });
    }
    be.db.put('kedupan_player_stats', { _id: 'stale', rulesVersion: 1, strikes: [old], updatedAt: old });
    be.db.put('kedupan_player_stats', { _id: 'fresh', rulesVersion: 1, strikes: [young], updatedAt: young });
    const out = await be.timer('cleanup');
    assert.equal(out.ok, true);
    for (const col of ['clue_reports', 'mod_log', 'mod_quota', 'audit_log']) {
      assert.deepEqual(be.db.all('kedupan_' + col).map((d) => d._id).sort(), [{ clue_reports: 'a', mod_log: 'b', mod_quota: 'c', audit_log: 'd' }[col] + '-young'], col);
      assert.equal(out.removed[col], 1, col);
    }
    assert.equal(be.db.get('kedupan_player_stats', 'stale'), undefined);
    assert.ok(be.db.get('kedupan_player_stats', 'fresh'));
    // idempotent
    assert.equal((await be.timer('cleanup')).ok, true);
  } finally {
    be.dispose();
  }
});

test('AC 95: track enforces the firewall: a hostile client cannot store a clue, a fragment, the blocked text or a trace id in any event; server-only events cannot be written by a client', async () => {
  const be = real();
  try {
    const CLUE = '月光糖葫芦';
    await agree(be, 'host');
    const r = await mk(be, 'host');
    sdk.state.mod.game = () => PASS;
    assert.equal((await typed(be, 'host', r.roundId, CLUE)).ok, true);
    const all = {};
    for (const k of ['roundId', 'clueMode', 'presetSwaps', 'chars', 'tabSwitches', 'tab', 'via', 'result', 'reason', 'label', 'text', 'clueText', 'errCode', 'code', 'where', 'state', 'source', 'api', 'suggest', 'cause', 'latencyMs', 'strikes30d']) all[k] = CLUE;
    const names = ['round_clue', 'clue_tab', 'clue_result', 'rules_view', 'rules_agree', 'clue_report', 'daily_card_reveal', 'error', 'clue_check', 'strike', 'restrict', 'ugc_pause', 'subscribe_send', 'round_reveal'];
    const evs = names.map((name, i) => ({ name, props: all, clientTs: 5 + i, text: CLUE }));
    evs.push({ name: CLUE, props: all });
    evs.push({ name: 'round_clue', props: { roundId: r.roundId, clueMode: 'text', presetSwaps: 0, chars: 5, tabSwitches: 0, text: CLUE } });
    const before = be.db.size('kedupan_events');
    const res = await be.call('g', 'track', { sessionId: 's-1', events: evs });
    assert.equal(res.ok, true);
    const rows = be.db.all('kedupan_events').slice(before);
    const blob = flat(rows);
    for (const s of [CLUE, '月光', '糖葫', '葫芦']) assert.ok(!blob.includes(s), 'stored: ' + s);
    assert.ok(!rows.some((x) => ['clue_check', 'strike', 'restrict', 'ugc_pause', 'subscribe_send', 'round_reveal'].includes(x.name)), 'server-only events are dropped from a client batch');
    const good = rows.find((x) => x.name === 'round_clue' && x.props.chars === 5);
    assert.deepEqual(good.props, { roundId: r.roundId, clueMode: 'text', presetSwaps: 0, chars: 5, tabSwitches: 0 });
    // the clue sits only in the round
    const stored = [];
    for (const name of be.db.names()) for (const d of be.db.all(name)) if (flat(d).includes(CLUE)) stored.push(name);
    assert.deepEqual(stored, ['kedupan_rounds'], 'the clue text lives in rounds only (a pass is not logged with its words)');
  } finally {
    be.dispose();
  }
});

test('AC 49: a scripted session (daily, group, round with a typed clue, guess, report, reveal): no response contains a test openid, the host\'s or reporter\'s id, a trace id or a moderation field', async () => {
  const be = real();
  try {
    sdk.state.mod.game = () => PASS;
    const ids = { host: 'openid-HOST-aaaaaaaa', guest: 'openid-GUEST-bbbbbbbb', rep: 'openid-REP-cccccccc' };
    const seen = [];
    const call = async (who, name, data) => {
      const r = await be.call(ids[who], name, data);
      seen.push([name, r]);
      return r;
    };
    await call('host', 'agreeRules', { rulesVersion: 1 });
    const r = await call('host', 'createRound', { spectrumId: be.content.spectra[3].id });
    await call('host', 'setClue', { roundId: r.roundId, clueMode: 'text', clueText: GOOD });
    for (const who of ['host', 'guest', 'rep']) await call(who, 'getRound', { roundId: r.roundId });
    await call('rep', 'reportClue', { roundId: r.roundId, reason: 'other' });
    await call('rep', 'reportClue', { roundId: r.roundId, reason: 'other' }); // DUP_REPORT
    await call('guest', 'submitGuess', { roundId: r.roundId, pos: 30 });
    await call('rep', 'submitGuess', { roundId: r.roundId, pos: 60 });
    await call('host', 'revealRound', { roundId: r.roundId });
    for (const who of ['host', 'guest', 'rep']) await call(who, 'getRound', { roundId: r.roundId });
    const text = flat(seen.filter(([name]) => name !== 'createRound' || true).map(([name, resp]) => (name === 'createRound' ? { ...resp, target: undefined } : resp)));
    for (const id of Object.values(ids)) assert.ok(!text.includes(id), 'a response contains ' + id);
    for (const k of ['"openid"', '"hostOpenid"', '"clueMod"', 'traceId', 'TRACE', 'mod_log', 'clue_reports', 'mock-']) assert.ok(!text.includes(k), 'a response contains ' + k);
  } finally {
    be.dispose();
  }
});
