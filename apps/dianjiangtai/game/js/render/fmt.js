/** Small formatting helpers the renderers share. Pure. */

const CN = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'];

function cnNum(n) {
  return CN[n] !== undefined ? CN[n] : String(n);
}

/** "十胜二负" (verdict, share card). */
function recordCn(rec) {
  if (!rec) return '';
  return cnNum(rec.w) + '胜' + cnNum(rec.l) + '负';
}

/** "10胜2负" (compact lines). */
function recordDigits(rec) {
  if (!rec) return '';
  return rec.w + '胜' + rec.l + '负';
}

/** "10-2" (comparison blocks). */
function recordDash(rec) {
  if (!rec) return '';
  return rec.w + '-' + rec.l;
}

/** "20261014" or "2026-10-14" -> "10月14日". */
function dateText(key) {
  const d = String(key || '').replace(/\D/g, '');
  if (d.length < 8) return '';
  return Number(d.slice(4, 6)) + '月' + Number(d.slice(6, 8)) + '日';
}

module.exports = { cnNum, recordCn, recordDigits, recordDash, dateText };
