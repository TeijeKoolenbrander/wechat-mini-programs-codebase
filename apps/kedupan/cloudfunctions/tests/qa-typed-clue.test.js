'use strict';
// QA adversarial pass on the typed clue (D-2, AC 27-30, 49, 53, 87-101): calls the REAL setClue / reportClue / admin directly,
// the way a hostile client would, bypassing every client-side rule.
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeBackend, disposeStages } = require('./helpers/backends');
const { sdk } = require('./helpers/real-backend');

test.after(() => disposeStages());
const real = (o) => makeBackend('real', { ...o, env: { ENV_KIND: 'prod', MODERATION_MODE: 'live', ...((o && o.env) || {}) } });
const flat = (x) => JSON.stringify(x);
const PASS = { errCode: 0, result: { suggest: 'pass', label: 100 }, trace_id: 'QA-TRACE-1' };
const GOOD = '冬天的被窝';
const typed = (be, who, roundId, clueText) => be.call(who, 'setClue', { roundId, clueMode: 'text', clueText });
async function setup(be, host) {
  assert.equal((await be.call(host, 'agreeRules', { rulesVersion: 1 })).ok, true);
  const r = await be.call(host, 'createRound', { spectrumId: be.content.spectra[3].id });
  assert.equal(r.ok, true);
  return r;
}

test('QA setClue direct: every rule bypass attempt is rejected, no WeChat call, nothing stored, no strike', async () => {
  const be = real();
  try {
    sdk.state.mod.game = () => PASS;
    const r = await setup(be, 'qa-host');
    const sp = be.content.spectra[3];
    const L = sp.left || sp.leftLabel;
    const R = sp.right || sp.rightLabel;
    assert.ok(L && R, 'labels found');
    const cases = {
      'fullwidth digits': '５０', 'fullwidth mix': '０７', circled: '①②', 'circled 10': '⑩', roman: 'Ⅻ', superscript: '²', 'arabic-indic': '٣',
      devanagari: '३', hangzhou: '〡〢', seventy: '七十', 'seventy+': '七十多', 'lone 〇': '〇', 'lone 〇 in text': '冬天〇', percent: '50%', 'fw percent': '五％',
      permille: '冬‰', 'zero-width in numeral': '七​十', 'zero-width digit': '7‍0', 'bom in digit': '5﻿0', 'word-joiner digit': '5⁠0',
      'variation selector digit': '7️0', 'emoji wrapped digit': '😀70😀', 'emoji wrapped numerals': '😀七十😀', 'space split numerals': '七 十', 'ideographic space numerals': '七　十',
      latin: 'coffee', 'fw latin': 'ｃｏｆｆｅｅ', 'latin in chinese': '冬天a被窝', wx: 'wx', 'fw wx': 'ｗｘ', kana: 'ありがとう', hangul: '한국어',
      'combining acute': '冬́天', 'combining only': '́', keycap: '1⃣', 'combining on digit': '5́',
      rlo: '‮冬天', lrm: '冬‎天', 'soft hyphen': '冬­天', 'hangul filler': '冬ㅤ天', 'braille blank': '冬⠀天',
      '13 chars': '一二三四五六七八九十甲乙丙', '13 plain': '冬天的被窝冬天的被窝冬天的', '5000 chars': '冬'.repeat(5000), '13 with emoji tail': '冬天的被窝冬天的被窝冬天的😀',
      'left label': L + '乎乎', 'right label': '很' + R, 'left label zw': L.split('').join('​') + '的',
      'position zw': '中​间', 'position fw': '偏贵', ruler: '刻度', contact: '加我微信', 'contact zw': '微​信', 'contact space': '微 信',
    };
    const before = JSON.stringify(await be.roundDoc(r.roundId));
    const accepted = [];
    for (const [name, text] of Object.entries(cases)) {
      const res = await typed(be, 'qa-host', r.roundId, text);
      if (res.ok) accepted.push(name);
      else assert.ok(['TEXT_REJECTED', 'INVALID_INPUT'].includes(res.code), name + ' ' + flat(res));
    }
    assert.deepEqual(accepted, [], 'accepted bypasses');
    assert.equal(sdk.state.modCalls.length, 0, 'no WeChat call for a local rejection');
    assert.equal(JSON.stringify(await be.roundDoc(r.roundId)), before, 'round untouched');
    assert.equal(((await be.playerDoc('qa-host')).strikes || []).length, 0);
    assert.equal((await be.modLog()).length, 0);
    for (const bad of [null, 5, true, ['冬天'], { a: 1 }, { toString: () => GOOD }, '__proto__']) {
      const res = await be.call('qa-host', 'setClue', { roundId: r.roundId, clueMode: 'text', clueText: bad });
      assert.equal(res.ok, false, flat(bad));
    }
    for (const mode of ['chat', 'TEXT', 'free', '', null, 7, ['text']]) {
      const res = await be.call('qa-host', 'setClue', { roundId: r.roundId, clueMode: mode, clueText: GOOD, clueItemId: 'x' });
      assert.equal(res.ok, false, flat(mode));
    }
    assert.equal(sdk.state.modCalls.length, 0);
  } finally {
    be.dispose();
  }
});

