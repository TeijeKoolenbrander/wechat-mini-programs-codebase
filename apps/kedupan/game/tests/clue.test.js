'use strict';
// Typed clues, core half (D-2, spec 6.12 / 11.6-11.8, AC 87, 92, 95): the clue rules, the strike ladder, the moderation
// decisions, the clue state rules and the analytics allowlist. Pure functions, no server.
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../core/clue');
const U = require('../core/ugc');
const STK = require('../core/strikes');
const MOD = require('../core/moderation');
const EV = require('../core/events');
const { V } = require('../core/input');
const { CONFIG } = require('../core/config');
const ERR = require('../core/errors');

const CHEAP = { leftLabel: '便宜', rightLabel: '贵' };
const COLD = { leftLabel: '冷', rightLabel: '热' };
const rej = (text, reason, labels) => {
  const r = C.checkClue(text, labels || CHEAP);
  assert.equal(r.ok, false, JSON.stringify(text) + ' must be rejected');
  assert.equal(r.reason, reason, JSON.stringify(text));
  assert.equal(typeof r.hint, 'string');
  return r;
};

test('contract constants: CLUE_MAX 12, RULE_LINE, rules version 1, reasons', () => {
  assert.equal(C.CLUE_MAX, 12);
  assert.equal(C.RULE_LINE, '最多 12 个字 · 不写数字、位置和两头的词');
  assert.equal(C.CLUE_RULES_VERSION, 1);
  assert.equal(CONFIG.ugc.rulesVersion, 1);
  assert.deepEqual(C.REASONS, ['empty', 'length', 'digit', 'position', 'endLabel', 'charset', 'blocked']);
});

test('AC 87: accepted clues (including the near-misses that must stay allowed)', () => {
  for (const t of ['冬天的被窝', '一杯奶茶', '一分钱', '千层饼', '十字路口', '零食', '外婆家的饭', '分钟', '一分钟', '分享', '你好，世界！', '好吃到哭～', '唉…', '夏天的风']) {
    const r = C.checkClue(t, CHEAP);
    assert.equal(r.ok, true, t);
    assert.equal(r.text, C.normalizeClue(t));
  }
  assert.equal(C.checkClue('冬 天 的 被 窝', CHEAP).text, '冬天的被窝', 'spaces removed');
  assert.equal(C.checkClue('冬天的被窝　\n\t', CHEAP).text, '冬天的被窝');
  assert.equal(C.checkClue('好😀吃🍜', CHEAP).text, '好吃', 'emoji stripped, not an error');
});

test('B1: punctuation or spaces inside a numeral run or a position word do not hide it; the allowed near-misses stay allowed', () => {
  const marks = ['，', '·', '、', '。', '！', '？', '…', '~', '～', ' '];
  for (const m of marks) {
    assert.equal(C.checkClue('七' + m + '十', CHEAP).reason, 'digit', 'numeral ' + JSON.stringify(m));
    assert.equal(C.checkClue('中' + m + '间', CHEAP).reason, 'position', 'position ' + JSON.stringify(m));
  }
  assert.equal(C.checkClue('七，十', CHEAP).hint, '提示里不能有数字哦');
  assert.equal(C.checkClue('三。成', CHEAP).reason, 'digit');
  for (const t of ['一杯奶茶', '一分钱', '分钟', '分享', '一', '两', '半', '一，杯奶茶', '好，一分钱', '半！杯']) assert.equal(C.checkClue(t, CHEAP).ok, true, t);
});

test('AC 87: rule 1 length: empty has no hint, 13 characters is `length`, exactly 12 is fine, the count is code points after normalising', () => {
  assert.deepEqual(C.checkClue('', CHEAP), { ok: false, reason: 'empty', hint: '' });
  assert.equal(C.checkClue('   \n', CHEAP).reason, 'empty');
  assert.equal(C.checkClue('😀😀', CHEAP).reason, 'empty', 'only emoji = empty');
  assert.equal(C.checkClue(undefined, CHEAP).reason, 'empty');
  assert.equal(C.checkClue(42, CHEAP).reason, 'empty');
  assert.equal(C.checkClue({}, CHEAP).reason, 'empty');
  assert.equal(C.checkClue('春夏秋冬春夏秋冬春夏秋冬', CHEAP).ok, true, '12 characters');
  const r = rej('春夏秋冬春夏秋冬春夏秋冬春', 'length');
  assert.equal(r.hint, '最多 12 个字');
  rej('春 夏 秋 冬 春 夏 秋 冬 春 夏 秋 冬 春', 'length'); // spaces do not count, but 13 characters do
  assert.equal(C.checkClue('春 夏 秋 冬 春 夏 秋 冬 春 夏 秋 冬', CHEAP).ok, true, 'spaces do not count');
  rej('春'.repeat(5000), 'length');
  assert.equal(C.clueLength('春 夏😀秋'), 3);
  // length is checked first: a 13-character clue full of digits is `length`
  rej('1234567890123', 'length');
  // an ellipsis counts as one character (it is not folded to three dots)
  assert.equal(C.clueLength('唉…'), 2);
});

