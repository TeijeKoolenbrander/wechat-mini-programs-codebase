'use strict';
/**
 * Text rules for custom prompts (2-12) and descriptions (2-16), spec 5.6 / PO-12. Shared by the client (input
 * filtering, button state) and the cloud functions (the authority). Pure JS, no wx.
 *
 *   inputFilter(raw, kind)  -> {text, dropped}   client: drop disallowed characters while typing, clip to the max
 *   validate(raw, kind)     -> {ok:true, text} | {ok:false, reason}   server (and client before submit)
 *   validCharCount(raw)     -> number of valid code points (auto-submit rule: >= 2)
 *
 * A rejection `reason` is one of: length chars digits url contact handle blocklist. Every reason maps to the
 * error code TEXT_REJECTED ("换个说法吧"): the API was never called, no strike (AC 34, 35).
 */

const { CONFIG } = require('./config');
const blocklist = require('./content/blocklist.v1');

const KINDS = {
  prompt: { min: CONFIG.text.promptMin, max: CONFIG.text.promptMax },
  describe: { min: CONFIG.text.describeMin, max: CONFIG.text.describeMax },
};

const PUNCT = new Set(['，', '。', '！', '？', '、', '…', '—', '·', '~', '～', ',', '.', '!', '?', '-']);

function codePoints(s) {
  return Array.from(String(s === undefined || s === null ? '' : s));
}

function count(s) {
  return codePoints(s).length;
}

/** fullwidth letters/digits -> ASCII (everything else untouched) */
function foldFullwidthAlnum(ch) {
  const c = ch.codePointAt(0);
  if ((c >= 0xff10 && c <= 0xff19) || (c >= 0xff21 && c <= 0xff3a) || (c >= 0xff41 && c <= 0xff5a)) return String.fromCharCode(c - 0xfee0);
  return ch;
}

function isCjk(c) {
  return (c >= 0x4e00 && c <= 0x9fff) || (c >= 0x3400 && c <= 0x4dbf) || c === 0x3007;
}

/** Allowed after folding: CJK, ASCII letters and digits, the listed punctuation, a plain space. */
function isAllowed(ch) {
  const c = ch.codePointAt(0);
  if (isCjk(c)) return true;
  if ((c >= 0x30 && c <= 0x39) || (c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a)) return true;
  if (ch === ' ') return true;
  return PUNCT.has(ch);
}

/**
 * Remove emoji and other disallowed characters, fold fullwidth letters/digits, turn any whitespace into one
 * space and collapse runs. Does not trim (so typing a space between words works) unless {trim:true}.
 */
function sanitize(raw, opts) {
  const out = [];
  for (const ch0 of codePoints(raw)) {
    let ch = foldFullwidthAlnum(ch0);
    if (/\s/.test(ch) || ch === '　') ch = ' ';
    if (!isAllowed(ch)) continue;
    if (ch === ' ' && out[out.length - 1] === ' ') continue;
    out.push(ch);
  }
  let s = out.join('');
  if (opts && opts.trim) s = s.trim();
  return s;
}

/** Client input filter: sanitize, then clip to the maximum for `kind`. `dropped` is true when something was removed or clipped. */
function inputFilter(raw, kind) {
  const k = KINDS[kind];
  const before = codePoints(raw);
  let cps = codePoints(sanitize(raw));
  if (k && cps.length > k.max) cps = cps.slice(0, k.max);
  const text = cps.join('');
  return { text, dropped: cps.length !== before.length };
}

/** Number of valid code points of `raw` once sanitized and trimmed (the auto-submit rule counts this, 8.5). */
function validCharCount(raw) {
  return count(sanitize(raw, { trim: true }));
}

// ---- matching helpers -------------------------------------------------------------------------------------

/** NFKC, lower-case, and "。" read as "." so dotted domains written with Chinese full stops are caught. */
function nfkcLower(raw) {
  let s = String(raw === undefined || raw === null ? '' : raw);
  try {
    s = s.normalize('NFKC');
  } catch (e) {
    /* very old runtimes: keep as is */
  }
  return s.toLowerCase().replace(/[。．｡]/g, '.');
}

/** ASCII letters/digits and CJK only, everything else dropped: the form the blocklist is matched on (no \p{} escapes: older JavaScriptCore) */
function flat(s) {
  return s.replace(/[^0-9a-z㐀-䶿一-鿿〇豈-﫿]/g, '');
}

