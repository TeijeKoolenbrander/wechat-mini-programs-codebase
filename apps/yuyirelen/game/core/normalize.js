/**
 * Typed-input normalisation (spec 4.2, PO-25, edge cases 5-6). Pure.
 * trim; remove spaces and punctuation; full-width -> half-width; traditional -> simplified per character.
 * Letters and digits are kept (they simply will not be in the vocabulary).
 */

const STRIP = /[\s!-\/:-@\[-`{-~ -¿ -⁯　-〿]/g;

function halfWidth(s) {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 0x3000) out += ' ';
    else if (c >= 0xff01 && c <= 0xff5e) out += String.fromCharCode(c - 0xfee0);
    else out += s[i];
  }
  return out;
}

function normalizeInput(raw, t2s) {
  if (raw === undefined || raw === null) return '';
  const s = halfWidth(String(raw)).replace(STRIP, '');
  if (!t2s) return s;
  let out = '';
  for (const ch of Array.from(s)) out += Object.prototype.hasOwnProperty.call(t2s, ch) ? t2s[ch] : ch;
  return out;
}

module.exports = { normalizeInput, halfWidth };