test('AC 87: rule 2 digit: ASCII, full-width, circled, Roman, superscripts, Chinese numeral runs, numeral + 成/格/度/分, a lone 〇', () => {
  const hint = '提示里不能有数字哦';
  for (const t of ['70', '５', '①', '⑫', 'Ⅻ', '²', '七十', '七十多', '三五', '十二', '一百', '两千零五', '七成', '三格', '八分', '五度', '几成', '半成', '十分', '百分', '〇', '零〇', '壹贰', '好７好', '第３名']) {
    assert.equal(rej(t, 'digit').hint, hint, t);
  }
  assert.equal(C.checkClue('一杯奶茶', CHEAP).ok, true, 'a single numeral is a measure word, not a number');
  assert.equal(C.checkClue('一分钱', CHEAP).ok, true);
  assert.equal(C.checkClue('一分钟', CHEAP).ok, true);
  assert.equal(C.checkClue('分钟', CHEAP).ok, true);
  assert.equal(C.checkClue('分享', CHEAP).ok, true);
  assert.equal(C.checkClue('千层饼', CHEAP).ok, true);
  // 分 after a numeral is a digit unless it starts 分钟 / 分钱
  rej('三分', 'digit');
  rej('三分好', 'digit');
});

test('AC 87: rule 3 position: ruler and position words, a percent sign (even next to digits); 偏 is checked before the label', () => {
  const hint = '别直接说位置，换个说法吧';
  for (const t of ['左边一点', '右边', '中间', '中央', '正中', '居中', '当中', '中等', '中不溜', '一半', '偏甜', '靠近', '价格', '刻度', '指针', '位置', '两头', '两端', '尽头', '满分', '零分', '及格', '打分', '分数', '百分', '%', '％', '‰', '50%', '偏贵']) {
    const r = C.checkClue(t, CHEAP);
    if (/^[⑫]/.test(t)) continue;
    // 满分/零分/百分/十分 contain a numeral and 分 or 零: they are `digit` or `position` depending on the first rule they hit
    assert.ok(r.reason === 'position' || r.reason === 'digit', t + ' -> ' + r.reason);
  }
  for (const t of ['左边一点', '右边', '中间', '偏甜', '靠近', '一半', '指针', '位置', '两头', '尽头', '及格', '打分', '分数', '50%', '％', '偏贵', '价格', '居中']) assert.equal(rej(t, 'position').hint, hint, t);
  // 偏贵 on 便宜↔贵 is `position`, not `endLabel`
  assert.equal(C.checkClue('偏贵', CHEAP).reason, 'position');
  // allowed: 中 alone, 左 only as part of nothing
  assert.equal(C.checkClue('外婆家的饭', CHEAP).ok, true);
  assert.equal(C.checkClue('中午的太阳', CHEAP).ok, true, '中 alone is fine');
});

test('AC 87: rule 4 endLabel: the whole label, as a substring, either side, using the round\'s own labels', () => {
  assert.equal(rej('很贵', 'endLabel', CHEAP).hint, '别用刻度两头的词（便宜、贵）');
  rej('贵死了', 'endLabel', CHEAP);
  rej('超级便宜', 'endLabel', CHEAP);
  rej('热乎乎', 'endLabel', COLD);
  rej('很热', 'endLabel', COLD);
  rej('冷冷的', 'endLabel', COLD);
  assert.equal(rej('很热', 'endLabel', COLD).hint, '别用刻度两头的词（冷、热）');
  // the same words are fine on another spectrum
  assert.equal(C.checkClue('很贵', COLD).ok, true);
  assert.equal(C.checkClue('热乎乎', CHEAP).ok, true);
  // no labels given (client before the spectrum is known): the rule is skipped
  assert.equal(C.checkClue('很贵').ok, true);
  assert.equal(C.checkClue('很贵', {}).ok, true);
  // labels are folded like the clue
  assert.equal(C.checkClue('很贵', { leftLabel: ' 便 宜 ', rightLabel: ' 贵 ' }).reason, 'endLabel');
});

test('AC 87: rule 5 charset: Latin, kana, other scripts, ASCII symbols fail; the listed punctuation passes', () => {
  const hint = '只能用中文写提示';
  for (const t of ['coffee', 'wx', 'Hello', 'ｃｏｆｆｅｅ', 'こんにちは', 'привет', '好吃a', '好吃@', '好吃#', '好吃-好吃', '好吃.', '好吃,', '好吃/', '好吃(', '€']) assert.equal(rej(t, 'charset').hint, hint, t);
  for (const t of ['好，吃', '好、吃', '好。', '好！', '好？', '好…', '好·吃', '好～', '好~', '好!', '好?']) assert.equal(C.checkClue(t, CHEAP).ok, true, t);
  // a Latin word that is also a contact word is still `charset` (rule 5 comes first)
  rej('wechat', 'charset');
});

