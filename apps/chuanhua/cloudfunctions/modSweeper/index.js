'use strict';
// modSweeper: timer every 5 minutes (config.json). Server-only. Idempotent: every task re-reads state
// inside its own transaction, so a double-fired trigger changes nothing twice.
//   1. mock verdicts (dev + MODERATION_MODE=mock only), through the SAME resolveVerdict path as the push
//   2. pending drawings: call retries (+5/+10 min), one re-check after 35 min, then void (fail closed)
//   3. chain expiry at 48 h (waits for an active claim or pending 棒) and abandoned 第 1 棒 claims
//   4. circuit breaker, image-quota and report-age [ALERT]s
//   5. reveal notices (subscribe message), held until 08:00 BJT in quiet hours
//   6. retry of failed updatable-card updates
const store = require('./common/store');
const cfgLib = require('./common/config');
const lifecycle = require('./common/lifecycle');
const moderation = require('./common/moderation');
const activity = require('./common/activity');
const { LIMITS } = cfgLib;
const { now, dateKeyAt, configuredTimeoutMs } = require('./common/util');

async function run(name, fn, out) {
  try {
    out[name] = await fn();
  } catch (e) {
    console.error(`modSweeper task ${name} failed`, store.errText(e));
    out[name] = { error: true };
  }
}

// ------------------------------------------------------------------ 1-2: pending drawings

async function sweepPending(nowMs, deadline) {
  const env = cfgLib.moderationEnv();
  const delayMs = cfgLib.envInt('MOCK_MEDIA_DELAY_SEC', 60) * 1000;
  const r = await store.db().collection('steps').where({ state: 'pending' }).orderBy('createdAt', 'asc').limit(200).get();
  const stats = { checked: 0, mockVerdicts: 0, retried: 0, rechecked: 0, voided: 0, started: 0 };
  for (const s of r.data) {
    if (now() > deadline) break;
    stats.checked += 1;
    const m = s.mod || {};
    const traces = m.traceIds || [];
    if (m.callFailed) {
      if (m.nextAttemptAt && nowMs >= m.nextAttemptAt) {
        if ((m.callRetries || 0) >= LIMITS.mediaMaxCallRetries) { await moderation.voidStep(s._id, 'error'); stats.voided += 1; } else {
          await moderation.startMediaCheck(s._id, { isRetry: true, isRecheck: traces.length > 0 });
          stats.retried += 1;
        }
      }
      continue;
    }
    if (!traces.length) {
      if (nowMs - m.submittedAt > 60e3) { await moderation.startMediaCheck(s._id); stats.started += 1; }
      continue;
    }
    if (env.mode === 'mock') {
      const last = traces[traces.length - 1];
      const tr = await store.getDoc('mod_traces', last);
      if (tr && tr.mock && !tr.done && nowMs - tr.submittedAt >= delayMs) {
        const suggest = moderation.mockImageSuggest(s.strokes ? s.strokes.s.length : 0);
        if (suggest) {
          await moderation.resolveVerdict({ traceId: last, suggest, label: suggest === 'pass' ? 100 : 20002, source: 'mock' });
          stats.mockVerdicts += 1;
          continue;
        }
      }
    }
    if (nowMs - (m.lastCheckAt || m.submittedAt) >= LIMITS.mediaTimeoutMs) {
      if (!m.rechecked) { await moderation.startMediaCheck(s._id, { isRecheck: true }); stats.rechecked += 1; } else {
        await moderation.voidStep(s._id, 'timeout');
        stats.voided += 1;
      }
    }
  }
  return stats;
}

// ------------------------------------------------------------------ 3: expiry

async function sweepExpiry(nowMs, deadline) {
  const _ = store._();
  const out = { revealed: 0, expired: 0, abandoned: 0 };
  const due = await store.db().collection('chains').where({ state: _.in(['open', 'starting']), expiresAt: _.lte(nowMs) }).limit(100).get();
  const starting = await store.db().collection('chains').where({ state: 'starting' }).limit(200).get();
  const ids = new Set([...due.data.map((c) => c._id), ...starting.data.map((c) => c._id)]);
  for (const id of ids) {
    if (now() > deadline) break;
    let result = null;
    let chainOut = null;
    await store.txn(async (t) => {
      result = null;
      const chain = await store.getDocT(t, 'chains', id);
      if (!chain || !['open', 'starting'].includes(chain.state)) return;
      const active = chain.claim && chain.claim.expiresAt > nowMs;
      if (chain.state === 'starting') {
        if (active) return;
        chain.state = 'abandoned'; // 第 1 棒 never submitted and the claim ran out (spec 3.2)
        chain.claim = null;
        chain.lastActivityAt = nowMs;
        await store.putT(t, 'chains', chain);
        result = 'abandoned';
        return;
      }
      if (chain.expiresAt > nowMs || active || chain.pending) return; // waits for the claim / pending 棒 (3.6)
      if (chain.passed >= LIMITS.revealMinPassed) {
        const pc = lifecycle.makePlayerCache(t, nowMs);
        await lifecycle.finalizeRevealT(t, chain, 'expiry', nowMs, pc);
        await pc.flush();
        result = 'revealed';
      } else {
        chain.state = 'expired';
        chain.claim = null;
        chain.lastActivityAt = nowMs;
        result = 'expired';
      }
      await store.putT(t, 'chains', chain);
      chainOut = chain;
    });
    if (!result) continue;
    out[result] += 1;
    if (result === 'revealed') {
      await store.writeEvent(null, 'chain_reveal', { reason: 'expiry', passed: chainOut.passed, participants: chainOut.participants.length, durationMin: Math.round((nowMs - chainOut.createdAt) / 60000), custom: chainOut.custom });
      await activity.updateCard(chainOut);
    } else if (result === 'expired') {
      await store.writeEvent(null, 'chain_expire', { passed: chainOut.passed });
      await activity.updateCard(chainOut);
    }
  }
  return out;
}

