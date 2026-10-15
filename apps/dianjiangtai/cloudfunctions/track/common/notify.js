'use strict';
// Subscribe-message send for "好友接下了你的战书" (spec 8.13, 14.2). Best effort: never throws, never
// changes a submitRun response, at most SEND_CAP_MS of waiting. One grant = at most one message.
const store = require('./store');
const appconfig = require('./appconfig');
const { now, BJT_MS } = require('./util');

const SEND_CAP_MS = 2000;

function two(n) { return String(n).padStart(2, '0'); }
function bjtTime(ms) {
  const d = new Date(ms + BJT_MS);
  return `${d.getUTCFullYear()}-${two(d.getUTCMonth() + 1)}-${two(d.getUTCDate())} ${two(d.getUTCHours())}:${two(d.getUTCMinutes())}`;
}
const recText = (r) => (r ? `${r.w}胜${r.l}负` : '');

/** Atomically claim the grant (used:false -> true). Returns the grant if THIS call claimed it, else null. */
async function claim(challengeId, t) {
  let claimed = null;
  await store.db().runTransaction(async (tx) => {
    claimed = null;
    const g = await store.getDocT(tx, 'sub_grants', challengeId);
    if (!g || g.used) return;
    await tx.collection('sub_grants').doc(challengeId).update({ data: { used: true, claimedAt: t } });
    claimed = g;
  });
  return claimed;
}

async function sendOnce(challenge, answererRecord) {
  try {
    const t = now();
    const grant = await claim(challenge._id, t);
    if (!grant || !grant.tmplId || grant.ownerOpenid !== challenge.ownerOpenid) return { sent: false };
    const { fields } = await appconfig.subscribeConfig();
    const data = {
      [fields.title]: { value: '好友接下了你的战书' },
      [fields.theirRecord]: { value: recText(answererRecord) },
      [fields.myRecord]: { value: recText(challenge.record) },
      [fields.time]: { value: bjtTime(t) },
    };
    const msg = { touser: grant.ownerOpenid, templateId: grant.tmplId, page: `index?c=${challenge._id}`, data };
    if (process.env.SUBSCRIBE_MP_STATE) msg.miniprogramState = process.env.SUBSCRIBE_MP_STATE;
    let errCode = null;
    try {
      const api = store.cloud.openapi && store.cloud.openapi.subscribeMessage;
      if (!api || typeof api.send !== 'function') throw Object.assign(new Error('openapi unavailable'), { errCode: 'NO_OPENAPI' });
      let timer;
      const cap = new Promise((_r, rej) => { timer = setTimeout(() => rej(Object.assign(new Error('send timeout'), { errCode: 'TIMEOUT' })), SEND_CAP_MS); });
      try { await Promise.race([api.send(msg), cap]); } finally { clearTimeout(timer); }
    } catch (e) {
      errCode = e && e.errCode !== undefined ? e.errCode : 'ERR';
    }
    try {
      await store.db().collection('sub_grants').doc(challenge._id).update({ data: errCode === null ? { sentAt: now() } : { sendErrCode: String(errCode) } });
    } catch (e) { /* bookkeeping only */ }
    await store.writeEvent('server', 'subscribe_send', { ok: errCode === null, errCode: errCode === null ? null : String(errCode) });
    return { sent: errCode === null };
  } catch (e) {
    console.warn('[notify] failed', store.errText(e));
    return { sent: false };
  }
}

module.exports = { sendOnce, bjtTime, SEND_CAP_MS };
