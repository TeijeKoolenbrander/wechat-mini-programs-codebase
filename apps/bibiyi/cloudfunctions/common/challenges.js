'use strict';
// Challenge rules shared by startRun / answer / submitRun / getChallenge / createChallenge.
// SPOILER LOCK: a challenge never exposes the owner's answers or any fact; only the owner's 连对, the deck
// kind and (daily) the public issue/theme. See getChallenge and tests/challenge.test.js.
const core = require('./coreapi');
const store = require('./store');
const features = require('./features');
const { fail, now, addDaysKey } = require('./util');

/** ranked-eligible: the challenge's deck is today's and the caller has no ranked run for today yet */
async function countsAsDaily(ch, openid, nowMs) {
  if (ch.kind !== 'daily' || !ch.dateKey) return false;
  if (core.dateKeyAt(nowMs) !== ch.dateKey) return false;
  if (await store.getDoc('daily_results', `${ch.dateKey}_${openid}`)) return false;
  return !(await store.getDoc('run_progress', `${ch.dateKey}_${openid}`));
}

/** Load a challenge usable by `openid`: throws CHALLENGE_EXPIRED / OWN_CHALLENGE. */
async function loadAnswerable(id, openid, nowMs) {
  const ch = await store.getDoc('challenges', id);
  if (!ch || nowMs > ch.expiresAt) fail('CHALLENGE_EXPIRED', 'challenge expired or missing');
  if (ch.kind === 'free' && !(core.isKnownContentVersion(ch.contentVersion) && core.isKnownConfigVersion(ch.configVersion))) {
    fail('CHALLENGE_EXPIRED', 'content version retired');
  }
  if (ch.ownerOpenid === openid) fail('OWN_CHALLENGE', 'own challenge');
  return ch;
}

/** has this user already played this challenge? (run_progress or runs, index: challengeId + openid) */
async function priorAnswer(openid, challengeId) {
  const a = await store.db().collection('run_progress').where({ openid, challengeId }).limit(1).get();
  if (a.data[0]) return { source: 'run_progress', doc: a.data[0] };
  const b = await store.db().collection('runs').where({ openid, challengeId }).limit(1).get();
  if (b.data[0]) return { source: 'runs', doc: b.data[0] };
  return null;
}

/** count one answer (first answer by this player only) and keep the best; then notify the owner once */
async function recordAnswer(challengeId, streak) {
  try {
    const _ = store._();
    await store.db().runTransaction(async (t) => {
      const ch = await store.getDocT(t, 'challenges', challengeId);
      if (!ch) return;
      const best = Math.max(Number.isFinite(ch.bestAnswer) ? ch.bestAnswer : 0, streak);
      await t.collection('challenges').doc(challengeId).update({ data: { answerCount: _.inc(1), bestAnswer: best } });
    });
  } catch (e) {
    console.warn('challenge bookkeeping failed', store.errText(e));
  }
  await notifyOwner(challengeId);
}

function withTimeout(p, ms) {
  let timer;
  const t = new Promise((resolve) => { timer = setTimeout(() => resolve({ timeout: true }), ms); });
  return Promise.race([p, t]).finally(() => clearTimeout(timer));
}

/**
 * Subscribe message "好友接受了你的挑战": exactly one per challenge (the grant is claimed in a transaction,
 * so two parallel answers send one). No names, no openids in the payload. Best effort, <= 2 s.
 */
async function notifyOwner(challengeId) {
  try {
    const cfg = await features.getAppConfig();
    const sub = cfg.subscribe;
    if (!sub || !sub.tmplId) return false;
    let claimed = null;
    await store.db().runTransaction(async (t) => {
      claimed = null;
      const g = await store.getDocT(t, 'sub_grants', challengeId);
      if (!g || g.used) return;
      await t.collection('sub_grants').doc(challengeId).update({ data: { used: true, sentAt: now() } });
      claimed = g;
    });
    if (!claimed) return false;
    const data = {};
    for (const [k, v] of Object.entries(sub.fields || {})) data[k] = { value: String(v && v.value !== undefined ? v.value : v).slice(0, 20) };
    const send = store.cloud.openapi && store.cloud.openapi.subscribeMessage && store.cloud.openapi.subscribeMessage.send;
    if (!send) return false;
    const res = await withTimeout(
      send.call(store.cloud.openapi.subscribeMessage, {
        touser: claimed.ownerOpenid, templateId: sub.tmplId, page: `index?c=${challengeId}`, data,
      }).then(() => ({ ok: true }), (e) => ({ err: e })),
      2000,
    );
    if (res.err) {
      await store.db().collection('sub_grants').doc(challengeId).update({ data: { sendErrCode: (res.err && res.err.errCode) || -1 } });
      await store.writeEvent('server', 'subscribe_send', { challengeId, ok: false, errCode: (res.err && res.err.errCode) || -1 });
      return false;
    }
    await store.writeEvent('server', 'subscribe_send', { challengeId, ok: !res.timeout, timeout: !!res.timeout });
    return !res.timeout;
  } catch (e) {
    console.warn('notifyOwner failed', store.errText(e));
    return false;
  }
}

module.exports = { countsAsDaily, loadAnswerable, priorAnswer, recordAnswer, notifyOwner, addDaysKey };
