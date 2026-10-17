'use strict';
// admin: the takedown and offender path (spec 7.2, PO-18, AC 62-64). NO admin UI: the founder (or a delegate) runs it from the
// cloud console's function test invocation, which carries no OPENID. A call that carries an OPENID is refused with FORBIDDEN
// unless that openid is in the ADMIN_OPENIDS allow-list (fallback if the console turns out to carry one, V14). Never enable the
// HTTP access service for this function. Every op writes audit_log. This is the ONLY function that returns an openid, a strike
// count or a PNG temp URL.
const chainLib = require('./core/chain');
const roomLib = require('./core/room');
const strikes = require('./core/strikes');
const store = require('./common/store');
const players = require('./common/players');
const wx = require('./common/wxapi');
const env = require('./common/env');
const roomio = require('./common/roomio');
const roomops = require('./common/roomops');
const appconfig = require('./common/appconfig');
const { bad } = require('./common/errors');
const { requireId, intIn } = require('./common/input');
const { now } = require('./common/util');

const { STATE, STEP } = chainLib;
const OPS = ['listReports', 'getStep', 'sample', 'upholdReport', 'dismissReport', 'hideStep', 'restoreStep', 'removeChain', 'removeRoom', 'restrict', 'liftRestriction', 'setUgc', 'setModeration'];
const OPENID_RE = /^[A-Za-z0-9_-]{6,64}$/;
const PNG_URL_TTL_SEC = 600; // 10-minute temp URLs (spec 7.2, 13.3)

function gate(openid) {
  if (openid && !env.adminOpenids().includes(openid)) bad('FORBIDDEN');
}

async function audit(op, target, before, after, by) {
  await store.coll('audit_log').add({ data: { op, target, before: before === undefined ? null : before, after: after === undefined ? null : after, by, ts: now() } });
}

async function pngUrl(step) {
  if (!step || !step.fileID) return null;
  try {
    return await wx.tempUrl(step.fileID, PNG_URL_TTL_SEC);
  } catch (e) {
    console.warn('admin tempUrl failed', store.errText(e));
    return null;
  }
}
/** what a human reviewer needs to see for one step (text, or strokes + a PNG link) */
async function stepView(s) {
  const v = { stepId: s._id, chainId: s.chainId, n: s.n, attempt: s.attempt, kind: s.kind, state: s.state, hiddenReason: s.hiddenReason || null, mod: s.mod || null, createdAt: s.createdAt };
  if (s.kind === 'describe') v.text = s.text === undefined ? null : s.text;
  else {
    v.pngUrl = await pngUrl(s);
    v.strokes = s.strokes || null;
  }
  return v;
}

/** can this hidden step go back to `passed`? Not when the chain moved on without it (it was reopened) or the author deleted it */
function restorable(step, chain) {
  if (step.state !== STEP.HIDDEN) return { ok: false, reason: 'notHidden' };
  if (!chain) return { ok: true };
  if (!chainLib.isTerminal(chain) && chain.stepIds[step.n] !== step._id) return { ok: false, reason: 'chainOpen' };
  return { ok: true };
}

