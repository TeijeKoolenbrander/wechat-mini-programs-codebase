'use strict';
// modSweeper: the 5-minute timer (spec 6.3 steps 7-8, 3.6, 6.8, 10.3, 7.2). Idempotent: every step is a transaction on the
// documents it changes, so overlapping runs or a retry after a crash never double-apply. Server-only (FORBIDDEN for any call
// that carries an OPENID).
//   1. mock verdicts that are due (dev only, same code path as a real push)
//   2. pending drawings: retry a failed mediaCheckAsync call (+5, +10 min), one re-check after 35 min, then void
//   3. chains: abandon a dead 棒 1, reveal or expire at 48 h
//   4. reveal notices (quiet hours 22:00-08:00 BJT hold them until 08:00), one message per grant
//   5. updatable-card updates that failed
//   6. circuit breaker, quota alert, report-age alert
const chainLib = require('./core/chain');
const allowance = require('./core/allowance');
const mod = require('./core/moderation');
const notice = require('./core/notice');
const { CONFIG } = require('./core/config');
const store = require('./common/store');
const players = require('./common/players');
const appconfig = require('./common/appconfig');
const modio = require('./common/modio');
const verdict = require('./common/verdict');
const lifecycle = require('./common/lifecycle');
const wx = require('./common/wxapi');
const env = require('./common/env');
const { now, configuredTimeoutMs } = require('./common/util');

const { STATE, STEP } = chainLib;

// ---- 2. pending drawings ---------------------------------------------------------------------------------------

/** (re)send a pending drawing for checking and record the outcome on the step; returns true when the call succeeded */
async function callAgain(step, isRecheck) {
  let sent;
  try {
    sent = await modio.sendImageCheck({ stepId: step._id, openid: step.author, fileID: step.fileID, strokes: step.strokes });
  } catch (e) {
    console.warn('sweeper check call failed', store.errText(e));
    sent = { ok: false };
  }
  await store.txn(async (t) => {
    const s = await store.getDocT(t, 'steps', step._id);
    if (!s || s.state !== STEP.PENDING) return;
    const m = Object.assign({}, s.mod);
    if (sent.ok) {
      m.traceIds = (m.traceIds || []).concat(sent.traceId);
      m.lastCheckAt = now();
      if (isRecheck) m.rechecks = (m.rechecks || 0) + 1;
    } else m.callErrors = (m.callErrors || 0) + 1;
    await players.putT(t, 'steps', s._id, Object.assign({}, s, { mod: m }));
  });
  return sent.ok;
}

/** no verdict will come (timeout / call errors): the 棒 reopens, the allowance comes back, NO strike (6.3 step 7) */
async function voidStep(step, reason) {
  const done = await store.txn(async (t) => {
    const s = await store.getDocT(t, 'steps', step._id);
    if (!s || s.state !== STEP.PENDING) return false;
    const chain = await store.getDocT(t, 'chains', s.chainId);
    const res = chain ? chainLib.resolvePending(chain, { stepId: s._id, outcome: 'void', now: now() }) : { stale: true };
    await players.putT(t, 'steps', s._id, Object.assign({}, s, { state: STEP.VOID, mod: Object.assign({}, s.mod, { suggest: 'void', label: reason, verdictAt: now() }) }));
    if (!res.stale) await players.putT(t, 'chains', chain._id, res.chain);
    let p = await players.getT(t, s.author);
    p = allowance.refundStep(p, players.dateKey());
    if (s.n === 1) p = allowance.refundStart(p, players.dateKey());
    await players.putPlayerT(t, p);
    return true;
  });
  if (!done) return false;
  await modio.logMod({ stepId: step._id, author: step.author, kind: 'image', fileID: step.fileID || null, suggest: 'void', label: reason, source: 'sweeper' });
  await store.writeEvent(null, 'mod_void', { kind: 'image', reason });
  return true;
}

// ---- 4. notices -----------------------------------------------------------------------------------------------------

