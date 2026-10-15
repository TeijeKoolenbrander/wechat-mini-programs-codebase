'use strict';
const { bestActions } = require('./harness');

let n = 0;
const runId = () => `run${String(++n).padStart(6, '0')}abc`;

/** everything up to and including the n-th pick */
function prefixThroughPick(actions, n) {
  let picks = 0;
  for (let i = 0; i < actions.length; i++) {
    if (actions[i].type === 'pick' && ++picks === n) return actions.slice(0, i + 1);
  }
  throw new Error('not enough picks');
}
/** the full sheet of a published date straight from the (fake) database: tests only */
function sheetOf(h, dateKey) {
  return h.db.all('daily_seeds').find((d) => d._id === dateKey).rounds;
}
/** deliver rounds 2..5 via getRound for `actions` (all 5 picks); returns the last response */
async function releaseAll(h, openid, dateKey, actions, clientRunId = 'releaseRun01') {
  let last;
  for (let n = 1; n <= 4; n++) {
    last = await h.call('getRound', { clientRunId, dateKey, actions: prefixThroughPick(actions, n) }, { openid });
    if (!last.ok) throw new Error('getRound failed ' + JSON.stringify(last));
  }
  return last;
}

/** getDaily + startRun + progressive release for `openid`; returns {dateKey, rounds (full sheet), actions} */
async function startDaily(h, openid, { rank = 0, release = true } = {}) {
  const d = await h.call('getDaily', {}, { openid });
  if (!d.ok) throw new Error('getDaily failed ' + JSON.stringify(d));
  const s = await h.call('startRun', { mode: 'daily', clientRunId: runId(), dateKey: d.dateKey }, { openid });
  if (!s.ok) throw new Error('startRun failed ' + JSON.stringify(s));
  const rounds = sheetOf(h, d.dateKey);
  const actions = bestActions(rounds, { rank });
  if (release) await releaseAll(h, openid, d.dateKey, actions);
  return { dateKey: d.dateKey, rounds, actions };
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

module.exports = { runId, prefixThroughPick, sheetOf, releaseAll, startDaily, playDaily, allStrings, allKeys };