test('punctuation inside a numeral run or position word is caught like contact words (B1)', async () => {
  const be = real();
  try {
    sdk.state.mod.game = () => PASS;
    const out = {};
    for (const [k, t] of Object.entries({ numeralComma: '七，十', numeralDot: '七·十', positionDot: '中·间', contactDot: '微·信', numeralSp: '七、 十', positionBang: '中！间', numeralTilde: '七～十' })) {
      const r = await setup(be, 'p-' + k);
      out[k] = (await typed(be, 'p-' + k, r.roundId, t)).ok;
    }
    assert.deepEqual(out, { numeralComma: false, numeralDot: false, positionDot: false, contactDot: false, numeralSp: false, positionBang: false, numeralTilde: false });
  } finally {
    be.dispose();
  }
});

test('QA authorisation: someone else\'s round, own/duplicate report, admin from a client', async () => {
  const be = real({ env: { ADMIN_OPENIDS: 'qa-admin' } });
  try {
    sdk.state.mod.game = () => PASS;
    const r = await setup(be, 'qa-host');
    await be.call('qa-other', 'agreeRules', { rulesVersion: 1 });
    assert.equal((await typed(be, 'qa-other', r.roundId, GOOD)).code, 'NOT_HOST');
    assert.equal((await be.call('qa-other', 'setClue', { roundId: r.roundId, clueMode: 'preset', clueItemId: 'x' })).ok, false);
    assert.equal(sdk.state.modCalls.length, 0);
    assert.equal((await be.roundDoc(r.roundId)).status, 'draft');
    assert.equal((await be.call('qa-other', 'reportClue', { roundId: r.roundId, reason: 'other' })).ok, false, 'no clue yet');
    assert.equal((await typed(be, 'qa-host', r.roundId, GOOD)).ok, true);
    assert.equal((await typed(be, 'qa-other', r.roundId, '被窝里的冬天')).code, 'NOT_HOST');
    assert.equal((await be.roundDoc(r.roundId)).clueText, GOOD);
    assert.equal((await be.call('qa-host', 'reportClue', { roundId: r.roundId, reason: 'other' })).code, 'OWN_ROUND');
    for (const bad of ['', 'x', null, 5, '色情低俗', 'PORN', undefined]) assert.equal((await be.call('qa-other', 'reportClue', { roundId: r.roundId, reason: bad })).code, 'INVALID_INPUT', flat(bad));
    assert.equal((await be.call('qa-other', 'reportClue', { roundId: 'ZZZZZZZZ', reason: 'other' })).ok, false);
    assert.deepEqual(await be.call('qa-other', 'reportClue', { roundId: r.roundId, reason: 'other' }), { ok: true, hidden: true });
    assert.equal((await be.call('qa-other', 'reportClue', { roundId: r.roundId, reason: 'abuse' })).code, 'DUP_REPORT');
    assert.equal((await be.clueReports()).length, 1);
    for (const who of ['qa-host', 'qa-other', 'qa-third']) {
      const g = await be.call(who, 'getRound', { roundId: r.roundId });
      assert.equal(g.clueText, null, who);
      assert.equal(g.clueState, 'hidden', who);
      assert.ok(!flat(g).includes(GOOD), who + ' leaked the hidden text');
    }
    for (const who of ['qa-host', 'qa-other', 'qa-adm', 'QA-ADMIN']) {
      for (const op of ['listReports', 'getRound', 'sample', 'restrict', 'setUgc', 'deleteClue', 'upholdReport', 'restoreClue']) {
        const res = await be.call(who, 'admin', { op, roundId: r.roundId, openid: 'qa-host', days: 1, createEnabled: false });
        assert.deepEqual([res.ok, res.code], [false, 'FORBIDDEN'], who + ' ' + op);
      }
    }
    assert.equal((await be.auditLog()).length, 0);
    assert.equal((await be.roundDoc(r.roundId)).clueText, GOOD, 'untouched');
    assert.equal((await be.call('qa-admin', 'admin', { op: 'listReports' })).ok, true);
    assert.equal((await be.call(null, 'admin', { op: 'listReports' })).ok, true);
  } finally {
    be.dispose();
  }
});

test('QA every non-pass outcome stores the text nowhere but mod_log (all collections scanned) and no response shows it', async () => {
  const be = real();
  try {
    const TXT = '月光糖葫芦';
    await be.call('h', 'agreeRules', { rulesVersion: 1 });
    const outcomes = {
      risky: () => ({ errCode: 0, result: { suggest: 'risky', label: 20002 }, trace_id: 'QA-TRACE-RISKY' }),
      error: () => { throw new Error('net'); },
      errcode: () => ({ errCode: 87014 }),
      noresult: () => ({ errCode: 0 }),
      unknown: () => ({ errCode: 0, result: { suggest: 'review' } }),
    };
    for (const [name, h] of Object.entries(outcomes)) {
      sdk.state.mod.game = h;
      const r = await be.call('h', 'createRound', { spectrumId: be.content.spectra[3].id });
      const orig = console.warn;
      console.warn = () => {};
      const res = await typed(be, 'h', r.roundId, TXT);
      console.warn = orig;
      assert.equal(res.ok, false, name);
      assert.ok(!flat(res).includes(TXT) && !flat(res).includes('TRACE'), name + ' response leaks');
      const doc = await be.roundDoc(r.roundId);
      assert.equal(doc.status, 'draft', name);
      assert.ok(!flat(doc).includes(TXT) && !doc.clueMod, name);
      for (const who of ['h', 'g']) assert.ok(!flat(await be.call(who, 'getRound', { roundId: r.roundId })).includes(TXT), name + ' getRound ' + who);
    }
    const holders = [];
    for (const n of be.db.names()) for (const d of be.db.all(n)) if (flat(d).includes(TXT)) holders.push(n);
    assert.deepEqual([...new Set(holders)], ['kedupan_mod_log']);
  } finally {
    be.dispose();
  }
});