test('AC 87: rule 6 blocked: contact words, the blocklist and its exceptions', () => {
  const hint = '换个说法吧';
  for (const t of ['加我微信', '微信', '威信', '薇信', '加群', '群号', '电话', '手机号', '扣扣', '企鹅号', '私聊', '私信', '公众号', '网址', '链接', '加·我', '加 我', '傻逼', '习近平', '色情', '毒品']) assert.equal(rej(t, 'blocked').hint, hint, t);
  // everyday phrases the blocklist exceptions protect
  assert.equal(C.checkClue('学习总结', CHEAP).ok, true);
  assert.equal(C.checkClue('中共同参与', CHEAP).ok, true);
  assert.equal(C.checkClue('溜冰场', CHEAP).ok, true);
});

test('AC 87: the first failing rule decides (order: length, digit, position, endLabel, charset, blocked)', () => {
  assert.equal(C.checkClue('左边7', CHEAP).reason, 'digit');
  assert.equal(C.checkClue('左边很贵', CHEAP).reason, 'position');
  assert.equal(C.checkClue('很贵coffee', CHEAP).reason, 'endLabel');
  assert.equal(C.checkClue('coffee加我', CHEAP).reason, 'charset');
});

test('normalizeClue: NFKC fold (Chinese punctuation kept), whitespace and emoji removed; never throws on junk', () => {
  assert.equal(C.normalizeClue(' ５ ６ '), '56');
  assert.equal(C.normalizeClue('ＡＢＣ'), 'ABC');
  assert.equal(C.normalizeClue('好，吃！？…·～'), '好，吃！？…·～');
  assert.equal(C.normalizeClue('好​吃️'), '好吃');
  assert.equal(C.normalizeClue('😀'), '');
  assert.equal(C.normalizeClue(null), '');
  assert.equal(C.normalizeClue(undefined), '');
  assert.equal(C.normalizeClue(123), '');
  assert.equal(C.normalizeClue('a\u0000b'), 'a\u0000b');
  for (const junk of ['\ud800', '\udfff好', '𠀀𠀁', '́́', '￿']) assert.doesNotThrow(() => C.checkClue(junk, CHEAP), junk);
});

test('hint copy matches spec 6.12 (and hintFor accepts the spec\'s own reason names)', () => {
  assert.equal(C.hintFor('digits'), C.hintFor('digit'));
  assert.equal(C.hintFor('chars'), C.hintFor('charset'));
  assert.equal(C.hintFor('endLabel', CHEAP), '别用刻度两头的词（便宜、贵）');
  assert.equal(C.hintFor('endLabel'), '别用刻度两头的词');
  assert.equal(C.hintFor('empty'), '');
  assert.equal(C.REASON_ALIASES.digit, 'digits');
  assert.equal(C.REASON_ALIASES.charset, 'chars');
});

// ---- input validation ------------------------------------------------------------------------------------------------

test('input: setClue accepts preset and text, refuses chat and anything else; agreeRules / reportClue shapes', () => {
  const id = 'ABCDEFGH';
  assert.equal(V.setClue({ roundId: id, clueMode: 'chat' }).ok, false);
  assert.equal(V.setClue({ roundId: id, clueMode: 'free', clueText: 'x' }).ok, false);
  assert.equal(V.setClue({ roundId: id, clueMode: 'text' }).ok, false);
  assert.equal(V.setClue({ roundId: id, clueMode: 'text', clueText: 5 }).ok, false);
  assert.equal(V.setClue({ roundId: 'bad', clueMode: 'text', clueText: '好' }).ok, false);
  assert.equal(V.setClue({ roundId: id, clueMode: 'preset' }).ok, false);
  assert.deepEqual(V.setClue({ roundId: id, clueMode: 'text', clueText: '冬天的被窝', clueItemId: 's001i01', extra: 1 }).v, { roundId: id, clueMode: 'text', clueItemId: null, clueText: '冬天的被窝' });
  assert.deepEqual(V.setClue({ roundId: id, clueMode: 'preset', clueItemId: 's001i01', clueText: 'ignored' }).v, { roundId: id, clueMode: 'preset', clueItemId: 's001i01', clueText: null });
  assert.equal(V.setClue({ roundId: id, clueMode: 'text', clueText: 'x'.repeat(10000) }).v.clueText.length, 200, 'capped before the rules run');
  assert.deepEqual(V.agreeRules({ rulesVersion: 1 }), { ok: true, v: { rulesVersion: 1 } });
  assert.deepEqual(V.agreeRules({ version: 1 }), { ok: true, v: { rulesVersion: 1 } }, 'the spec name is accepted too');
  for (const bad of [{}, { rulesVersion: 2 }, { rulesVersion: '1' }, { rulesVersion: 0 }, null, 'x']) assert.equal(V.agreeRules(bad).ok, false, JSON.stringify(bad));
  for (const r of ['porn', 'politics', 'abuse', 'ads', 'other']) assert.equal(V.reportClue({ roundId: id, reason: r }).v.reason, r);
  assert.equal(V.reportClue({ roundId: id, reason: 'ad' }).v.reason, 'ads', 'chuanhua\'s spelling is read as ads');
  for (const bad of [{ roundId: id }, { roundId: id, reason: 'spam' }, { roundId: id, reason: 'unsuitable' }, { roundId: 'x', reason: 'porn' }, { reason: 'porn' }]) assert.equal(V.reportClue(bad).ok, false, JSON.stringify(bad));
});

