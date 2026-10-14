/** Small shared helpers (pure). */

const NUM = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'];

/** 0-12 as a Chinese numeral. */
function cn(n) {
  return NUM[n] !== undefined ? NUM[n] : String(n);
}

/** { w, l } -> "十胜二负" */
function recordText(r) {
  return cn(r.w) + '胜' + cn(r.l) + '负';
}

/** { w, l } -> "10-2" */
function recordShort(r) {
  return r.w + '-' + r.l;
}

/** { w, l } -> "10胜2负" */
function recordDigits(r) {
  return r.w + '胜' + r.l + '负';
}

/** Win chance as 成: 0.72 -> "七成". */
function chanceText(p) {
  return cn(Math.max(0, Math.min(10, Math.round(p * 10)))) + '成';
}

const LUCK = { ji: '吉', ping: '平', xiong: '凶' };

function uuid() {
  const hex = '0123456789abcdef';
  let s = '';
  for (let i = 0; i < 24; i++) s += hex[Math.floor(Math.random() * 16)];
  return s;
}

function clone(x) {
  return x === undefined ? undefined : JSON.parse(JSON.stringify(x));
}

module.exports = { cn, recordText, recordShort, recordDigits, chanceText, LUCK, uuid, clone };
