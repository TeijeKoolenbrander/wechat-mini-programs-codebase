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

/** '20261014' -> '10月14日' */
function dateText(dateKey) {
  return Number(dateKey.slice(4, 6)) + '月' + Number(dateKey.slice(6, 8)) + '日';
}

/** '20261014' -> '10/14' */
function dateShort(dateKey) {
  return Number(dateKey.slice(4, 6)) + '/' + Number(dateKey.slice(6, 8));
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

module.exports = { uuid, clone, dateText, dateShort, clamp };
