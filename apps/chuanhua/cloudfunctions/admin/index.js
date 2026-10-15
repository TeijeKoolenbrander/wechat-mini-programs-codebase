'use strict';
// admin (spec 7.2, PO-18): the takedown / review path. There is no admin UI.
//   * Callable from the cloud console (test invocation: no OPENID in the context).
//   * Any call that carries an OPENID is FORBIDDEN unless that OPENID is listed in env ADMIN_OPENIDS
//     (fallback if the console turns out to attach one, V14).
//   * Every operation writes audit_log (op, target, before, after, by, ts).
// This is the only function that may return an openid (getStep) and a PNG temp URL.
const store = require('./common/store');
const cfgLib = require('./common/config');
const players = require('./common/players');
const lifecycle = require('./common/lifecycle');
const activity = require('./common/activity');
const input = require('./common/input');
const { AppError, fail, now, isInt, isPlainObject, DAY_MS } = require('./common/util');

const TEMP_URL_SEC = 600;

function adminList() {
  return (process.env.ADMIN_OPENIDS || '').split(',').map((s) => s.trim()).filter(Boolean);
}

async function audit(by, op, target, before, after) {
  await store.db().collection('audit_log').add({ data: { op, target, before: before === undefined ? null : before, after: after === undefined ? null : after, by, ts: now() } });
}

async function pngUrl(fileID) {
  if (!fileID) return null;
  try {
    const r = await store.sdk().getTempFileURL({ fileList: [{ fileID, maxAge: TEMP_URL_SEC }] });
    return (r.fileList && r.fileList[0] && r.fileList[0].tempFileURL) || null;
  } catch (e) {
    return null;
  }
}
async function stepView(s) {
  return {
    stepId: s._id, chainId: s.chainId, n: s.n, kind: s.kind, state: s.state, hiddenReason: s.hiddenReason || null,
    text: s.text || null, strokes: s.kind === 'draw' ? s.strokes || null : null, pngUrl: await pngUrl(s.fileID), mod: s.mod || null, createdAt: s.createdAt,
  };
}
function str(v, what) {
  if (typeof v !== 'string' || !v || v.length > 128) fail('BAD_INPUT', `bad ${what}`);
  return v;
}

/** Restore a hidden step only if it is still the chain's pointer for that 棒 (it does not block an open chain). */
function restoreRule(chain, step) {
  return chain && chain.stepIds[step.n] === step._id && step.state === 'hidden';
}

