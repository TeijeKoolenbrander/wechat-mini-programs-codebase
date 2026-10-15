/**
 * Text rules for custom prompts (2-12) and descriptions (2-16) (spec 5.6, PO-12). Pure; shared.
 *
 *   countCp(str)            code points
 *   sanitize(str, maxCp)    what the input box keeps: allowed characters only, full-width ASCII folded, capped
 *   check(str, kind)        kind 'prompt' | 'desc' -> { ok:true, text } | { ok:false, code:'TEXT_REJECTED', reason, message }
 *                           reasons: length chars contact blocklist
 *   matchContact(str)       null | 'digits' | 'url' | 'word' | 'handle'
 *   matchBlocklist(str)     null | { category, term }
 *
 * Local rejections never call a moderation API and never give a strike (message "换个说法吧").
 */

const { CONFIG } = require('./config');
const blocklist = require('./content/blocklist.v1');

const REJECT_MESSAGE = '换个说法吧';
const ALLOWED_PUNCT = '，。！？、…—·~,.!?-\' ';

function countCp(str) {
  return Array.from(String(str === undefined || str === null ? '' : str)).length;
}

/** Fold full-width ASCII (U+FF01-FF5E) to ASCII, the ideographic space to a space. */
function fold(str) {
  let out = '';
  for (const ch of String(str)) {
    const c = ch.codePointAt(0);
    if (c >= 0xff01 && c <= 0xff5e) {
      // keep the full-width punctuation we allow (，。！？、) as is: those are above 0xff5e or outside this folding use
      const ascii = String.fromCharCode(c - 0xfee0);
      out += /[0-9A-Za-z]/.test(ascii) ? ascii : ch;
    } else if (c === 0x3000) out += ' ';
    else out += ch;
  }
  return out;
}

function isCjk(c) {
  return (c >= 0x4e00 && c <= 0x9fff) || (c >= 0x3400 && c <= 0x4dbf);
}

function allowedChar(ch) {
  const c = ch.codePointAt(0);
  if (isCjk(c)) return true;
  if (/[0-9A-Za-z]/.test(ch)) return true;
  return ALLOWED_PUNCT.indexOf(ch) >= 0 || ch === '，' || ch === '。' || ch === '！' || ch === '？' || ch === '、';
}

/** Keep allowed characters only (emoji and other symbols dropped), fold full-width alnum, cap at maxCp code points. */
function sanitize(str, maxCp) {
  const out = [];
  for (const ch of fold(str)) {
    if (!allowedChar(ch)) continue;
    out.push(ch);
    if (maxCp && out.length >= maxCp) break;
  }
  return out.join('');
}

const CN_DIGITS = '零〇一二三四五六七八九幺';
const CONTACT_WORDS = ['微信', '薇信', '威信', '加我', '群号', '电话', '手机号', '联系方式', '加群', '企鹅号'];

/** Reason why text looks like contact/ad info, or null. */
function matchContact(str) {
  const s = fold(str);
  const lower = s.toLowerCase();
  let digits = 0;
  for (const ch of s) if (ch >= '0' && ch <= '9') digits++;
  if (digits >= 5) return 'digits';
  let run = 0;
  for (const ch of s) {
    if (CN_DIGITS.indexOf(ch) >= 0) {
      run++;
      if (run >= 5) return 'digits';
    } else run = 0;
  }
  if (/https?:|www\.|\.(com|cn|net|org|cc|top|xyz|io|me|co|info|vip|cn)\b|[a-z0-9-]+\.[a-z]{2,}\/?/.test(lower)) return 'url';
  if (/[@＠]/.test(s)) return 'handle';
  const compact = lower.replace(/[\s.,!?~\-'，。！？、…—·]/g, '');
  if (/wx|vx|qq/.test(compact)) return 'word';
  for (const w of CONTACT_WORDS) if (compact.indexOf(w) >= 0) return 'word';
  return null;
}

function normalizeForBlocklist(str) {
  return fold(str).toLowerCase().replace(/[\s.,!?~\-'，。！？、…—·]/g, '');
}

function matchBlocklist(str) {
  const s = normalizeForBlocklist(str);
  for (const cat of Object.keys(blocklist.categories)) {
    for (const term of blocklist.categories[cat]) if (s.indexOf(term.toLowerCase()) >= 0) return { category: cat, term };
  }
  return null;
}

function limits(kind) {
  return kind === 'prompt' ? [CONFIG.text.promptMin, CONFIG.text.promptMax] : [CONFIG.text.descMin, CONFIG.text.descMax];
}

/** Full local check. The returned `text` is the trimmed, sanitized string to send. */
function check(str, kind) {
  const [min, max] = limits(kind);
  const raw = fold(String(str === undefined || str === null ? '' : str)).trim();
  const fail = (reason) => ({ ok: false, code: 'TEXT_REJECTED', reason, message: REJECT_MESSAGE });
  if (matchContact(raw)) return fail('contact');
  if (matchBlocklist(raw)) return fail('blocklist');
  for (const ch of raw) if (!allowedChar(ch)) return fail('chars');
  const text = raw.replace(/\s+/g, ' ');
  const n = countCp(text);
  if (n < min || n > max) return fail('length');
  return { ok: true, text };
}

module.exports = { countCp, sanitize, check, matchContact, matchBlocklist, fold, REJECT_MESSAGE };