test('errors: the new codes are known server codes with copy where the client shows a line', () => {
  for (const c of ['TEXT_REJECTED', 'TEXT_BLOCKED', 'MODERATION_BUSY', 'RULES_REQUIRED', 'RESTRICTED', 'UGC_PAUSED', 'DUP_REPORT', 'REPORT_LIMIT']) assert.ok(ERR.SERVER_CODES.includes(c), c);
  assert.equal(ERR.copyFor('TEXT_BLOCKED', 'setClue'), '这个提示没通过审核，换个说法吧');
  assert.equal(ERR.copyFor('MODERATION_BUSY', 'setClue'), '提示暂时没法检查，还没有发出去');
  assert.equal(ERR.copyFor('UGC_PAUSED', 'setClue'), '自己写提示暂时关闭，先选一个提示词吧');
  assert.equal(ERR.copyFor('RATE_LIMITED', 'setClue', 'day'), '今天检查提示的次数用完了，先选一个提示词吧');
  assert.equal(ERR.copyFor('RATE_LIMITED', 'setClue', 'minute'), '操作太频繁，请稍后再试');
});

// ---- strikes (AC 92) ---------------------------------------------------------------------------------------------------

test('AC 92: the strike ladder 1 warn / 2 = 24 h / 3 = 7 d / 4+ = 30 d + reviewFlag, over a rolling 30 days', () => {
  const T0 = Date.UTC(2026, 10, 5);
  const H = 3600e3;
  const D = 24 * H;
  let p = { _id: 'u', strikes: [] };
  let r = STK.applyStrike(p, T0);
  assert.equal(r.count, 1);
  assert.equal(r.player.warnPending, true);
  assert.equal(r.restrictMs, 0);
  assert.equal(STK.restrictionOf(r.player, T0), null);
  r = STK.applyStrike(r.player, T0 + D);
  assert.equal(r.count, 2);
  assert.equal(r.restrictedUntil, T0 + D + 24 * H);
  assert.deepEqual(STK.restrictionOf(r.player, T0 + D + 1), { level: 2, until: T0 + 2 * D, permanent: false });
  assert.equal(STK.restrictionOf(r.player, T0 + 2 * D + 1), null, 'over after 24 h');
  r = STK.applyStrike(r.player, T0 + 3 * D);
  assert.equal(r.count, 3);
  assert.equal(r.restrictedUntil, T0 + 3 * D + 7 * D);
  assert.equal(r.player.reviewFlag, undefined);
  r = STK.applyStrike(r.player, T0 + 4 * D);
  assert.equal(r.count, 4);
  assert.equal(r.restrictedUntil, T0 + 4 * D + 30 * D);
  assert.equal(r.player.reviewFlag, true);
  r = STK.applyStrike(r.player, T0 + 5 * D);
  assert.equal(r.count, 5);
  assert.equal(r.restrictedUntil, T0 + 5 * D + 30 * D, '4+ stays 30 days');
  assert.equal(r.player.strikes.length, 5);
  // a later, lighter strike never shortens a longer restriction
  const long = { strikes: [T0 - 40 * D], restrictedUntil: T0 + 100 * D };
  assert.equal(STK.applyStrike(long, T0).restrictedUntil, T0 + 100 * D);
  // the rolling window: strikes older than 30 days no longer count
  const old = STK.applyStrike({ strikes: [T0, T0 + D, T0 + 2 * D] }, T0 + 40 * D);
  assert.equal(old.count, 1);
  assert.equal(old.warn, true);
  // at most 10 timestamps are kept
  let many = { strikes: [] };
  for (let i = 0; i < 14; i++) many = STK.applyStrike(many.player || many, T0 + i * H);
  assert.equal(many.player.strikes.length, 10);
});

