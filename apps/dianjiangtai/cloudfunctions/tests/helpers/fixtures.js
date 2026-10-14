'use strict';
const { bestActions } = require('./harness');

let n = 0;
const runId = () => `run${String(++n).padStart(6, '0')}abc`;

/** getDaily + startRun for `openid`; returns {dateKey, rounds, actions} (actions = best-power picks) */
async function startDaily(h, openid, { rank = 0 } = {}) {
  const d = await h.call('getDaily', {}, { openid });
  if (!d.ok) throw new Error('getDaily failed ' + JSON.stringify(d));
  const s = await h.call('startRun', { mode: 'daily', clientRunId: runId() }, { openid });
  if (!s.ok) throw new Error('startRun failed ' + JSON.stringify(s));
  return { dateKey: d.dateKey, rounds: d.rounds, actions: bestActions(d.rounds, { rank }) };
}

/** play and submit the daily for `openid`; returns the submitRun response */
async function playDaily(h, openid, { actions, clientRunId = runId(), extra = {}, rank = 0 } = {}) {
  const s = await startDaily(h, openid, { rank });
  return h.call('submitRun', {
    mode: 'daily', clientRunId, dateKey: s.dateKey, actions: actions || s.actions, ...extra,
  }, { openid });
}

/** raw ids that must never leave the server: every string in a JSON value */
function allStrings(v, out = []) {
  if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => allStrings(x, out));
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => allStrings(x, out));
  return out;
}
function allKeys(v, out = []) {
  if (Array.isArray(v)) v.forEach((x) => allKeys(x, out));
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { out.push(k); allKeys(x, out); }
  return out;
}

module.exports = { runId, startDaily, playDaily, allStrings, allKeys };
