'use strict';
// Server-side text rules (spec 5.6). The server is the authority: a modified client can skip the
// client-side filter, so everything is re-checked here before any msgSecCheck call.
const ALLOWED = /^[一-鿿㐀-䶿A-Za-z0-9０-９ ，。！？、…—·~,.!?\-]+$/;
const DIGIT = /[0-9０-９]/g;
const CN_NUM_RUN = /[零〇一二三四五六七八九]{5,}/;
const CONTACT = /wx|vx|v信|微信|威信|薇信|加我|qq|扣扣|群号|电话|手机号|whatsapp|telegram/i;
const URLISH = /(https?:|www\.|[a-z0-9-]{2,}\.(com|cn|net|org|top|xyz|cc|io|me|co|tv|info|vip)\b)/i;
const STRIP_FOR_MATCH = /[\s　，。！？、…—·~,.!?\-]/g;

function codePoints(s) {
  return Array.from(s);
}

/**
 * @param {*} raw
 * @param {{min:number,max:number,blocklist?:string[]}} o
 * @returns {{ok:true,text:string}|{ok:false,reason:string}}
 */
function validateText(raw, { min, max, blocklist = [] }) {
  if (typeof raw !== 'string') return { ok: false, reason: 'type' };
  const text = raw.trim();
  const len = codePoints(text).length;
  if (len < min || len > max) return { ok: false, reason: 'length' };
  if (!ALLOWED.test(text)) return { ok: false, reason: 'chars' };
  const digits = text.match(DIGIT);
  if (digits && digits.length >= 5) return { ok: false, reason: 'digits' };
  if (CN_NUM_RUN.test(text)) return { ok: false, reason: 'digits' };
  if (CONTACT.test(text.replace(/\s/g, ''))) return { ok: false, reason: 'contact' };
  if (URLISH.test(text)) return { ok: false, reason: 'url' };
  const flat = text.replace(STRIP_FOR_MATCH, '').toLowerCase();
  for (const w of blocklist) if (w && flat.includes(String(w).toLowerCase())) return { ok: false, reason: 'blocklist' };
  return { ok: true, text };
}

module.exports = { validateText, codePoints };
