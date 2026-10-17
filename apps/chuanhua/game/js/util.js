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

const pad2 = (n) => (n < 10 ? '0' + n : '' + n);

/** '14:20' in Beijing time (explicit UTC+8, no local-time getters) */
function bjtClock(ms) {
  const d = new Date(ms + 8 * 3600e3);
  return pad2(d.getUTCHours()) + ':' + pad2(d.getUTCMinutes());
}

/** 我的接龙 time column: '今天 14:20' / '昨天 09:05' / '10月3日 18:30' relative to `nowMs`, all in Beijing time */
function whenText(ms, nowMs) {
  if (!ms) return '';
  const day = (t) => Math.floor((t + 8 * 3600e3) / 86400e3);
  const diff = day(nowMs) - day(ms);
  if (diff === 0) return '今天 ' + bjtClock(ms);
  if (diff === 1) return '昨天 ' + bjtClock(ms);
  const d = new Date(ms + 8 * 3600e3);
  return d.getUTCMonth() + 1 + '月' + d.getUTCDate() + '日 ' + bjtClock(ms);
}

module.exports = { uuid, clone, pad2, bjtClock, whenText };