test('strikes: admin restrict / lift, permanent, restriction copy', () => {
  const T0 = Date.UTC(2026, 9, 16, 6, 0);
  const p = STK.restrict({ _id: 'u' }, { days: 3 }, T0);
  assert.equal(p.restrictedUntil, T0 + 3 * 86400e3);
  assert.equal(STK.restrictionOf(p, T0).permanent, false);
  const perm = STK.restrict(p, { permanent: true }, T0);
  assert.equal(STK.restrictionOf(perm, T0 + 1e12).permanent, true);
  assert.equal(STK.restrictionOf(STK.liftRestriction(perm, T0), T0), null);
  // a permanent restriction is not shortened by a strike
  assert.equal(STK.applyStrike(perm, T0).player.restrictedUntil, STK.FOREVER);
  assert.equal(STK.bjtText(Date.UTC(2026, 9, 17, 6, 0)), '10月17日 14:00');
  assert.equal(STK.restrictionText({ until: Date.UTC(2026, 9, 17, 6, 0), permanent: false }), '你暂时不能自己写提示（至 10月17日 14:00）。原因：多次写的提示未通过审核。如有疑问，请在「设置 · 联系我们」反馈。');
});

// ---- moderation decisions (AC 89, 90) -----------------------------------------------------------------------------------

test('AC 90: every WeChat answer maps fail-closed: only `pass` passes; risky strikes; review blocks (general only); everything else is busy', () => {
  assert.deepEqual(MOD.planOutcome('game', 'pass'), { outcome: 'pass' });
  assert.deepEqual(MOD.planOutcome('game', 'risky'), { outcome: 'blocked', strike: true });
  assert.deepEqual(MOD.planOutcome('general', 'risky'), { outcome: 'blocked', strike: true });
  assert.deepEqual(MOD.planOutcome('general', 'review'), { outcome: 'blocked', strike: false });
  assert.deepEqual(MOD.planOutcome('game', 'review'), { outcome: 'busy' }, 'the game interface has no `review`: an unknown value is an error');
  for (const s of [undefined, null, '', 'PASS', 'Pass', 'ok', 'normal', 'maybe', 0, 1, true, {}, [], 'pass ']) {
    assert.deepEqual(MOD.planOutcome('game', s), { outcome: 'busy' }, String(s));
    assert.deepEqual(MOD.planOutcome('general', s), { outcome: 'busy' }, String(s));
  }
});

test('moderation: env gate (prod forces live, mock in prod is SERVER_CONFIG), dev budget, mock words, call params', () => {
  assert.deepEqual(MOD.resolveEnv({ envKind: 'dev', mode: 'mock' }), { ok: true, envKind: 'dev', mode: 'mock' });
  assert.deepEqual(MOD.resolveEnv({ envKind: 'dev' }), { ok: true, envKind: 'dev', mode: 'live' });
  assert.deepEqual(MOD.resolveEnv({}), { ok: true, envKind: 'prod', mode: 'live' }, 'unset = prod');
  assert.deepEqual(MOD.resolveEnv({ envKind: 'staging', mode: 'live' }), { ok: true, envKind: 'prod', mode: 'live' }, 'unknown = prod');
  assert.equal(MOD.resolveEnv({ envKind: 'prod', mode: 'mock' }).code, 'SERVER_CONFIG');
  assert.equal(MOD.resolveEnv({ envKind: 'staging', mode: 'mock' }).code, 'SERVER_CONFIG', 'unknown kind + mock = prod + mock');
  assert.equal(MOD.resolveEnv({ envKind: 'dev', mode: 'weird' }).code, 'SERVER_CONFIG');
  assert.match(MOD.resolveEnv({ envKind: 'prod', mode: 'mock' }).alert, /^\[ALERT\]/);
  assert.equal(MOD.textBudgetAllows({ envKind: 'dev', mode: 'live' }, 79, 80), true);
  assert.equal(MOD.textBudgetAllows({ envKind: 'dev', mode: 'live' }, 80, 80), false);
  assert.equal(MOD.textBudgetAllows({ envKind: 'prod', mode: 'live' }, 9999, 80), true);
  assert.deepEqual(MOD.mockText('测试违规'), { suggest: 'risky' });
  assert.deepEqual(MOD.mockText('测试复审'), { suggest: 'review' });
  assert.deepEqual(MOD.mockText('测试繁忙'), { error: true });
  assert.deepEqual(MOD.mockText('冬天的被窝'), { suggest: 'pass' });
  assert.deepEqual(MOD.gameTextParams('冬天', 'oX'), { openid: 'oX', version: 2, scene: 3, content: '冬天' });
  assert.deepEqual(MOD.textCheckParams('冬天', 'oX'), { content: '冬天', version: 2, scene: 3, openid: 'oX' });
  assert.equal(MOD.isQuotaCode(750032), true);
  assert.equal(MOD.isQuotaCode('750033'), true);
  assert.equal(MOD.isQuotaCode(750031), false);
  assert.equal(MOD.busyAlert({ total: 19, busy: 19 }), false);
  assert.equal(MOD.busyAlert({ total: 20, busy: 9 }), false);
  assert.equal(MOD.busyAlert({ total: 20, busy: 10 }), true);
});

test('the mock words are valid clues (they must get past the local rules to reach the check)', () => {
  for (const w of ['测试违规', '测试复审', '测试繁忙']) assert.equal(C.checkClue(w, CHEAP).ok, true, w);
});