const NUMERAL = '0-9零〇一二三四五六七八九壹贰叁肆伍陆柒捌玖幺';
const RE_NUMERAL_RUN = new RegExp('[' + NUMERAL + ']{5,}');
const RE_URL = /(https?:|ftp:|www\.|\b[a-z0-9-]+\.(com|cn|net|org|cc|top|xyz|io|me|tv|vip|info|app|link|co|biz|club|site|shop|ink|ly|gl)\b)/;
const RE_URL_ZH = /点\s*(com|cn|net|org|cc)\b/;
const CONTACT_ZH = [
  '微信', '薇信', '威信', '微芯', '加我', '加v', '加微', '加q', '加群', '扣扣', '企鹅号', '群号', '电话', '手机号', '联系我', '联系方式', '私聊', '私信', '公众号', '抖音号', 'v信',
  // QA-5 homophones and "me" forms: v我 薇我 加薇 威我 Q群 dd我(滴滴我) 私我 戳我 扣我 q我
  'v我', '薇我', '加薇', '威我', '加威', 'q群', 'dd我', '滴滴我', '滴我', '私我', '戳我', '扣我', 'q我', '薇芯', '威芯',
];
const CONTACT_TOKENS = ['wx', 'vx', 'qq', 'weixin', 'wechat', 'whatsapp', 'telegram', 'weixing', 'wexin'];

/**
 * Latin letter-runs with their start/end offsets, plus every run sequence of 2 to 6 consecutive runs separated only by
 * punctuation or spaces, joined ("w x" -> "wx", "wei xin" -> "weixin", "s.b" -> "sb"). A digit or CJK character between
 * two runs breaks the sequence. Used for whole-word Latin matching so spacing cannot split a token.
 */
function latinWords(s) {
  const re = /[a-z]+/g;
  const runs = [];
  let m;
  while ((m = re.exec(s))) runs.push({ t: m[0], a: m.index, b: m.index + m[0].length });
  const words = runs.map((r) => r.t);
  for (let i = 0; i < runs.length; i++) {
    let joined = runs[i].t;
    for (let j = i + 1; j < runs.length && j <= i + 5; j++) {
      if (!/^[^a-z0-9㐀-䶿一-鿿〇豈-﫿]+$/.test(s.slice(runs[j - 1].b, runs[j].a))) break;
      joined += runs[j].t;
      words.push(joined);
    }
  }
  return words;
}

/** Contact, ad and number patterns (5.6). Returns {reason} or null. `raw` is the unsanitized client text. */
function contactHit(raw) {
  const s = nfkcLower(raw);
  if (/@/.test(s)) return { reason: 'handle' };
  const digits = (s.match(/[0-9]/g) || []).length;
  const f = flat(s);
  if (digits >= CONFIG.text.digitsReject || RE_NUMERAL_RUN.test(f)) return { reason: 'digits' };
  if (RE_URL.test(s) || RE_URL_ZH.test(s)) return { reason: 'url' };
  for (const w of CONTACT_ZH) if (f.includes(w)) return { reason: 'contact' };
  const runs = latinWords(s);
  for (const t of CONTACT_TOKENS) if (runs.includes(t)) return { reason: 'contact' };
  return null;
}

/** Blocklist (content/blocklist.v1.js). Returns {category, term} or null. */
function blocklistHit(raw) {
  const s = nfkcLower(raw);
  let f = flat(s);
  for (const e of blocklist.exceptions || []) if (f.includes(e)) f = f.split(e).join(' ');
  for (const cat of Object.keys(blocklist.zh)) {
    for (const term of blocklist.zh[cat]) if (f.includes(term)) return { category: cat, term };
  }
  const runs = latinWords(s);
  const letters = s.replace(/[^a-z]/g, '');
  for (const cat of Object.keys(blocklist.latin.token)) {
    for (const t of blocklist.latin.token[cat]) if (runs.includes(t)) return { category: cat, term: t };
  }
  for (const cat of Object.keys(blocklist.latin.contains)) {
    for (const t of blocklist.latin.contains[cat]) if (letters.includes(t)) return { category: cat, term: t };
  }
  return null;
}

/**
 * Full validation (server authority; the client runs it before enabling the submit button).
 * Order: contact/number patterns, blocklist, characters, length. The text must already be in the sanitized form
 * a conforming client sends: the server never edits text, it rejects ('chars').
 */
function validate(raw, kind) {
  const k = KINDS[kind];
  if (!k) return { ok: false, reason: 'length' };
  if (typeof raw !== 'string') return { ok: false, reason: 'chars' };
  if (raw.length > 400) return { ok: false, reason: 'length' }; // cheap guard before the regexes
  const c = contactHit(raw);
  if (c) return { ok: false, reason: c.reason };
  const b = blocklistHit(raw);
  if (b) return { ok: false, reason: 'blocklist', category: b.category };
  const trimmed = raw.trim();
  if (sanitize(trimmed) !== trimmed) return { ok: false, reason: 'chars' };
  const n = count(trimmed);
  if (n < k.min || n > k.max) return { ok: false, reason: 'length' };
  return { ok: true, text: trimmed };
}

module.exports = {
  KINDS, codePoints, count, sanitize, inputFilter, validCharCount, validate, contactHit, blocklistHit, nfkcLower, flat, isAllowed,
};
