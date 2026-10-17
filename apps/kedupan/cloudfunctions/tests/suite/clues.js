'use strict';
// Typed clues (D-2): AC 83-101, server side. Runs against the mock server AND the real cloud functions, so the two are
// provably the same contract. WeChat is the MOCK words here (测试违规 risky, 测试复审 review, 测试繁忙 error, else pass);
// the real functions' live-API behaviour (parameters, timeouts, unknown answers) is in clues-real.test.js.
const assert = require('node:assert/strict');
const C = require('../../../game/core/clue');

const flat = (x) => JSON.stringify(x);
const T1 = '20261105';
const GOOD = '冬天的被窝';
const DAY = 86400e3;
const HOUR = 3600e3;

module.exports = function clues(T) {
  const { test } = T;

  async function agree(be, u) {
    const r = await be.call(u, 'agreeRules', { rulesVersion: 1 });
    assert.equal(r.ok, true, flat(r));
  }
  async function mkRound(be, host, i) {
    const sp = be.content.spectra[i === undefined ? 3 : i];
    const r = await be.call(host, 'createRound', { spectrumId: sp.id });
    assert.equal(r.ok, true, flat(r));
    return { ...r, sp };
  }
  const typed = (be, host, roundId, clueText) => be.call(host, 'setClue', { roundId, clueMode: 'text', clueText });
  async function openTyped(be, host, text, i) {
    await agree(be, host);
    const r = await mkRound(be, host, i);
    const c = await typed(be, host, r.roundId, text || GOOD);
    assert.equal(c.ok, true, flat(c));
    return r;
  }

  test('AC 85: agreeRules: version must be 1, idempotent, the agreement is server-side and shown as me.rulesAgreed; createRound carries the ugc state', async (be) => {
    const r0 = await mkRound(be, 'host');
    assert.deepEqual(r0.ugc, { createEnabled: true, rulesVersion: null, rulesRequiredVersion: 1, rulesAgreed: false, restriction: null, warnPending: false });
    for (const bad of [{}, { rulesVersion: 0 }, { rulesVersion: 2 }, { rulesVersion: '1' }, { version: 3 }]) assert.equal((await be.call('host', 'agreeRules', bad)).code, 'INVALID_INPUT', flat(bad));
    assert.equal((await typed(be, 'host', r0.roundId, GOOD)).code, 'RULES_REQUIRED');
    assert.equal((await be.call('host', 'getRound', { roundId: r0.roundId })).me.rulesAgreed, false);
    const a = await be.call('host', 'agreeRules', { rulesVersion: 1 });
    assert.equal(a.ok, true);
    assert.equal(a.rulesVersion, 1);
    assert.equal((await be.call('host', 'agreeRules', { version: 1 })).ok, true, 'the spec spelling and a repeat are fine');
    const doc = await be.playerDoc('host');
    assert.equal(doc.rulesVersion, 1);
    const at = doc.rulesAt;
    be.clock.add(5000);
    await be.call('host', 'agreeRules', { rulesVersion: 1 });
    assert.equal((await be.playerDoc('host')).rulesAt, at, 'the first agreement time stays');
    assert.equal((await be.call('host', 'getRound', { roundId: r0.roundId })).me.rulesAgreed, true);
    assert.equal((await mkRound(be, 'host')).ugc.rulesVersion, 1);
    assert.equal((await mkRound(be, 'other')).ugc.rulesAgreed, false, 'per player');
    // the agreement does not wipe, and is not wiped by, the streak state
    await be.call('host', 'getDaily', {});
    assert.equal((await be.playerDoc('host')).rulesVersion, 1);
  });

  test('AC 87/88: server re-check: every local rejection is TEXT_REJECTED + the same reason, writes nothing, calls WeChat never, costs no strike and no check', async (be) => {
    await agree(be, 'host');
    const r = await mkRound(be, 'host', 3); // 早饭 ↔ 夜宵
    const fix = [
      ['春夏秋冬春夏秋冬春夏秋冬春', 'length'], ['', 'empty'], ['   ', 'empty'],
      ['70', 'digit'], ['５', 'digit'], ['①', 'digit'], ['七十多', 'digit'], ['七成', 'digit'], ['三格', 'digit'], ['〇', 'digit'],
      ['左边一点', 'position'], ['中间', 'position'], ['偏甜', 'position'], ['50%', 'position'],
      ['很夜宵', 'endLabel'], ['早饭吃撑', 'endLabel'],
      ['coffee', 'charset'], ['wx', 'charset'],
      ['加我微信', 'blocked'], ['傻逼', 'blocked'],
    ];
    for (const [text, reason] of fix) {
      const res = await typed(be, 'host', r.roundId, text);
      assert.equal(res.ok, false, text);
      assert.equal(res.code, 'TEXT_REJECTED', text + ' ' + flat(res));
      assert.equal(res.reason, reason, text);
    }
    assert.equal((await be.modLog()).length, 0, 'no WeChat call, no log row');
    const doc = await be.playerDoc('host');
    assert.ok(!doc.strikes || doc.strikes.length === 0, 'no strike');
    assert.ok(!doc.clueChecks, 'local rejections do not count towards the 50 a day');
    const host = await be.call('host', 'getRound', { roundId: r.roundId });
    assert.equal(host.status, 'draft');
    assert.equal(host.clue.mode, null);
    assert.ok(!flat(await be.roundDoc(r.roundId)).includes('clueText":"'), 'nothing written to the round');
    // the labels used are the ROUND'S: client-supplied labels change nothing, and the same words pass on another spectrum
    const sneaky = await be.call('host', 'setClue', { roundId: r.roundId, clueMode: 'text', clueText: '很夜宵', leftLabel: 'x', rightLabel: 'y', labels: { leftLabel: 'x' } });
    assert.equal(sneaky.reason, 'endLabel');
    const other = await mkRound(be, 'host', 5);
    assert.equal((await typed(be, 'host', other.roundId, '很夜宵')).ok, true);
  });

  test('AC 87: the allowed near-misses pass the server too (一杯奶茶, 一分钱, 分钟, 分享, 千层饼, 十字路口, 零食, 外婆家的饭)', async (be) => {
    await agree(be, 'host');
    for (const text of ['一杯奶茶', '一分钱', '分钟', '分享', '千层饼', '十字路口', '零食', '外婆家的饭']) {
      const r = await mkRound(be, 'host', 3);
      const res = await typed(be, 'host', r.roundId, text);
      assert.equal(res.ok, true, text + ' ' + flat(res));
      assert.equal(res.clueText, text);
    }
  });

  test('AC 89: a passed clue is stored, the round opens, a guest sees it and may report it, the host may not; spaces and emoji are stripped', async (be) => {
    const host = 'host-openid-xyz';
    await agree(be, host);
    const r = await mkRound(be, host);
    // not visible to anyone else, and not at all before it passed
    const res = await typed(be, host, r.roundId, ' 冬天 的被窝😀 ');
    assert.deepEqual(res, { ok: true, status: 'open', clueMode: 'text', clueText: GOOD });
    const g = await be.call('guest', 'getRound', { roundId: r.roundId });
    assert.equal(g.status, 'open');
    assert.deepEqual(g.clue, { mode: 'text', text: GOOD, hidden: false, state: 'shown' });
    assert.equal(g.clueText, GOOD, 'legacy top-level fields carry the same');
    assert.equal(g.clueMode, 'text');
    assert.deepEqual(g.me, { canReport: true, rulesAgreed: false, restriction: null, strikeNotice: false });
    const h = await be.call(host, 'getRound', { roundId: r.roundId });
    assert.equal(h.me.canReport, false, 'never the host');
    assert.equal(h.me.rulesAgreed, true);
    assert.equal(h.clue.text, GOOD);
    // AC 49: no host openid, no moderation block, no trace id in what a guest gets
    assert.ok(!flat(g).includes(host), 'no host openid');
    for (const k of ['"clueMod"', 'traceId', 'hostOpenid', 'mod_log', 'openid']) assert.ok(!flat(g).includes(k), k);
    assert.ok(!flat(g).includes('mock-'), 'no mock trace id');
    // stored: text mode, text, moderation block (server side only), the round is open
    const doc = await be.roundDoc(r.roundId);
    assert.deepEqual([doc.status, doc.clueMode, doc.clueText, doc.clueItemId], ['open', 'text', GOOD, null]);
    assert.equal(doc.clueMod.suggest, 'pass');
    assert.equal(doc.clueMod.api, 'mock', 'the test rig runs the mock words (dev only)');
    // a guess and the reveal carry no clue text beyond the clue field
    await be.call('g1', 'submitGuess', { roundId: r.roundId, pos: 30 });
    await be.call('g2', 'submitGuess', { roundId: r.roundId, pos: 50 });
    const rv = await be.call(host, 'revealRound', { roundId: r.roundId });
    assert.ok(!flat(rv).includes('冬天'), 'revealRound carries no clue text');
    const g2 = await be.call('g1', 'getRound', { roundId: r.roundId });
    assert.equal(g2.clue.text, GOOD, 'still shown at the reveal');
    assert.equal(g2.status, 'revealed');
  });

  test('AC 90: fail closed: risky -> TEXT_BLOCKED + strike; review (game API) and error -> MODERATION_BUSY; the round stays a draft, nobody else can see it, one log row with the text', async (be) => {
    await agree(be, 'host');
    const cases = [['测试违规', 'TEXT_BLOCKED', 'risky'], ['测试复审', 'MODERATION_BUSY', 'busy'], ['测试繁忙', 'MODERATION_BUSY', 'busy']];
    let strikes = 0;
    for (const [text, code, result] of cases) {
      const r = await mkRound(be, 'host');
      const before = (await be.modLog()).length;
      const res = await typed(be, 'host', r.roundId, text);
      assert.equal(res.ok, false, text);
      assert.equal(res.code, code, text);
      assert.equal((await be.roundDoc(r.roundId)).status, 'draft', text);
      assert.equal((await be.roundDoc(r.roundId)).clueText, null, text);
      assert.equal((await be.call('guest', 'getRound', { roundId: r.roundId })).code, 'ROUND_NOT_FOUND', 'a draft is nobody else\'s');
      const log = (await be.modLog()).slice(before);
      assert.equal(log.length, 1, 'one mod_log row per check');
      assert.equal(log[0].result, result);
      assert.equal(log[0].text, text, 'the text of a non-pass result is the evidence');
      assert.equal(log[0].openid, 'host');
      if (code === 'TEXT_BLOCKED') strikes++;
      const doc = await be.playerDoc('host');
      assert.equal((doc.strikes || []).length, strikes, text + ' strikes');
      be.clock.add(2 * DAY); // lets a restriction (after the first risky there is none, but keep rounds fresh)
    }
    // the general API: review blocks WITHOUT a strike
    await be.setAppConfig({ moderation: { textApi: 'general' } });
    be.clock.add(40 * DAY);
    const r = await mkRound(be, 'host');
    const rev = await typed(be, 'host', r.roundId, '测试复审');
    assert.equal(rev.code, 'TEXT_BLOCKED');
    assert.equal(((await be.playerDoc('host')).strikes || []).filter((t) => t > be.clock.now() - 30 * DAY).length, 0, 'review adds no strike (old ones aged out)');
    // and pass on an earlier-blocked round later still works: the round was never poisoned
    assert.equal((await typed(be, 'host', r.roundId, GOOD)).ok, true);
  });

  test('AC 98: an identical retry is ok without a second check; a different text replaces the clue; a non-pass keeps the earlier clue', async (be) => {
    const r = await openTyped(be, 'host', GOOD);
    const n1 = (await be.modLog()).length;
    assert.equal(n1, 1);
    const again = await typed(be, 'host', r.roundId, GOOD);
    assert.deepEqual(again, { ok: true, status: 'open', clueMode: 'text', clueText: GOOD });
    assert.equal((await typed(be, 'host', r.roundId, ' 冬 天 的 被 窝 ')).ok, true, 'normalised first');
    assert.equal((await be.modLog()).length, n1, 'no second WeChat call');
    assert.equal(((await be.playerDoc('host')).clueChecks || {}).n, 1, 'the retry did not count');
    // a different clue replaces it while there is no guess
    assert.equal((await typed(be, 'host', r.roundId, '夏天的西瓜')).ok, true);
    assert.equal((await be.call('g1', 'getRound', { roundId: r.roundId })).clue.text, '夏天的西瓜');
    // a blocked replacement leaves the earlier clue in place
    assert.equal((await typed(be, 'host', r.roundId, '测试违规')).code, 'TEXT_BLOCKED');
    assert.equal((await be.call('g1', 'getRound', { roundId: r.roundId })).clue.text, '夏天的西瓜');
    assert.equal((await be.roundDoc(r.roundId)).status, 'open');
    // a preset can replace it too (the tab the host sends from wins)
    const item = be.content.spectrumById[(await be.roundDoc(r.roundId)).spectrumId].items[0];
    assert.equal((await be.call('host', 'setClue', { roundId: r.roundId, clueMode: 'preset', clueItemId: item.id })).clueMode, 'preset');
    assert.deepEqual((await be.call('g1', 'getRound', { roundId: r.roundId })).clue, { mode: 'preset', text: item.text, hidden: false, state: 'shown' });
    // after the first guess nothing changes any more
    await be.call('g1', 'submitGuess', { roundId: r.roundId, pos: 40 });
    assert.equal((await typed(be, 'host', r.roundId, '秋天的落叶')).code, 'ROUND_EXPIRED');
    assert.equal((await typed(be, 'stranger', r.roundId, '秋天的落叶')).code, 'NOT_HOST');
    assert.equal((await typed(be, 'host', 'AAAAAAAA', '秋天的落叶')).code, 'ROUND_NOT_FOUND');
  });

  test('AC 28: setClue input: chat is gone, text needs a string, a preset ignores clueText, bad ids are INVALID_INPUT', async (be) => {
    await agree(be, 'host');
    const r = await mkRound(be, 'host');
    for (const bad of [{ clueMode: 'chat' }, { clueMode: 'text' }, { clueMode: 'text', clueText: 5 }, { clueMode: 'text', clueText: null }, { clueMode: 'text', clueText: {} }, { clueMode: 'x', clueText: GOOD }, {}]) {
      assert.equal((await be.call('host', 'setClue', { roundId: r.roundId, ...bad })).code, 'INVALID_INPUT', flat(bad));
    }
    assert.equal((await be.call('host', 'setClue', { roundId: 'x', clueMode: 'text', clueText: GOOD })).code, 'INVALID_INPUT');
    const long = await typed(be, 'host', r.roundId, '春'.repeat(50000));
    assert.deepEqual([long.code, long.reason], ['TEXT_REJECTED', 'length']);
  });

  test('AC 94: kill switches: createEnabled false -> UGC_PAUSED for typed clues (presets and guessing unaffected); viewEnabled false -> every typed clue is served paused', async (be) => {
    const r = await openTyped(be, 'host', GOOD, 3);
    await be.setAppConfig({ ugc: { createEnabled: false, viewEnabled: true } });
    const r2 = await mkRound(be, 'host2');
    assert.equal(r2.ugc.createEnabled, false);
    assert.equal((await typed(be, 'host', (await mkRound(be, 'host')).roundId, '夏天的西瓜')).code, 'UGC_PAUSED');
    assert.equal((await be.clue('host2', r2.roundId)).ok, true, 'presets still work');
    assert.equal((await be.call('g1', 'getRound', { roundId: r.roundId })).clue.text, GOOD, 'viewing is separate');
    assert.equal((await be.call('g1', 'submitGuess', { roundId: r.roundId, pos: 30 })).ok, true);
    // an identical retry of an already stored clue still answers ok (nothing new is created)
    assert.equal((await typed(be, 'host', r.roundId, GOOD)).code, 'ROUND_EXPIRED', 'a guess landed: frozen');
    await be.setAppConfig({ ugc: { createEnabled: true, viewEnabled: false } });
    const p = await be.call('g2', 'getRound', { roundId: r.roundId });
    assert.deepEqual(p.clue, { mode: 'text', text: null, hidden: true, state: 'paused' });
    assert.equal(p.clueText, null);
    assert.equal(p.clueState, 'paused');
    assert.equal(p.me.canReport, false, 'a paused clue cannot be reported');
    assert.ok(!flat(p).includes('冬天'));
    assert.equal((await be.call('host', 'getRound', { roundId: r.roundId })).clue.state, 'paused', 'the host too');
    // presets show normally while paused
    const pr = await mkRound(be, 'host3', 4);
    const pc = await be.clue('host3', pr.roundId);
    assert.equal((await be.call('g2', 'getRound', { roundId: pr.roundId })).clue.text, pc.clueText);
    // the reveal shows the same placeholder
    await be.call('host', 'revealRound', { roundId: r.roundId }).catch(() => null);
    await be.call('g2', 'submitGuess', { roundId: r.roundId, pos: 70 });
    const rv = await be.call('g2', 'getRound', { roundId: r.roundId });
    assert.ok(!flat(rv).includes('冬天'));
    // back on
    await be.setAppConfig({});
    assert.equal((await be.call('g2', 'getRound', { roundId: r.roundId })).clue.text, GOOD);
  });

  test('AC 91: report: hides the clue for everyone at once (host included), the round runs on, no reporter ever appears, limits DUP_REPORT / REPORT_LIMIT / OWN_ROUND', async (be) => {
    const host = 'host-openid-abc';
    const r = await openTyped(be, host, GOOD);
    const bad = await be.call('rep1', 'getRound', { roundId: r.roundId });
    assert.equal(bad.me.canReport, true);
    for (const x of [{ reason: 'spam' }, { reason: 'unsuitable' }, {}, { reason: 5 }]) assert.equal((await be.call('rep1', 'reportClue', { roundId: r.roundId, ...x })).code, 'INVALID_INPUT', flat(x));
    assert.equal((await be.call('rep1', 'reportClue', { roundId: 'bad', reason: 'porn' })).code, 'INVALID_INPUT');
    assert.equal((await be.call('rep1', 'reportClue', { roundId: 'AAAAAAAA', reason: 'porn' })).code, 'ROUND_NOT_FOUND');
    assert.equal((await be.call(host, 'reportClue', { roundId: r.roundId, reason: 'porn' })).code, 'OWN_ROUND');
    const ok = await be.call('rep1', 'reportClue', { roundId: r.roundId, reason: 'abuse' });
    assert.deepEqual(ok, { ok: true, hidden: true });
    assert.ok(!flat(ok).includes('rep1'));
    // hidden for everyone
    for (const who of [host, 'rep1', 'g1', 'g2']) {
      const v = await be.call(who, 'getRound', { roundId: r.roundId });
      assert.deepEqual(v.clue, { mode: 'text', text: null, hidden: true, state: 'hidden' }, who);
      assert.equal(v.clueText, null);
      assert.equal(v.clueState, 'hidden');
      assert.equal(v.me.canReport, false);
      assert.ok(!flat(v).includes('冬天'));
      assert.ok(!flat(v).includes('rep1'), 'the reporter is never revealed');
      assert.ok(!flat(v).includes('abuse'));
    }
    assert.equal((await be.call('rep1', 'reportClue', { roundId: r.roundId, reason: 'abuse' })).code, 'DUP_REPORT');
    // a second player can still report an already hidden clue: ok, and a row is stored
    assert.deepEqual(await be.call('rep2', 'reportClue', { roundId: r.roundId, reason: 'ads' }), { ok: true, hidden: true });
    assert.equal((await be.clueReports()).length, 2);
    assert.deepEqual((await be.clueReports()).map((x) => x.state), ['open', 'open']);
    // the round keeps running and scoring
    assert.equal((await be.call('g1', 'submitGuess', { roundId: r.roundId, pos: 30 })).ok, true);
    assert.equal((await be.call('g2', 'submitGuess', { roundId: r.roundId, pos: 50 })).ok, true);
    const rv = await be.call(host, 'revealRound', { roundId: r.roundId });
    assert.equal(rv.ok, true);
    assert.equal(typeof rv.reveal.mq, 'number');
    const after = await be.call('g1', 'getRound', { roundId: r.roundId });
    assert.equal(after.clue.state, 'hidden', 'the reveal shows the placeholder too');
    // the host cannot replace a hidden clue
    assert.equal((await typed(be, host, r.roundId, '夏天的西瓜')).code, 'ROUND_EXPIRED');
    const r2 = await openTyped(be, host, '夏天的西瓜');
    await be.call('rep1', 'reportClue', { roundId: r2.roundId, reason: 'other' });
    assert.equal((await typed(be, host, r2.roundId, '秋天的落叶')).code, 'INVALID_INPUT', 'not replaceable once hidden');
    assert.equal((await be.call(host, 'setClue', { roundId: r2.roundId, clueMode: 'preset', clueItemId: be.content.spectrumById[(await be.roundDoc(r2.roundId)).spectrumId].items[0].id })).code, 'INVALID_INPUT');
  });

  test('AC 91: a report is only for a shown typed clue: not a preset, not a legacy chat round, not a draft, not a placeholder', async (be) => {
    const sp = be.content.spectra[4];
    const pr = await be.call('host', 'createRound', { spectrumId: sp.id });
    await be.clue('host', pr.roundId);
    const g = await be.call('g1', 'getRound', { roundId: pr.roundId });
    assert.equal(g.me.canReport, false);
    assert.equal((await be.call('g1', 'reportClue', { roundId: pr.roundId, reason: 'porn' })).code, 'INVALID_INPUT');
    // legacy chat round (written before D-2)
    const doc = await be.roundDoc(pr.roundId);
    await be.putRound({ ...doc, _id: 'LEGACY22', clueMode: 'chat', clueItemId: null, clueText: null });
    const legacy = await be.call('g1', 'getRound', { roundId: 'LEGACY22' });
    assert.equal(legacy.ok, true);
    assert.deepEqual(legacy.clue, { mode: 'chat', text: null, hidden: false, state: 'shown' });
    assert.equal(legacy.clueMode, 'chat');
    assert.equal(legacy.me.canReport, false);
    assert.equal((await be.call('g1', 'reportClue', { roundId: 'LEGACY22', reason: 'porn' })).code, 'INVALID_INPUT');
    assert.equal((await be.call('g1', 'submitGuess', { roundId: 'LEGACY22', pos: 33 })).ok, true, 'a legacy round still takes guesses');
    assert.equal((await be.call('g2', 'submitGuess', { roundId: 'LEGACY22', pos: 66 })).ok, true);
    assert.equal((await be.call('host', 'revealRound', { roundId: 'LEGACY22' })).ok, true, 'and reveals');
    const dr = await be.call('host', 'createRound', { spectrumId: sp.id });
    assert.equal((await be.call('g1', 'reportClue', { roundId: dr.roundId, reason: 'porn' })).code, 'ROUND_NOT_FOUND', 'a draft is the host\'s alone');
    assert.equal((await be.call('host', 'reportClue', { roundId: dr.roundId, reason: 'porn' })).code, 'OWN_ROUND');
  });

  test('AC 91: REPORT_LIMIT: the 11th report of a day, per player; the legacy spelling `ad` is read as `ads`', async (be) => {
    await be.call('x', 'agreeRules', { rulesVersion: 1 });
    const ids = [];
    for (let i = 0; i < 12; i++) {
      const host = 'h' + i;
      const r = await openTyped(be, host, '夏天的西瓜');
      ids.push(r.roundId);
    }
    for (let i = 0; i < 10; i++) {
      const res = await be.call('reporter', 'reportClue', { roundId: ids[i], reason: i === 0 ? 'ad' : 'other' });
      assert.equal(res.ok, true, 'report ' + (i + 1) + ' ' + flat(res));
    }
    assert.equal((await be.clueReports())[0].reason, 'ads');
    const over = await be.call('reporter', 'reportClue', { roundId: ids[10], reason: 'other' });
    assert.equal(over.code, 'REPORT_LIMIT');
    assert.equal((await be.call('reporter', 'getRound', { roundId: ids[10] })).clue.state, 'shown', 'a refused report hides nothing');
    assert.equal((await be.call('other-reporter', 'reportClue', { roundId: ids[10], reason: 'other' })).ok, true, 'per player');
    be.clock.add(DAY);
    assert.equal((await be.call('reporter', 'reportClue', { roundId: ids[11], reason: 'other' })).ok, true, 'the next day resets');
  });

  test('AC 92: strikes: 1 = one-time warning; 2 = 24 h; 3 = 7 d; 4 = 30 d + review flag; a restricted host still guesses, reports and hosts with a preset', async (be) => {
    const host = 'offender';
    await agree(be, host);
    const strikeOnce = async () => {
      const r = await mkRound(be, host);
      const res = await typed(be, host, r.roundId, '测试违规');
      return { r, res };
    };
    // 1st strike: warning, no restriction
    let x = await strikeOnce();
    assert.equal(x.res.code, 'TEXT_BLOCKED');
    let doc = await be.playerDoc(host);
    assert.equal(doc.strikes.length, 1);
    assert.equal(doc.warnPending, true);
    assert.equal(doc.restrictedUntil || 0, 0);
    // the warning is read once: the next clue step (createRound) carries it, the one after does not
    const n1 = await mkRound(be, host);
    assert.equal(n1.ugc.warnPending, true);
    assert.equal(n1.ugc.restriction, null);
    assert.equal((await mkRound(be, host)).ugc.warnPending, false);
    // 2nd strike: 24 h
    be.clock.add(HOUR);
    x = await strikeOnce();
    const t2 = be.clock.now();
    const blocked = await typed(be, host, (await mkRound(be, host)).roundId, GOOD);
    assert.deepEqual([blocked.code, blocked.until, blocked.permanent], ['RESTRICTED', t2 + 24 * HOUR, false]);
    const r2 = await mkRound(be, host);
    assert.deepEqual(r2.ugc.restriction, { until: t2 + 24 * HOUR, permanent: false });
    assert.equal(r2.ugc.warnPending, false, 'the warning is only for the first strike');
    // restricted: everything but typed clues still works
    assert.equal((await be.clue(host, r2.roundId)).ok, true, 'host with a preset');
    const other = await openTyped(be, 'someone', '夏天的西瓜');
    assert.equal((await be.call(host, 'submitGuess', { roundId: other.roundId, pos: 40 })).ok, true, 'guess');
    assert.equal((await be.call(host, 'reportClue', { roundId: other.roundId, reason: 'other' })).ok, true, 'report');
    assert.equal((await be.call(host, 'getDaily', {})).ok, true, 'the daily');
    const view = await be.call(host, 'getRound', { roundId: r2.roundId });
    assert.deepEqual(view.me.restriction, { level: 2, until: t2 + 24 * HOUR, permanent: false });
    // 24 h later it is over
    be.clock.add(24 * HOUR + 1);
    const r3 = await mkRound(be, host);
    assert.equal(r3.ugc.restriction, null);
    assert.equal((await typed(be, host, r3.roundId, '夏天的西瓜')).ok, true, 'free again');
    // 3rd strike: 7 days
    x = await strikeOnce();
    const t3 = be.clock.now();
    doc = await be.playerDoc(host);
    assert.equal(doc.restrictedUntil, t3 + 7 * DAY);
    assert.equal(doc.reviewFlag, undefined);
    be.clock.add(7 * DAY + 1);
    // 4th strike: 30 days + flag
    x = await strikeOnce();
    const t4 = be.clock.now();
    doc = await be.playerDoc(host);
    assert.equal(doc.restrictedUntil, t4 + 30 * DAY);
    assert.equal(doc.reviewFlag, true);
    assert.equal(doc.strikes.length, 4);
    be.clock.add(30 * DAY + 1);
    assert.equal((await mkRound(be, host)).ugc.restriction, null);
    // strikes age out of the rolling 30 days: the next one is a first again
    be.clock.add(40 * DAY);
    x = await strikeOnce();
    assert.equal(x.res.code, 'TEXT_BLOCKED');
    assert.equal((await be.playerDoc(host)).restrictedUntil < be.clock.now(), true, 'no restriction from a lone strike');
    assert.equal((await mkRound(be, host)).ugc.warnPending, true);
  });

  test('AC 92: local rejections, review and busy give no strike (and the strike notice is read once through getRound)', async (be) => {
    await agree(be, 'h');
    for (const text of ['七成', '很夜宵', 'coffee', '加我微信', '测试繁忙']) {
      const r = await mkRound(be, 'h', 3);
      await typed(be, 'h', r.roundId, text);
    }
    assert.equal(((await be.playerDoc('h')).strikes || []).length, 0);
    const r = await mkRound(be, 'h');
    await typed(be, 'h', r.roundId, '测试违规');
    const v1 = await be.call('h', 'getRound', { roundId: r.roundId });
    assert.equal(v1.me.strikeNotice, true);
    assert.equal((await be.call('h', 'getRound', { roundId: r.roundId })).me.strikeNotice, false, 'read once');
    // only the host's own view carries it
    const r2 = await mkRound(be, 'h');
    await typed(be, 'h', r2.roundId, GOOD).catch(() => null);
  });

  test('AC 99: the 51st WeChat check of a day is RATE_LIMITED with scope day; local rejections do not count; the next day resets', async (be) => {
    await agree(be, 'host');
    const r = await mkRound(be, 'host');
    for (let i = 0; i < 20; i++) assert.equal((await typed(be, 'host', r.roundId, '七成')).code, 'TEXT_REJECTED'); // free
    for (let i = 0; i < 50; i++) assert.equal((await typed(be, 'host', r.roundId, '测试繁忙')).code, 'MODERATION_BUSY', 'check ' + (i + 1));
    const over = await typed(be, 'host', r.roundId, '测试繁忙');
    assert.deepEqual([over.ok, over.code, over.scope], [false, 'RATE_LIMITED', 'day']);
    assert.equal((await typed(be, 'host', r.roundId, '七成')).code, 'TEXT_REJECTED', 'a local rejection comes before the limit');
    assert.equal((await be.clue('host', r.roundId)).ok, true, 'presets are not limited');
    be.clock.add(DAY);
    const r2 = await mkRound(be, 'host');
    assert.equal((await typed(be, 'host', r2.roundId, GOOD)).ok, true, 'the next Beijing day');
  });

  test('AC 77/95: no event, client or server, contains the clue, a fragment of it, the blocked text or a trace id', async (be) => {
    const CLUE = '月光糖葫芦';
    const BLOCKED = '测试违规独家';
    await agree(be, 'host');
    const r0 = await mkRound(be, 'host');
    await typed(be, 'host', r0.roundId, BLOCKED); // risky: mod_log has the text, events must not
    const r = await mkRound(be, 'host');
    assert.equal((await typed(be, 'host', r.roundId, CLUE)).ok, true);
    await be.call('g1', 'submitGuess', { roundId: r.roundId, pos: 30 });
    await be.call('g1', 'reportClue', { roundId: r.roundId, reason: 'porn' });
    // a hostile client smuggles the text into every prop of every event it can name
    const props = {};
    for (const k of ['roundId', 'clueMode', 'presetSwaps', 'chars', 'tabSwitches', 'tab', 'via', 'result', 'reason', 'label', 'text', 'clueText', 'where', 'state', 'source', 'code', 'errCode', 'traceId', 'api', 'suggest']) props[k] = CLUE + BLOCKED;
    const events = ['round_clue', 'clue_tab', 'clue_result', 'rules_view', 'rules_agree', 'clue_report', 'error', 'daily_card_reveal', 'clue_check', 'strike', 'restrict', 'ugc_pause'].map((name, i) => ({ name, props, clientTs: 1000 + i }));
    const tr = await be.call('g1', 'track', { sessionId: 's1', events });
    assert.equal(tr.ok, true);
    const rows = await be.allEvents();
    assert.ok(rows.length > 3);
    const blob = flat(rows);
    for (const s of [CLUE, BLOCKED, '月光', '糖葫', '葫芦', '独家', '测试违规', 'mock-', 'T-game']) assert.ok(!blob.includes(s), 'an event contains ' + JSON.stringify(s));
    // the server events that exist carry only the spec props
    const names = new Set(rows.map((x) => x.name));
    assert.ok(names.has('clue_check'));
    const cc = rows.find((x) => x.name === 'clue_check');
    assert.deepEqual(Object.keys(cc.props).sort().filter((k) => !['label', 'errCode'].includes(k)), ['api', 'latencyMs', 'suggest']);
    assert.ok(!rows.some((x) => x.name === 'clue_check' && x.openid !== 'server'), 'a client cannot write clue_check');
    // the legitimate client events are kept with their allowlisted props
    const kept = rows.find((x) => x.name === 'clue_report');
    assert.ok(kept, 'clue_report stored');
    assert.ok(!('reason' in kept.props) || kept.props.reason !== CLUE + BLOCKED);
    // the strike is recorded without the player
    const st = rows.find((x) => x.name === 'strike');
    assert.deepEqual(st.props, { cause: 'risky', strikes30d: 1 });
    assert.equal(st.openid, 'server');
  });

  test('AC 96/45: the group page lists only a preset clue text, never a typed one; subscribe messages never carry the clue', async (be) => {
    const SUB = { subscribe: { tmplId: 'TMPL-TEST', fields: { spectrum: 'thing1', mq: 'number2', time: 'time3' } } };
    await be.setAppConfig(SUB);
    const ref = (await be.call('host', 'joinGroup', { cloudID: be.cloudID('GCLUE', 3) })).groupRef;
    for (const u of ['g1', 'g2', 'g3']) await be.call(u, 'joinGroup', { cloudID: be.cloudID('GCLUE', 3) });
    await agree(be, 'host');
    const rt = await mkRound(be, 'host', 3);
    assert.equal((await typed(be, 'host', rt.roundId, '月光糖葫芦')).ok, true);
    const rp = await mkRound(be, 'host', 4);
    const pc = await be.clue('host', rp.roundId);
    await be.call('host', 'subscribeRound', { roundId: rt.roundId });
    for (const u of ['g1', 'g2']) {
      await be.call(u, 'submitGuess', { roundId: rt.roundId, pos: 40, groupRef: ref });
      await be.call(u, 'submitGuess', { roundId: rp.roundId, pos: 40, groupRef: ref });
    }
    await be.call('host', 'revealRound', { roundId: rt.roundId });
    const gd = await be.call('g3', 'getGroupDay', { groupRef: ref, dateKey: T1 });
    assert.equal(gd.ok, true, flat(gd));
    const byId = Object.fromEntries(gd.rounds.map((r) => [r.roundId, r]));
    assert.equal(byId[rt.roundId].clue, null, 'a typed clue is never public text');
    assert.equal(byId[rp.roundId].clue, pc.clueText, 'a preset keeps its curated text');
    assert.ok(!flat(gd).includes('月光'));
    const sent = await be.sent();
    assert.ok(sent.length >= 1);
    assert.ok(!flat(sent).includes('月光'), 'no subscribe message carries the clue');
  });

  test('AC 101: nothing of a typed clue survives the round: cleanup removes rounds, reports, mod_log and audit rows at 180 days, not before', async (be) => {
    const r = await openTyped(be, 'host', GOOD);
    await be.call('rep', 'reportClue', { roundId: r.roundId, reason: 'other' });
    assert.equal((await be.call(null, 'admin', { op: 'hideClue', roundId: r.roundId })).ok, true, 'the console writes an audit row');
    assert.equal((await be.modLog()).length, 1);
    assert.equal((await be.auditLog()).length, 1);
    be.clock.add(179 * DAY);
    await be.timer('cleanup');
    assert.equal((await be.auditLog()).length, 1);
    assert.equal((await be.roundDoc(r.roundId)).clueText, GOOD, 'kept before 180 days');
    assert.equal((await be.clueReports()).length, 1);
    assert.equal((await be.modLog()).length, 1);
    be.clock.add(2 * DAY);
    const out = await be.timer('cleanup');
    assert.equal(out.ok, true);
    assert.equal(await be.roundDoc(r.roundId), null, 'the round and its typed clue are gone');
    assert.equal((await be.clueReports()).length, 0);
    assert.equal((await be.modLog()).length, 0);
    assert.equal((await be.auditLog()).length, 0);
    assert.deepEqual((await be.call('g1', 'getRound', { roundId: r.roundId })).code, 'ROUND_NOT_FOUND');
  });
};