// ---- clue state at document level (AC 91, 94, 97) -------------------------------------------------------------------------

const ON = U.flags(null);
const round = (o) => ({ _id: 'ROUND234', hostOpenid: 'host', left: '便宜', right: '贵', status: 'open', guessCount: 0, createdAt: 1, ...o });

test('flags: everything on by default; malformed config is the default; textApi', () => {
  assert.deepEqual(U.flags(null), { createEnabled: true, viewEnabled: true, textApi: 'game' });
  assert.deepEqual(U.flags({ ugc: 'x', moderation: 5 }), { createEnabled: true, viewEnabled: true, textApi: 'game' });
  assert.deepEqual(U.flags({ ugc: { createEnabled: false }, moderation: { textApi: 'general' } }), { createEnabled: false, viewEnabled: true, textApi: 'general' });
  assert.equal(U.flags({ ugc: { viewEnabled: false } }).viewEnabled, false);
  assert.equal(U.flags({ ugc: { createEnabled: 0 } }).createEnabled, true, 'only an explicit false switches off');
});

test('AC 91/94/97: clue view: shown / hidden / paused / legacy chat / preset / draft', () => {
  const typed = round({ clueMode: 'text', clueText: '冬天的被窝' });
  assert.deepEqual(U.clueView(typed, ON), { mode: 'text', text: '冬天的被窝', hidden: false, state: 'shown' });
  assert.deepEqual(U.clueView({ ...typed, clueHidden: true }, ON), { mode: 'text', text: null, hidden: true, state: 'hidden' });
  assert.deepEqual(U.clueView(typed, { ...ON, viewEnabled: false }), { mode: 'text', text: null, hidden: true, state: 'paused' });
  assert.deepEqual(U.clueView({ ...typed, clueHidden: true }, { ...ON, viewEnabled: false }).state, 'hidden', 'hidden wins over paused');
  const preset = round({ clueMode: 'preset', clueText: '一杯咖啡' });
  assert.deepEqual(U.clueView(preset, { ...ON, viewEnabled: false }), { mode: 'preset', text: '一杯咖啡', hidden: false, state: 'shown' });
  assert.deepEqual(U.clueView(round({ clueMode: 'chat', clueText: null }), ON), { mode: 'chat', text: null, hidden: false, state: 'shown' });
  assert.deepEqual(U.clueView(round({ status: 'draft', clueMode: null }), ON), { mode: null, text: null, hidden: false, state: 'shown' });
  assert.equal(U.publicClueText(preset), '一杯咖啡');
  assert.equal(U.publicClueText(typed), null, 'a typed clue is never public text');
  assert.equal(U.publicClueText(round({ clueMode: 'chat' })), null);
});

test('AC 91: canReport / reportGate: only a shown typed clue, never the host, never twice, never a preset or legacy line', () => {
  const typed = round({ clueMode: 'text', clueText: '冬天的被窝' });
  assert.equal(U.canReport(typed, 'g', ON, false), true);
  assert.equal(U.canReport(typed, 'host', ON, false), false);
  assert.equal(U.canReport(typed, 'g', ON, true), false);
  assert.equal(U.canReport({ ...typed, clueHidden: true }, 'g', ON, false), false);
  assert.equal(U.canReport(typed, 'g', { ...ON, viewEnabled: false }, false), false);
  assert.equal(U.canReport(round({ clueMode: 'preset', clueText: 'x' }), 'g', ON, false), false);
  assert.equal(U.canReport(round({ clueMode: 'chat' }), 'g', ON, false), false);
  assert.deepEqual(U.reportGate(typed, 'g', ON), { ok: true, alreadyHidden: false });
  assert.deepEqual(U.reportGate(typed, 'host', ON), { ok: false, code: 'OWN_ROUND' });
  assert.deepEqual(U.reportGate(null, 'g', ON), { ok: false, code: 'ROUND_NOT_FOUND' });
  assert.deepEqual(U.reportGate({ ...typed, status: 'draft' }, 'g', ON), { ok: false, code: 'ROUND_NOT_FOUND' });
  assert.deepEqual(U.reportGate(round({ clueMode: 'preset', clueText: 'x' }), 'g', ON), { ok: false, code: 'INVALID_INPUT' });
  assert.deepEqual(U.reportGate(round({ clueMode: 'chat' }), 'g', ON), { ok: false, code: 'INVALID_INPUT' });
  assert.deepEqual(U.reportGate({ ...typed, clueHidden: true, clueHiddenBy: 'report' }, 'g', ON), { ok: true, alreadyHidden: true });
  assert.deepEqual(U.reportGate({ ...typed, clueHidden: true, clueHiddenBy: 'admin' }, 'g', ON), { ok: false, code: 'INVALID_INPUT' });
  assert.deepEqual(U.reportGate(typed, 'g', { ...ON, viewEnabled: false }), { ok: false, code: 'INVALID_INPUT' });
});

