/** Small shared helpers (pure). */

function uuid() {
  const hex = '0123456789abcdef';
  let s = '';
  for (let i = 0; i < 24; i++) s += hex[Math.floor(Math.random() * 16)];
  return s;
}

function clone(x) {
  return x === undefined ? undefined : JSON.parse(JSON.stringify(x));
}

/** Whole hours left, rounded up, as '还剩 31 小时' (under an hour: '还剩不到 1 小时'). */
function timeLeftText(ms) {
  if (ms <= 0) return null;
  if (ms < 3600e3) return '还剩不到 1 小时';
  return '还剩 ' + Math.ceil(ms / 3600e3) + ' 小时';
}

/** '用时 5 小时' / '用时 20 分钟' / '用时不到 1 分钟'. */
function durationText(ms) {
  if (ms < 60e3) return '用时不到 1 分钟';
  if (ms < 3600e3) return '用时 ' + Math.round(ms / 60e3) + ' 分钟';
  return '用时 ' + Math.round(ms / 3600e3) + ' 小时';
}

/** 2315 -> '2,315' */
function thousands(n) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** '10月15日' from a 'YYYYMMDD' key. */
function dateText(key) {
  return +key.slice(4, 6) + '月' + +key.slice(6, 8) + '日';
}

module.exports = { uuid, clone, timeLeftText, durationText, thousands, dateText };