const ops = {
  async listReports(d) {
    const state = ['open', 'upheld', 'dismissed'].includes(d.state) ? d.state : 'open';
    const limit = d.limit === undefined ? 20 : intIn(d.limit, 1, 50);
    if (!limit) bad('BAD_REQUEST');
    const rows = (await store.coll('reports').where({ state }).orderBy('createdAt', 'asc').limit(limit).get()).data;
    const items = [];
    for (const r of rows) {
      const item = { reportId: r._id, state: r.state, reason: r.reason, chainId: r.chainId, stepId: r.stepId, createdAt: r.createdAt, ageMs: now() - r.createdAt };
      if (r.stepId) {
        const s = await store.getDoc('steps', r.stepId);
        item.target = s ? await stepView(s) : null;
      } else {
        const c = await store.getDoc('chains', r.chainId);
        item.target = c ? { kind: 'prompt', text: c.promptText, chainState: c.state, hidden: c.hidden || null } : null;
      }
      items.push(item);
    }
    return { items };
  },

  async getStep(d) {
    const s = await store.getDoc('steps', requireId(d.stepId));
    if (!s) bad('BAD_REQUEST');
    const [chain, reps, p] = await Promise.all([
      store.getDoc('chains', s.chainId),
      store.coll('reports').where({ stepId: s._id }).limit(50).get(),
      store.getDoc('players', s.author),
    ]);
    const view = await stepView(s);
    view.author = s.author; // the only place an openid is shown
    view.strikesActive = p ? strikes.activeStrikes(p.strikes, now()).length : 0;
    view.restricted = p ? !!strikes.restrictionOf(p, now()) : false;
    view.chain = chain ? { state: chain.state, passed: chain.passed, hidden: chain.hidden || null } : null;
    view.reports = reps.data.map((r) => ({ reportId: r._id, reason: r.reason, state: r.state, createdAt: r.createdAt }));
    return { step: view };
  },

  async sample(d) {
    const n = d.n === undefined ? 20 : intIn(d.n, 1, 50);
    if (!n) bad('BAD_REQUEST');
    if (d.kind !== undefined && d.kind !== 'draw' && d.kind !== 'describe') bad('BAD_REQUEST');
    if (d.mode !== undefined && d.mode !== 'live' && d.mode !== 'chain') bad('BAD_REQUEST');
    const _ = store._();
    const rows = (await store.coll('steps').where({ state: STEP.PASSED, 'mod.submittedAt': _.gte(now() - 86400e3) }).limit(500).get()).data.filter((s) => (!d.kind || s.kind === d.kind) && !s.marker && (!d.mode || (d.mode === 'live') === !!s.roomId));
    for (let i = rows.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [rows[i], rows[j]] = [rows[j], rows[i]];
    }
    const items = [];
    for (const s of rows.slice(0, n)) items.push(await stepView(s));
    return { items, pool: rows.length };
  },

  async upholdReport(d, by) {
    const rid = requireId(d.reportId);
    const r = await store.txn(async (t) => {
      const rep = await store.getDocT(t, 'reports', rid);
      if (!rep) bad('BAD_REQUEST');
      if (rep.state === 'upheld') return { already: true, before: 'upheld' };
      const chain = await store.getDocT(t, 'chains', rep.chainId);
      let author;
      if (rep.stepId) {
        const s = await store.getDocT(t, 'steps', rep.stepId);
        if (!s) bad('BAD_REQUEST');
        author = s.author;
        if (s.state === STEP.PASSED) {
          await store.collT(t, 'steps').doc(s._id).update({ data: { state: STEP.HIDDEN, hiddenReason: 'admin' } });
          const ro = chain && chainLib.reopenLatest(chain, s.n, now());
          if (ro && ro.reopened) await players.putT(t, 'chains', chain._id, ro.chain);
        } // already hidden by the report, or deleted by its author: stays so
      } else {
        if (!chain) bad('BAD_REQUEST');
        author = chain.starter;
        if (!chain.hidden) await players.putT(t, 'chains', chain._id, chainLib.setChainHidden(chain, 'admin', now()));
      }
      await players.putT(t, 'reports', rid, Object.assign({}, rep, { state: 'upheld', resolvedAt: now() }));
      const sr = await players.strikeT(t, author, rep.stepId || null, 'report');
      return { before: rep.state, author, strike: sr };
    });
    if (r.already) return { already: true };
    await audit('upholdReport', rid, { state: r.before }, { state: 'upheld', strikes: r.strike.count, restrictedUntil: r.strike.restrictedUntil || 0 }, by);
    await store.writeEvent(r.author, 'strike', { src: 'report', level: r.strike.count });
    return { strikes: r.strike.count, restrictedUntil: r.strike.restrictedUntil || 0, flagged: r.strike.flagged };
  },

  async dismissReport(d, by) {
    const rid = requireId(d.reportId);
    const restore = d.restore === true;
    const r = await store.txn(async (t) => {
      const rep = await store.getDocT(t, 'reports', rid);
      if (!rep) bad('BAD_REQUEST');
      const before = rep.state;
      await players.putT(t, 'reports', rid, Object.assign({}, rep, { state: 'dismissed', resolvedAt: now() }));
      let restored = false;
      let why = null;
      if (restore) {
        const chain = await store.getDocT(t, 'chains', rep.chainId);
        if (rep.stepId) {
          const s = await store.getDocT(t, 'steps', rep.stepId);
          const ok = s && restorable(s, chain);
          if (ok && ok.ok) {
            await store.collT(t, 'steps').doc(s._id).update({ data: { state: STEP.PASSED, hiddenReason: null } });
            restored = true;
          } else why = ok ? ok.reason : 'gone';
        } else if (chain && chain.hidden) {
          await players.putT(t, 'chains', chain._id, chainLib.setChainHidden(chain, null, now()));
          restored = true;
        }
      }
      return { before, restored, why };
    });
    await audit('dismissReport', rid, { state: r.before }, { state: 'dismissed', restore, restored: r.restored, why: r.why }, by);
    return { restored: r.restored, reason: r.why };
  },

  async hideStep(d, by) {
    const sid = requireId(d.stepId);
    const r = await store.txn(async (t) => {
      const s = await store.getDocT(t, 'steps', sid);
      if (!s) bad('BAD_REQUEST');
      if (s.state === STEP.HIDDEN) return { before: s.state, changed: false };
      if (s.state !== STEP.PASSED) bad('BAD_REQUEST');
      await store.collT(t, 'steps').doc(sid).update({ data: { state: STEP.HIDDEN, hiddenReason: 'admin' } });
      const chain = await store.getDocT(t, 'chains', s.chainId);
      const ro = chain && chainLib.reopenLatest(chain, s.n, now());
      let reopened = false;
      if (ro && ro.reopened) {
        await players.putT(t, 'chains', chain._id, ro.chain);
        reopened = true;
      }
      return { before: s.state, changed: true, reopened };
    });
    await audit('hideStep', sid, { state: r.before }, { state: 'hidden', reopened: !!r.reopened }, by);
    return { changed: r.changed, reopened: !!r.reopened };
  },

  async restoreStep(d, by) {
    const sid = requireId(d.stepId);
    const r = await store.txn(async (t) => {
      const s = await store.getDocT(t, 'steps', sid);
      if (!s) bad('BAD_REQUEST');
      const chain = await store.getDocT(t, 'chains', s.chainId);
      const ok = restorable(s, chain);
      if (!ok.ok) return { restored: false, reason: ok.reason, before: s.state };
      await store.collT(t, 'steps').doc(sid).update({ data: { state: STEP.PASSED, hiddenReason: null } });
      return { restored: true, before: s.state };
    });
    await audit('restoreStep', sid, { state: r.before }, { restored: r.restored, reason: r.reason || null }, by);
    return { restored: r.restored, reason: r.reason || null };
  },

  async removeChain(d, by) {
    const id = requireId(d.chainId);
    const before = await store.txn(async (t) => {
      const chain = await store.getDocT(t, 'chains', id);
      if (!chain) bad('CHAIN_NOT_FOUND');
      await players.putT(t, 'chains', id, chainLib.removeChain(chain, now()));
      return chain.state;
    });
    await audit('removeChain', id, { state: before }, { state: STATE.REMOVED }, by);
    return { removed: true };
  },

  /** every chain of the room becomes removed, a room in play is ended, the room shows 「这一局已被移除」 (7.2, AC 64) */
  async removeRoom(d, by) {
    const id = roomio.roomIdOf(d);
    if (!id) bad('BAD_REQUEST');
    const out = await store.txn(async (t) => {
      const room = await store.getDocT(t, 'rooms', id);
      if (!room) bad('ROOM_NOT_FOUND');
      for (const cid of room.chainIds || []) {
        const chain = await store.getDocT(t, 'chains', cid);
        if (chain) await players.putT(t, 'chains', cid, chainLib.removeChain(chain, now()));
      }
      const next = roomLib.remove(room, now());
      await players.putT(t, 'rooms', id, next);
      return { before: room.state, room: next };
    });
    await roomio.writeSignals(out.room);
    await audit('removeRoom', id, { state: out.before }, { state: 'removed' }, by);
    return { removed: true, was: out.before };
  },

  /** imageMode 'sync' | 'async' and textApi 'game' | 'general' (6.9-6.10); 'async' ends the rooms in play (their remaining slots become markers) and closes lobbies */
  async setModeration(d, by) {
    const set = {};
    if (d.imageMode !== undefined) {
      if (d.imageMode !== 'sync' && d.imageMode !== 'async') bad('BAD_REQUEST');
      set['moderation.imageMode'] = d.imageMode;
    }
    if (d.textApi !== undefined) {
      if (d.textApi !== 'game' && d.textApi !== 'general') bad('BAD_REQUEST');
      set['moderation.textApi'] = d.textApi;
    }
    if (!Object.keys(set).length) bad('BAD_REQUEST');
    set.updatedAt = now();
    const before = await store.getDoc('app_config', 'live');
    await store.addIfAbsent('app_config', { _id: 'live', ugc: { createEnabled: true, viewEnabled: true, autoPausedUntil: 0 }, updatedAt: now() });
    await store.coll('app_config').doc('live').update({ data: set });
    appconfig.reset();
    const after = await store.getDoc('app_config', 'live');
    let finished = 0;
    let closed = 0;
    if (d.imageMode === 'async') {
      const playing = (await store.coll('rooms').where({ state: roomLib.STATE.PLAYING }).limit(200).get()).data;
      for (const r of playing) {
        await roomio.advanceIfDue(r._id, 'admin', 'switch');
        finished++;
      }
      const lobbies = (await store.coll('rooms').where({ state: roomLib.STATE.LOBBY }).limit(200).get()).data;
      const cfg = await appconfig.get(0);
      for (const r of lobbies) if (await roomops.closeLobbyNow(r._id, cfg.config.room, 'switch')) closed++;
    }
    await audit('setModeration', 'app_config/live', before && before.moderation ? before.moderation : null, after.moderation, by);
    return { moderation: after.moderation, roomsFinished: finished, lobbiesClosed: closed, note: 'clients see the change within 10 s (config cache)' };
  },

  async restrict(d, by) {
    if (typeof d.openid !== 'string' || !OPENID_RE.test(d.openid)) bad('BAD_REQUEST');
    if (!(await store.getDoc('players', d.openid))) bad('BAD_REQUEST'); // never create a player by typo
    const permanent = d.permanent === true;
    const days = permanent ? null : intIn(d.days, 1, 3650);
    if (!permanent && !days) bad('BAD_REQUEST');
    const after = await players.mutate(d.openid, (p) => {
      const np = strikes.restrict(p, permanent ? { permanent: true } : { days }, now());
      return { player: np, result: { restrictedUntil: np.restrictedUntil, permanent: !!np.permanent } };
    });
    await audit('restrict', 'player', null, after, by);
    return after;
  },

  async liftRestriction(d, by) {
    if (typeof d.openid !== 'string' || !OPENID_RE.test(d.openid)) bad('BAD_REQUEST');
    if (!(await store.getDoc('players', d.openid))) bad('BAD_REQUEST');
    const before = await players.mutate(d.openid, (p) => ({ player: strikes.liftRestriction(p), result: { restrictedUntil: p.restrictedUntil || 0, permanent: !!p.permanent } }));
    await audit('liftRestriction', 'player', before, { restrictedUntil: 0, permanent: false }, by);
    return { lifted: true };
  },

  async setUgc(d, by) {
    const set = {};
    for (const k of ['createEnabled', 'viewEnabled']) {
      if (d[k] === undefined) continue;
      if (typeof d[k] !== 'boolean') bad('BAD_REQUEST');
      set['ugc.' + k] = d[k];
    }
    if (!Object.keys(set).length) bad('BAD_REQUEST');
    if (d.createEnabled === true) set['ugc.autoPausedUntil'] = 0; // an explicit re-enable also lifts the breaker's pause (TD-26)
    set.updatedAt = now();
    const before = await store.getDoc('app_config', 'live');
    await store.addIfAbsent('app_config', { _id: 'live', ugc: { createEnabled: true, viewEnabled: true, autoPausedUntil: 0 }, updatedAt: now() });
    if (!(before && before.ugc)) await store.coll('app_config').doc('live').update({ data: { ugc: { createEnabled: true, viewEnabled: true, autoPausedUntil: 0 } } });
    await store.coll('app_config').doc('live').update({ data: set });
    const after = await store.getDoc('app_config', 'live');
    await audit('setUgc', 'app_config/live', before && before.ugc, after.ugc, by);
    return { ugc: after.ugc, note: 'clients see the change within 10 s (kill-switch cache)' };
  },
};

exports.main = store.handler(async (event, { openid }) => {
  if (typeof event.op !== 'string' || !OPS.includes(event.op)) bad('BAD_REQUEST');
  const by = openid || 'console';
  if (openid) await store.rateLimit(openid, 'admin', 1, 60); // allow-listed openid fallback only; the console carries none
  const res = await ops[event.op](event, by);
  return Object.assign({ ok: true, op: event.op }, res);
}, { auth: false, gate });