test('AC 88/98/99: textGate order: not found, host, state, hidden, identical text, UGC_PAUSED, RULES_REQUIRED, RESTRICTED, local rules', () => {
  const now = Date.UTC(2026, 10, 5);
  const agreed = { _id: 'host', rulesVersion: 1 };
  const draft = round({ status: 'draft', clueMode: null });
  const g = (o) => U.textGate({ round: draft, isHost: true, rawText: '冬天的被窝', fl: ON, player: agreed, nowMs: now, ...o });
  assert.deepEqual(g({}), { ok: true, same: false, text: '冬天的被窝' });
  assert.equal(g({ round: null }).code, 'ROUND_NOT_FOUND');
  assert.equal(g({ isHost: false }).code, 'NOT_HOST');
  for (const status of ['revealed', 'noGuesses']) assert.equal(g({ round: { ...draft, status } }).code, 'ROUND_EXPIRED');
  assert.equal(g({ round: { ...draft, status: 'open', guessCount: 1 } }).code, 'ROUND_EXPIRED');
  assert.equal(g({ round: { ...draft, status: 'open', guessCount: 0 } }).ok, true, 'an open round with no guess can be re-clued (TD-14)');
  assert.equal(g({ round: { ...draft, clueHidden: true } }).code, 'INVALID_INPUT');
  const stored = round({ status: 'open', clueMode: 'text', clueText: '冬天的被窝' });
  assert.deepEqual(g({ round: stored, rawText: ' 冬天 的被窝 ', fl: { ...ON, createEnabled: false }, player: null }), { ok: true, same: true }, 'identical text is ok even if rules/pause changed since');
  assert.equal(g({ fl: { ...ON, createEnabled: false }, player: null }).code, 'UGC_PAUSED');
  assert.equal(g({ player: null }).code, 'RULES_REQUIRED');
  assert.equal(g({ player: { _id: 'host' } }).code, 'RULES_REQUIRED');
  const restricted = { ...agreed, restrictedUntil: now + 1000 };
  const rr = g({ player: restricted });
  assert.deepEqual([rr.code, rr.until, rr.permanent], ['RESTRICTED', now + 1000, false]);
  assert.equal(g({ player: { ...agreed, restrictedUntil: now - 1 } }).ok, true, 'an expired restriction is over');
  assert.deepEqual([g({ player: { ...agreed, restrictPermanent: true } }).code, g({ player: { ...agreed, restrictPermanent: true } }).permanent], ['RESTRICTED', true]);
  assert.equal(g({ player: restricted, fl: { ...ON, createEnabled: false } }).code, 'UGC_PAUSED', 'pause before rules and restriction');
  const t = g({ rawText: '很贵' });
  assert.deepEqual([t.code, t.reason], ['TEXT_REJECTED', 'endLabel']);
  assert.equal(g({ rawText: '很贵', round: { ...draft, left: '冷', right: '热' } }).ok, true, 'the labels are the round\'s own');
  assert.equal(g({ rawText: '' }).reason, 'empty');
});

test('textGate/applyTextClue: the round opens with the stored clue and a moderation block; agreeRules is idempotent; takeCheck caps at 50 a day', () => {
  const now = Date.UTC(2026, 10, 5);
  const next = U.applyTextClue(round({ status: 'draft', clueMode: null }), '冬天的被窝', { api: 'game', suggest: 'pass', label: 100, traceId: 'T1' }, now);
  assert.deepEqual([next.status, next.clueMode, next.clueText, next.clueItemId], ['open', 'text', '冬天的被窝', null]);
  assert.deepEqual(next.clueMod, { api: 'game', suggest: 'pass', label: 100, traceId: 'T1', ts: now });
  const a = U.agreeRules(null, 'u', now);
  assert.equal(a.changed, true);
  assert.equal(a.player.rulesVersion, 1);
  assert.equal(a.player.rulesAt, now);
  assert.equal(a.player.curStreak, 0, 'a new player_stats carries the streak base fields');
  const b = U.agreeRules(a.player, 'u', now + 5000);
  assert.equal(b.changed, false);
  assert.equal(b.player.rulesAt, now, 'the first agreement time is kept');
  let ps = null;
  for (let i = 1; i <= 50; i++) {
    const r = U.takeCheck(ps, '20261105');
    assert.equal(r.ok, true, 'check ' + i);
    ps = { clueChecks: r.clueChecks };
  }
  assert.equal(U.takeCheck(ps, '20261105').ok, false, 'the 51st');
  assert.equal(U.takeCheck(ps, '20261106').ok, true, 'a new day resets');
});