const OPS = {
  async listReports(ev) {
    const limit = input.optInt(ev.limit, 1, 50, 50);
    const state = ev.state === undefined ? 'open' : ev.state;
    if (!['open', 'upheld', 'dismissed'].includes(state)) fail('BAD_INPUT', 'bad state');
    const r = await store.db().collection('reports').where({ state }).orderBy('createdAt', 'asc').limit(limit).get();
    const items = [];
    for (const rep of r.data) {
      const s = rep.wholeChain ? null : await store.getDoc('steps', rep.stepId);
      const c = rep.wholeChain ? await store.getDoc('chains', rep.chainId) : null;
      items.push({
        reportId: rep._id, reason: rep.reason, state: rep.state, createdAt: rep.createdAt, chainId: rep.chainId, stepId: rep.stepId,
        wholeChain: !!rep.wholeChain, promptText: c ? c.promptText : null, step: s ? await stepView(s) : null,
      });
    }
    return { reports: items };
  },

  async getStep(ev) {
    const s = await store.getDoc('steps', str(ev.stepId, 'stepId'));
    if (!s) fail('CHAIN_NOT_FOUND', 'step not found');
    const reps = await store.db().collection('reports').where({ stepId: s._id }).limit(50).get();
    const p = await store.getDoc('players', s.author);
    const nowMs = now();
    return {
      step: await stepView(s),
      author: s.author, // openid: admin eyes only
      authorStrikes30d: p ? (p.strikes || []).filter((x) => nowMs - x.at < 30 * DAY_MS).length : 0,
      authorRestrictedUntil: p ? p.restrictedUntil || 0 : 0,
      reports: reps.data.map((r) => ({ reportId: r._id, reason: r.reason, state: r.state, createdAt: r.createdAt })),
    };
  },

  async sample(ev) {
    const n = input.optInt(ev.n, 1, 50, 20);
    const kind = ev.kind === undefined ? null : ev.kind;
    if (kind !== null && kind !== 'draw' && kind !== 'describe') fail('BAD_INPUT', 'bad kind');
    const _ = store._();
    const where = { state: 'passed', createdAt: _.gte(now() - DAY_MS) };
    if (kind) where.kind = kind;
    const r = await store.db().collection('steps').where(where).limit(1000).get();
    const pool = r.data.slice();
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const items = [];
    for (const s of pool.slice(0, n)) items.push(await stepView(s));
    return { items };
  },

  async upholdReport(ev) {
    const reportId = str(ev.reportId, 'reportId');
    const nowMs = now();
    let res = null;
    await store.txn(async (t) => {
      const rep = await store.getDocT(t, 'reports', reportId);
      if (!rep) throw new AppError('CHAIN_NOT_FOUND', 'report not found');
      if (rep.state !== 'open') throw new AppError('CHAIN_CLOSED', 'report already resolved');
      const chain = await store.getDocT(t, 'chains', rep.chainId);
      const pc = lifecycle.makePlayerCache(t, nowMs);
      let authorId;
      if (rep.wholeChain) {
        authorId = chain && chain.starter;
        if (chain) { chain.hidden = true; chain.hiddenReason = 'report'; await store.putT(t, 'chains', chain); }
      } else {
        const step = await store.getDocT(t, 'steps', rep.stepId);
        authorId = step && step.author;
        if (step && step.state === 'passed' && chain) {
          lifecycle.hideStepT(chain, step, { to: 'hidden', reason: 'report', nowMs });
          await store.putT(t, 'steps', step);
          await store.putT(t, 'chains', chain);
        }
      }
      let strike = null;
      if (authorId) {
        const author = await pc.get(authorId);
        strike = players.addStrike(author, rep.stepId, 'report', nowMs);
      }
      rep.state = 'upheld';
      rep.resolvedAt = nowMs;
      await store.putT(t, 'reports', rep);
      await pc.flush();
      res = { reportId, strikeLevel: strike ? strike.level : null, before: 'open', after: 'upheld' };
    });
    await audit(ev.__by, 'upholdReport', reportId, { state: 'open' }, { state: 'upheld', strikeLevel: res.strikeLevel });
    return { upheld: true, strikeLevel: res.strikeLevel };
  },

  async dismissReport(ev) {
    const reportId = str(ev.reportId, 'reportId');
    const restore = ev.restore === true;
    const nowMs = now();
    let restored = false;
    await store.txn(async (t) => {
      restored = false;
      const rep = await store.getDocT(t, 'reports', reportId);
      if (!rep) throw new AppError('CHAIN_NOT_FOUND', 'report not found');
      if (rep.state !== 'open') throw new AppError('CHAIN_CLOSED', 'report already resolved');
      const chain = await store.getDocT(t, 'chains', rep.chainId);
      if (restore) {
        if (rep.wholeChain && chain && chain.hidden) {
          chain.hidden = false;
          chain.hiddenReason = null;
          await store.putT(t, 'chains', chain);
          restored = true;
        } else if (!rep.wholeChain) {
          const step = await store.getDocT(t, 'steps', rep.stepId);
          if (step && restoreRule(chain, step)) {
            step.state = 'passed';
            step.hiddenReason = null;
            await store.putT(t, 'steps', step);
            restored = true;
          }
        }
      }
      rep.state = 'dismissed';
      rep.resolvedAt = nowMs;
      await store.putT(t, 'reports', rep);
    });
    await audit(ev.__by, 'dismissReport', reportId, { state: 'open' }, { state: 'dismissed', restored });
    return { dismissed: true, restored };
  },

  async hideStep(ev) {
    const stepId = str(ev.stepId, 'stepId');
    const nowMs = now();
    let before;
    let reopened = false;
    await store.txn(async (t) => {
      const step = await store.getDocT(t, 'steps', stepId);
      if (!step) throw new AppError('CHAIN_NOT_FOUND', 'step not found');
      const chain = await store.getDocT(t, 'chains', step.chainId);
      before = step.state;
      if (step.state === 'passed' && chain) {
        const r = lifecycle.hideStepT(chain, step, { to: 'hidden', reason: 'admin', nowMs });
        reopened = r.reopened !== null && r.reopened !== undefined;
        await store.putT(t, 'chains', chain);
      } else if (step.state === 'pending') {
        throw new AppError('PENDING', 'step is awaiting moderation; use removeChain or wait for the verdict');
      } else {
        step.state = 'hidden';
        step.hiddenReason = 'admin';
      }
      await store.putT(t, 'steps', step);
    });
    await audit(ev.__by, 'hideStep', stepId, { state: before }, { state: 'hidden', reopened });
    return { hidden: true, reopened };
  },

  async restoreStep(ev) {
    const stepId = str(ev.stepId, 'stepId');
    let restored = false;
    let before;
    await store.txn(async (t) => {
      restored = false;
      const step = await store.getDocT(t, 'steps', stepId);
      if (!step) throw new AppError('CHAIN_NOT_FOUND', 'step not found');
      const chain = await store.getDocT(t, 'chains', step.chainId);
      before = step.state;
      if (restoreRule(chain, step)) {
        step.state = 'passed';
        step.hiddenReason = null;
        await store.putT(t, 'steps', step);
        restored = true;
      }
    });
    await audit(ev.__by, 'restoreStep', stepId, { state: before }, { restored });
    return { restored, reason: restored ? null : 'step no longer in the chain (it reopened) or not hidden' };
  },

  async removeChain(ev) {
    const chainId = input.chainId(ev.chainId);
    const nowMs = now();
    let before;
    let chainOut;
    await store.txn(async (t) => {
      const chain = await store.getDocT(t, 'chains', chainId);
      if (!chain) throw new AppError('CHAIN_NOT_FOUND', 'chain not found');
      before = chain.state;
      chain.state = 'removed';
      chain.claim = null;
      chain.pending = null;
      chain.lastActivityAt = nowMs;
      await store.putT(t, 'chains', chain);
      chainOut = chain;
    });
    await activity.updateCard(chainOut); // closes the card; removed chains are never updated again
    await audit(ev.__by, 'removeChain', chainId, { state: before }, { state: 'removed' });
    return { removed: true };
  },

  async restrict(ev) {
    const openid = str(ev.openid, 'openid');
    const permanent = ev.permanent === true;
    if (!permanent && !isInt(ev.days, 1, 3650)) fail('BAD_INPUT', 'days or permanent required');
    const nowMs = now();
    let before;
    await store.txn(async (t) => {
      const p = await players.loadPlayerT(t, openid, nowMs);
      before = { restrictedUntil: p.restrictedUntil, permanent: p.permanent };
      if (permanent) p.permanent = true; else p.restrictedUntil = Math.max(p.restrictedUntil || 0, nowMs + ev.days * DAY_MS);
      p.restrictedAt = nowMs;
      await store.putT(t, 'players', p);
    });
    await audit(ev.__by, 'restrict', openid, before, permanent ? { permanent: true } : { days: ev.days });
    await store.writeEvent(null, 'restrict', { src: 'admin', level: permanent ? 'permanent' : 'days' });
    return { restricted: true };
  },

  async liftRestriction(ev) {
    const openid = str(ev.openid, 'openid');
    const nowMs = now();
    let before;
    await store.txn(async (t) => {
      const p = await players.loadPlayerT(t, openid, nowMs);
      before = { restrictedUntil: p.restrictedUntil, permanent: p.permanent };
      p.restrictedUntil = 0;
      p.permanent = false;
      p.flagged = false;
      await store.putT(t, 'players', p);
    });
    await audit(ev.__by, 'liftRestriction', openid, before, { restrictedUntil: 0, permanent: false });
    return { lifted: true };
  },

  async setUgc(ev) {
    const patch = {};
    if (ev.createEnabled !== undefined) { if (typeof ev.createEnabled !== 'boolean') fail('BAD_INPUT', 'createEnabled'); patch.createEnabled = ev.createEnabled; }
    if (ev.viewEnabled !== undefined) { if (typeof ev.viewEnabled !== 'boolean') fail('BAD_INPUT', 'viewEnabled'); patch.viewEnabled = ev.viewEnabled; }
    if (!Object.keys(patch).length) fail('BAD_INPUT', 'nothing to set');
    const nowMs = now();
    let before;
    let after;
    await store.txn(async (t) => {
      const cur = (await store.getDocT(t, 'app_config', 'live')) || { _id: 'live' };
      before = { ...(cur.ugc || {}) };
      cur.ugc = { createEnabled: true, viewEnabled: true, ...(cur.ugc || {}), ...patch };
      if (patch.createEnabled === true) cur.ugc.autoPausedUntil = 0; // an explicit re-enable ends a breaker pause
      cur.updatedAt = nowMs;
      after = cur.ugc;
      await store.putT(t, 'app_config', cur);
    });
    cfgLib.resetCache();
    await audit(ev.__by, 'setUgc', 'app_config/live', before, after);
    await store.writeEvent(null, 'ugc_pause', { source: 'switch', on: after.createEnabled === false || after.viewEnabled === false });
    return { ugc: { createEnabled: after.createEnabled, viewEnabled: after.viewEnabled } };
  },
};

exports.main = store.handler(async (event, { openid }) => {
  if (openid && !adminList().includes(openid)) fail('FORBIDDEN', 'admin only');
  const op = event.op;
  if (typeof op !== 'string' || !Object.prototype.hasOwnProperty.call(OPS, op)) fail('BAD_INPUT', 'unknown op');
  const ev = isPlainObject(event) ? { ...event, __by: openid || 'console' } : {};
  const out = await OPS[op](ev);
  if (op === 'listReports' || op === 'getStep' || op === 'sample') await audit(ev.__by, op, null, null, null);
  return { ok: true, ...out };
}, { auth: false });
