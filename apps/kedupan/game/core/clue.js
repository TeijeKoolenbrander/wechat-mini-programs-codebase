'use strict';
/**
 * Typed-clue rules (spec 6.12, D-2, AC 87-88). ONE module shared by the client (button state, inline hint) and the
 * cloud functions (the authority, `TEXT_REJECTED`), with a drift test as core/score.js. Pure JS, no wx.
 *
 *   normalizeClue(text)                  -> string   NFKC full-width fold (Chinese punctuation kept), every whitespace
 *                                                    character removed, emoji and zero-width characters stripped
 *   checkClue(text, {leftLabel,rightLabel}) -> {ok:true, text} | {ok:false, reason, hint}
 *   CLUE_MAX = 12, RULE_LINE, CLUE_RULES_VERSION = 1
 *
 * `reason` is one of: empty length digit position endLabel charset blocked. (The spec table names two of them
 * `digits` and `chars`; the client contract of this build uses `digit` and `charset`; REASON_ALIASES maps both ways.)
 * Rules run in this order and the FIRST failure decides the hint:
 *   1 length    1-12 code points after normalising         (empty -> `empty`, no hint; over 12 -> `length`)
 *   2 digit     any number character, a run of 2+ Chinese numerals, a numeral before 成/格/度/分 (not 分钟, 分钱), a lone 〇
 *   3 position  ruler and position words (content/clue-words.v1.js)
 *   4 endLabel  the clue contains the round's left or right label
 *   5 charset   only CJK ideographs and the punctuation  ，、。！？…·～~!?
 *   6 blocked   blocklist (content/blocklist.v1.js, with exceptions) and contact words
 * A local rejection never costs a strike and never calls WeChat.
 */

const words = require('./content/clue-words.v1');
const text = require('./text');

const CLUE_MAX = 12;
const CLUE_RULES_VERSION = 1;
const RULE_LINE = '最多 12 个字 · 不写数字、位置和两头的词';

/** reason (this build) -> the spec table's name, and back */
const REASON_ALIASES = { digit: 'digits', charset: 'chars', digits: 'digit', chars: 'charset' };
const REASONS = ['empty', 'length', 'digit', 'position', 'endLabel', 'charset', 'blocked'];

/** characters whose NFKC form would change how they read or count: kept as typed (Chinese punctuation, the ellipsis) */
const KEEP = '，、。！？…·～';
/** emoji, pictographs, variation selectors, zero-width characters: removed, never an error (the keyboard drops them as typed) */
const STRIP = /^[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FE0F}\u{200B}-\u{200D}\u{2060}\u{FEFF}\u{20E3}\u{E0020}-\u{E007F}\u{2190}-\u{21FF}\u{2300}-\u{23FF}\u{25A0}-\u{25FF}\u{2900}-\u{297F}\u{3030}\u{303D}\u{3297}\u{3299}\u{00A9}\u{00AE}]$/u;
const SPACE = /\s/g;

let RE_NUMBER;
try {
  RE_NUMBER = new RegExp('\\p{N}', 'u');
} catch (e) {
  // very old JavaScriptCore without property escapes: the common number blocks
  RE_NUMBER = /[0-9²³¹¼-¾٠-٩۰-۹०-९⁰-⁹₀-₉⅐-↉①-⒛⓪-⓿❶-➓〇〡-〩〸-〺㈠-㈩㉈-㉏㉑-㉟㊀-㊉㊱-㊿０-９]/;
}
const RE_NUMERAL_RUN = /[零〇一二两三四五六七八九十百壹贰叁肆伍陆柒捌玖]{2,}/;
const NUMERALS = '零〇一二两三四五六七八九十百半几';
const NUMERAL_SUFFIX = '成格度分';
const CJK = /^[㐀-䶿一-鿿]$/;
const PERCENT = /[%‰]/;
const PUNCT_OK = '，、。！？…·～~!?';

function chars(s) {
  return Array.from(String(s === undefined || s === null ? '' : s));
}

/** The text without the allowed punctuation (the form the contact-word check also sees). */
function dropPunct(s) {
  return chars(s).filter((ch) => PUNCT_OK.indexOf(ch) < 0).join('');
}

/** Strip emoji / zero-width characters and every whitespace character, WITHOUT folding (the form the \p{N} check also sees). */
function stripOnly(raw) {
  if (typeof raw !== 'string') return '';
  return chars(raw).filter((ch) => !STRIP.test(ch)).join('').replace(SPACE, '');
}

/**
 * The clue as it is checked and (if it passes) stored and sent to WeChat: NFKC per character so ５ is a digit and
 * full-width letters are Latin (Chinese punctuation is kept as typed), whitespace removed, emoji stripped.
 */