const pad2 = (n) => (n < 10 ? '0' + n : '' + n);
function bjtStamp(ms) {
  const d = new Date(ms + 8 * 3600e3);
  return d.getUTCFullYear() + '年' + pad2(d.getUTCMonth() + 1) + '月' + pad2(d.getUTCDate()) + '日 ' + pad2(d.getUTCHours()) + ':' + pad2(d.getUTCMinutes());
}

async function sendNotices(t, cfg, deadline, summary) {
  const grants = (await store.coll('sub_grants').where({ used: false }).limit(300).get()).data;
  const chains = {};
  for (const g of grants) {
    if (now() > deadline) break;
    if (!chains[g.chainId]) chains[g.chainId] = (await store.getDoc('chains', g.chainId)) || false;
    const chain = chains[g.chainId];
    if (chain && chain.state !== STATE.REVEALED && !chainLib.isTerminal(chain)) continue; // still running
    const dead = !chain || chain.state !== STATE.REVEALED || chain.hidden;
    if (!dead && t < notice.noticeSendTime(chain.revealedAt)) continue; // quiet hours (AC 78)
    // claim the grant in a transaction: at most one message per grant, even with overlapping sweeps
    const claimed = await store.txn(async (tx) => {
      const cur = await store.getDocT(tx, 'sub_grants', g._id);
      if (!cur || cur.used) return false;
      await players.putT(tx, 'sub_grants', g._id, Object.assign({}, cur, { used: true, sentAt: dead ? null : t, skipped: dead ? 'closed' : null }));
      return true;
    });
    if (!claimed || dead) continue;
    const tmplId = g.tmplId || (cfg.subscribe && cfg.subscribe.tmplId);
    if (!tmplId) continue;
    const f = cfg.subscribeFields;
    try {
      await wx.sendSubscribe({
        touser: g.openid,
        templateId: tmplId,
        page: 'index?r=' + chain._id,
        data: {
          [f.title]: { value: '你参与的接龙揭晓了' },
          [f.prompt]: { value: String(chain.promptText).slice(0, 20) },
          [f.time]: { value: bjtStamp(chain.revealedAt) },
        },
      });
      summary.notices++;
    } catch (e) {
      console.warn('subscribe send failed', store.errText(e));
      await store.coll('sub_grants').doc(g._id).update({ data: { sendErrCode: e && e.errCode !== undefined ? e.errCode : -1 } }).catch(() => {});
    }
  }
}

// ---- 6. breaker ----------------------------------------------------------------------------------------------------

async function pauseCreation(until) {
  const c = store.coll('app_config');
  const cur = await store.getDoc('app_config', 'live');
  if (cur && !cur.ugc) await c.doc('live').update({ data: { ugc: { createEnabled: true, viewEnabled: true, autoPausedUntil: 0 } } }); // a config doc without the ugc block
  const r = await c.doc('live').update({ data: { 'ugc.autoPausedUntil': until, updatedAt: now() } });
  if (r && r.stats && r.stats.updated === 0) {
    await store.addIfAbsent('app_config', { _id: 'live', ugc: { createEnabled: true, viewEnabled: true, autoPausedUntil: until }, updatedAt: now() });
    await c.doc('live').update({ data: { 'ugc.autoPausedUntil': until, updatedAt: now() } });
  }
  appconfig.reset();
}

