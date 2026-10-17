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

const isInt = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
const isDateKey = (s) => typeof s === 'string' && /^\d{8}$/.test(s);

module.exports = { uuid, clone, isInt, isDateKey };