function normalizeClue(raw) {
  if (typeof raw !== 'string') return '';
  let out = '';
  chars(raw).forEach((ch) => {
    if (STRIP.test(ch)) return;
    if (KEEP.indexOf(ch) >= 0) {
      out += ch;
      return;
    }
    let f = ch;
    try {
      f = ch.normalize('NFKC');
    } catch (e) {
      /* keep as is */
    }
    out += f;
  });
  return out.replace(SPACE, '');
}

/** Rule 2: does the clue state a number? `pre` = stripped but unfolded (sees Ⅻ before NFKC turns it into letters). */
function hasDigit(pre, norm) {
  if (RE_NUMBER.test(pre) || RE_NUMBER.test(norm)) return true;
  if (RE_NUMERAL_RUN.test(norm)) return true;
  const cs = chars(norm);
  for (let i = 0; i + 1 < cs.length; i++) {
    if (NUMERALS.indexOf(cs[i]) < 0 || NUMERAL_SUFFIX.indexOf(cs[i + 1]) < 0) continue;
    if (cs[i + 1] === '分' && (cs[i + 2] === '钟' || cs[i + 2] === '钱')) continue; // 一分钟, 一分钱
    return true;
  }
  return false;
}

/** Rule 3 */
function positionWord(norm) {
  for (const w of words.position) if (norm.indexOf(w) >= 0) return w;
  return null;
}

/** Rule 4: the label folded exactly like the clue; an empty label never matches. */
function endLabelHit(norm, labels) {
  const l = normalizeClue(labels && labels.leftLabel);
  const r = normalizeClue(labels && labels.rightLabel);
  if (l && norm.indexOf(l) >= 0) return l;
  if (r && norm.indexOf(r) >= 0) return r;
  return null;
}

/** Rule 5 */
function charsetOk(norm) {
  return chars(norm).every((ch) => CJK.test(ch) || PUNCT_OK.indexOf(ch) >= 0);
}

/** Rule 6 */
function blockedHit(norm) {
  return !!(text.blocklistHit(norm) || text.containsAny(norm, words.contact));
}

/** Inline hint copy (spec 6.12) for a reason; `labels` fills the end-label hint. */
function hintFor(reason, labels) {
  switch (reason) {
    case 'length':
      return '最多 12 个字';
    case 'digit':
    case 'digits':
      return '提示里不能有数字哦';
    case 'position':
      return '别直接说位置，换个说法吧';
    case 'endLabel': {
      const l = labels && labels.leftLabel;
      const r = labels && labels.rightLabel;
      return l && r ? '别用刻度两头的词（' + l + '、' + r + '）' : '别用刻度两头的词';
    }
    case 'charset':
    case 'chars':
      return '只能用中文写提示';
    case 'blocked':
      return '换个说法吧';
    default:
      return ''; // empty: the button is disabled, no hint
  }
}

/**
 * Check a typed clue against every local rule.
 * @param {*} raw what the host typed
 * @param {{leftLabel?:string,rightLabel?:string}} [labels] the round's end labels (the server passes the stored ones)
 * @returns {{ok:true,text:string}|{ok:false,reason:string,hint:string}}
 */
function checkClue(raw, labels) {
  const fail = (reason) => ({ ok: false, reason, hint: hintFor(reason, labels) });
  if (typeof raw !== 'string') return fail('empty');
  if (raw.length > 400) return fail('length'); // cheap guard before the regexes
  const norm = normalizeClue(raw);
  const n = chars(norm).length;
  if (n === 0) return fail('empty');
  if (n > CLUE_MAX) return fail('length');
  // a percent sign is a position word even next to digits: 50% -> position (AC 87), while 70 -> digit
  if (PERCENT.test(norm)) return fail('position');
  // rules 2 and 3 also run on the text with the allowed punctuation removed, so 七，十 / 七·十 / 中·间 do not slip through
  const flat = dropPunct(norm);
  if (hasDigit(dropPunct(stripOnly(raw)), norm) || (flat !== norm && hasDigit(flat, flat))) return fail('digit');
  if (positionWord(norm) || (flat !== norm && positionWord(flat))) return fail('position');
  if (endLabelHit(norm, labels)) return fail('endLabel');
  if (!charsetOk(norm)) return fail('charset');
  if (blockedHit(norm)) return fail('blocked');
  return { ok: true, text: norm };
}

/** Number of code points of the clue as the server counts it (the counter "n/12" of the client). */
function clueLength(raw) {
  return chars(normalizeClue(raw)).length;
}

module.exports = { CLUE_MAX, CLUE_RULES_VERSION, RULE_LINE, REASONS, REASON_ALIASES, normalizeClue, checkClue, hintFor, clueLength };