test('admin helpers: hide / restore / delete', () => {
  const typed = round({ clueMode: 'text', clueText: '冬天的被窝' });
  const hidden = U.hideClue(typed, 'report', 5);
  assert.deepEqual([hidden.clueHidden, hidden.clueHiddenBy, hidden.clueHiddenAt], [true, 'report', 5]);
  const back = U.restoreClue(hidden);
  assert.equal(back.ok, true);
  assert.equal(back.round.clueHidden, false);
  assert.ok(!('clueHiddenBy' in back.round));
  const del = U.deleteClue(typed, 9);
  assert.deepEqual([del.clueText, del.clueHidden, del.clueHiddenBy], [null, true, 'admin']);
  assert.equal(U.restoreClue(del).ok, false, 'a deleted clue cannot come back');
  assert.deepEqual(U.clueView(del, ON), { mode: 'text', text: null, hidden: true, state: 'hidden' });
});

// ---- analytics (AC 77, 95) ---------------------------------------------------------------------------------------------------

test('AC 77/95: the typed-clue events exist with exactly the spec props; the server ones are not client events', () => {
  assert.deepEqual(EV.EVENTS.round_clue, ['roundId', 'clueMode', 'presetSwaps', 'chars?', 'tabSwitches?']);
  assert.deepEqual(EV.EVENTS.clue_tab, ['tab', 'via']);
  assert.deepEqual(EV.EVENTS.clue_result, ['result', 'reason?']);
  assert.deepEqual(EV.EVENTS.clue_check, ['api', 'suggest', 'label?', 'latencyMs', 'errCode?']);
  assert.deepEqual(EV.EVENTS.rules_view, ['source']);
  assert.deepEqual(EV.EVENTS.rules_agree, ['source']);
  assert.deepEqual(EV.EVENTS.clue_report, ['roundId', 'reason', 'result']);
  assert.deepEqual(EV.EVENTS.strike, ['cause', 'strikes30d']);
  assert.deepEqual(EV.EVENTS.restrict, ['cause', 'strikes30d', 'days?']);
  assert.deepEqual(EV.EVENTS.ugc_pause, ['createEnabled', 'viewEnabled']);
  for (const n of ['clue_check', 'strike', 'restrict', 'ugc_pause']) assert.ok(EV.SERVER_SIDE.includes(n) && !EV.CLIENT_EVENT_NAMES.includes(n), n);
  for (const n of ['round_clue', 'clue_tab', 'clue_result', 'rules_view', 'rules_agree', 'clue_report']) assert.ok(EV.CLIENT_EVENT_NAMES.includes(n), n);
});

test('AC 95: sanitizeProps drops anything that is not an enum, token, boolean or integer: a clue cannot ride in any prop', () => {
  const clue = '冬天的被窝';
  const sneaky = {};
  const every = new Set();
  Object.keys(EV.EVENTS).forEach((n) => EV.allowedProps(n).forEach((k) => every.add(k)));
  every.forEach((k) => {
    sneaky[k] = clue;
  });
  Object.keys(EV.EVENTS).forEach((n) => {
    const out = EV.sanitizeProps(n, { ...sneaky, extra: clue, text: clue, clueText: clue, traceId: 'T-1' });
    assert.ok(!JSON.stringify(out).includes('冬天'), n + ' leaked: ' + JSON.stringify(out));
    assert.ok(!JSON.stringify(out).includes('T-1'), n);
  });
  // the same with fragments of two characters and numbers/objects in every slot
  Object.keys(EV.EVENTS).forEach((n) => {
    const out = EV.sanitizeProps(n, Object.fromEntries(Array.from(every).map((k) => [k, { text: clue }])));
    assert.deepEqual(out, {}, n);
  });
  assert.deepEqual(EV.sanitizeProps('round_clue', { roundId: 'ABCDEFGH', clueMode: 'text', presetSwaps: 0, chars: 5, tabSwitches: 1 }), { roundId: 'ABCDEFGH', clueMode: 'text', presetSwaps: 0, chars: 5, tabSwitches: 1 });
  for (const bad of [0, 13, 5.5, '5', -1, null, [5]]) assert.ok(!('chars' in EV.sanitizeProps('round_clue', { roundId: 'ABCDEFGH', clueMode: 'text', presetSwaps: 0, chars: bad })) || bad === null, 'chars ' + JSON.stringify(bad));
  assert.equal(EV.sanitizeProps('round_clue', { roundId: 'ABCDEFGH', clueMode: 'chat', presetSwaps: 0 }).clueMode, undefined, "'chat' is no longer a clue mode");
  assert.deepEqual(EV.sanitizeProps('clue_result', { result: 'rejected', reason: 'digit' }), { result: 'rejected', reason: 'digit' });
  assert.deepEqual(EV.sanitizeProps('clue_result', { result: 'rejected', reason: '冬天' }), { result: 'rejected' });
  assert.deepEqual(EV.sanitizeProps('daily_card_reveal', { dateKey: '20261105', idx: 0, d: 3, score: 90, label: '很同频', hasGroup: false, n: 5 }).label, '很同频');
  assert.equal(EV.sanitizeProps('daily_card_reveal', { dateKey: '20261105', idx: 0, label: '冬天的被窝' }).label, undefined, 'label is a known score label, never free text');
});