exports.main = store.handler(async (event, { startedAt }) => {
  const e = env.ugcGuard();
  const t = now();
  const deadline = startedAt + 0.8 * configuredTimeoutMs();
  const _ = store._();
  const cfg = await appconfig.get(0);
  const summary = { verdicts: 0, rechecked: 0, voided: 0, retried: 0, revealed: 0, expired: 0, abandoned: 0, notices: 0 };

  // 1. mock verdicts that are due, through the very code path a real push takes
  if (e.mode === 'mock') {
    const due = await store.coll('mod_traces').where({ mock: true, done: false, deliverAt: _.gt(0).and(_.lte(t)) }).limit(200).get();
    for (const tr of due.data) {
      if (now() > deadline) break;
      await verdict.applyImageVerdict({ traceId: tr._id, suggest: tr.suggest });
      summary.verdicts++;
    }
  }

  // 2. pending drawings
  const pend = await store.coll('steps').where({ state: STEP.PENDING }).orderBy('mod.submittedAt', 'asc').limit(200).get();
  for (const step of pend.data) {
    if (now() > deadline) break;
    if (!step.mod || step.mod.kind !== 'image') continue;
    const plan = mod.planPendingImage(step.mod, t);
    if (plan.action === 'retryCall') {
      if (await callAgain(step, false)) summary.retried++;
    } else if (plan.action === 'recheck') {
      if (await callAgain(step, true)) summary.rechecked++;
      else if (await voidStep(step, 'error')) summary.voided++;
    } else if (plan.action === 'void') {
      if (await voidStep(step, plan.reason)) summary.voided++;
    }
  }

  // 3. chains: a dead 棒 1 abandons; at 48 h reveal (>= 4 passed) or expire, waiting while a claim/pending is active
  const starting = (await store.coll('chains').where({ state: STATE.STARTING }).limit(200).get()).data;
  const expiring = (await store.coll('chains').where({ state: _.in([STATE.OPEN, STATE.PENDING]), expiresAt: _.lte(t) }).orderBy('expiresAt', 'asc').limit(200).get()).data;
  for (const c0 of starting.concat(expiring)) {
    if (now() > deadline) break;
    const r = await store.txn(async (tx) => {
      const chain = await store.getDocT(tx, 'chains', c0._id);
      if (!chain) return null;
      const s = chainLib.sweepChain(chain, t);
      if (!s.event) return null;
      await players.putT(tx, 'chains', chain._id, s.chain);
      return s;
    });
    if (!r) continue;
    if (r.event === 'reveal') {
      await lifecycle.onRevealed(r.chain);
      summary.revealed++;
    } else if (r.event === 'expire') summary.expired++;
    else summary.abandoned++;
  }

  // 4. reveal notices
  await sendNotices(t, cfg, deadline, summary);

  // 5. updatable-card updates that failed earlier (only while the feature is on)
  if (cfg.features.updatableCard) {
    const act = (await store.coll('chains').where({ state: _.in([STATE.OPEN, STATE.PENDING]), expiresAt: _.gt(t) }).limit(300).get()).data;
    const rev = (await store.coll('chains').where({ state: STATE.REVEALED, createdAt: _.gt(t - 3 * 86400e3) }).limit(300).get()).data;
    for (const c of act.concat(rev)) {
      if (now() > deadline) break;
      if (c.cardDirty) await lifecycle.updateCard(c, c.state === STATE.REVEALED);
    }
  }

  // 6. circuit breaker (AC 55), image quota (AC 56), report age (AC 67)
  const stats = await modio.windowStats(t);
  const br = mod.breakerDecision(stats, t);
  if (br.trip && !(cfg.ugc.autoPausedUntil > t)) {
    await pauseCreation(br.pausedUntil);
    modio.alert('moderation circuit breaker tripped: ' + stats.failed + '/' + stats.total + ' calls failed in 5 min; creation paused until ' + new Date(br.pausedUntil).toISOString());
    await store.writeEvent(null, 'ugc_pause', { source: 'breaker', on: true });
  }
  if ((await modio.imageLevel()) !== 'ok') modio.alert('image quota >= 70% of the daily mediaCheckAsync limit; ask WeChat for a raise (Handoff H11)');
  const stale = (await store.coll('reports').where({ state: 'open', createdAt: _.lt(t - CONFIG.reports.staleAlertMs) }).limit(100).get()).data;
  if (stale.length) modio.alert(stale.length + ' open report(s) older than 48h (oldest ' + stale.map((r) => r._id).sort()[0] + '): run admin listReports');
  return Object.assign({ ok: true }, summary);
}, { auth: false, serverOnly: true, timer: true });