// ------------------------------------------------------------------ 4: breaker and alerts

async function checkBreaker(nowMs) {
  const minute = Math.floor(nowMs / 60000);
  let calls = 0;
  let errors = 0;
  for (let k = 0; k < LIMITS.breakerWindowMin; k++) {
    const d = await store.getDoc('rate_limits', `modcalls_${minute - k}`);
    if (d) { calls += d.calls || 0; errors += d.errors || 0; }
  }
  const out = { calls, errors, tripped: false };
  if (calls >= LIMITS.breakerMinCalls && errors / calls >= LIMITS.breakerRatio) {
    const cfg = await cfgLib.getConfig({ fresh: true });
    if (!(cfg.ugc.autoPausedUntil && cfg.ugc.autoPausedUntil > nowMs)) {
      await store.txn(async (t) => {
        const cur = (await store.getDocT(t, 'app_config', 'live')) || { _id: 'live' };
        cur.ugc = { createEnabled: true, viewEnabled: true, ...(cur.ugc || {}), autoPausedUntil: nowMs + LIMITS.breakerPauseMs };
        cur.updatedAt = nowMs;
        await store.putT(t, 'app_config', cur);
      });
      cfgLib.resetCache();
      store.alert('moderation circuit breaker tripped: UGC creation paused for 15 minutes', { calls, errors });
      await store.writeEvent(null, 'ugc_pause', { source: 'breaker', on: true });
      out.tripped = true;
    }
  }
  return out;
}

async function alerts(nowMs) {
  const out = { imageQuota: false, oldReports: 0 };
  const q = await moderation.getQuota(dateKeyAt(nowMs));
  if (q.image >= LIMITS.imageAlertRatio * LIMITS.imageDailyLimit) {
    store.alert('mediaCheckAsync daily quota above 70%: ask WeChat for a raise (Handoff H11)', { image: q.image });
    out.imageQuota = true;
  }
  const _ = store._();
  const old = await store.db().collection('reports').where({ state: 'open', createdAt: _.lt(nowMs - LIMITS.reportAlertMs) }).limit(100).get();
  out.oldReports = old.data.length;
  if (old.data.length) store.alert('open reports older than 48 h', { count: old.data.length });
  return out;
}

// ------------------------------------------------------------------ 5: reveal notices

function fill(tpl, vars) {
  return String(tpl).replace(/\{(\w+)\}/g, (m, k) => (vars[k] === undefined ? '' : vars[k]));
}
function pad2(n) { return String(n).padStart(2, '0'); }

async function sendNotices(nowMs, deadline) {
  const _ = store._();
  const out = { chains: 0, sent: 0, failed: 0 };
  const cfg = await cfgLib.getConfig();
  const due = await store.db().collection('chains').where({ state: 'revealed', noticeSent: false, noticeDue: _.lte(nowMs) }).limit(20).get();
  for (const c of due.data) {
    if (now() > deadline) break;
    const grants = await store.db().collection('sub_grants').where({ chainId: c._id, used: false }).limit(100).get();
    for (const g of grants.data) {
      let claimed = false;
      await store.txn(async (t) => {
        claimed = false;
        const cur = await store.getDocT(t, 'sub_grants', g._id);
        if (!cur || cur.used) return;
        cur.used = true; // claimed BEFORE sending: at most one message per grant (AC 100)
        cur.sentAt = nowMs;
        await store.putT(t, 'sub_grants', cur);
        claimed = true;
      });
      if (!claimed) continue;
      if (!cfg.subscribe || !cfg.subscribe.fields) { out.failed += 1; continue; }
      const d = new Date(nowMs + 8 * 3600e3);
      const vars = { prompt: c.hidden ? '' : c.promptText, time: `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}` };
      const data = {};
      for (const [k, tpl] of Object.entries(cfg.subscribe.fields)) data[k] = { value: fill(tpl, vars).slice(0, 20) };
      try {
        await store.sdk().openapi.subscribeMessage.send({ touser: g.openid, templateId: g.tmplId || cfg.subscribe.tmplId, page: `?r=${c._id}`, data });
        out.sent += 1;
        await store.writeEvent(null, 'subscribe_send', { result: 'ok' });
      } catch (e) {
        out.failed += 1;
        await store.db().collection('sub_grants').doc(g._id).update({ data: { sendErrCode: (e && e.errCode) || -1 } }).catch(() => {});
        await store.writeEvent(null, 'subscribe_send', { result: 'fail', errCode: (e && e.errCode) || -1 });
      }
    }
    await store.db().collection('chains').doc(c._id).update({ data: { noticeSent: true } });
    out.chains += 1;
  }
  return out;
}

// ------------------------------------------------------------------ 6: card retries

async function retryCards() {
  const r = await store.db().collection('chains').where({ activityDirty: true }).limit(20).get();
  for (const c of r.data) {
    await store.db().collection('chains').doc(c._id).update({ data: { activityDirty: false } });
    await activity.updateCard(c);
  }
  return { retried: r.data.length };
}

exports.main = store.handler(async (event, { startedAt }) => {
  const nowMs = now();
  const deadline = startedAt + 0.8 * configuredTimeoutMs();
  const out = {};
  await run('pending', () => sweepPending(nowMs, deadline), out);
  await run('expiry', () => sweepExpiry(nowMs, deadline), out);
  await run('breaker', () => checkBreaker(nowMs), out);
  await run('alerts', () => alerts(nowMs), out);
  await run('notices', () => sendNotices(nowMs, deadline), out);
  await run('cards', () => retryCards(), out);
  return { ok: true, ...out };
}, { auth: false, serverOnly: true });
