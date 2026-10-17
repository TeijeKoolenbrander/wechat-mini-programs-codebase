'use strict';
// admin: the takedown and offender path for typed clues (spec 11.7, D-2, AC 93). NO admin UI: the founder (or a delegate)
// runs it from the cloud console's function test invocation, which carries no OPENID. A call that carries an OPENID is
// refused with FORBIDDEN unless that openid is in the ADMIN_OPENIDS allow-list (fallback if the console turns out to carry
// one). Never enable the HTTP access service for this function. Every op writes audit_log. This is the ONLY function
// that returns a host openid, a strike count, a clue's moderation block or the text of a hidden clue. It never returns a
// reporter's openid. Copied from 传画接龙 admin and adapted to rounds.
const store = require('./common/store');
const { fail, now, isInt } = require('./common/util');
const { core, CONFIG, rateOf } = require('./common/coreapi');
const players = require('./common/players');
const env = require('./common/env');

const OPS = ['listReports', 'getRound', 'sample', 'upholdReport', 'dismissReport', 'hideClue', 'restoreClue', 'deleteClue', 'restrict', 'liftRestriction', 'setUgc', 'setModeration'];
const OPENID_RE = /^[A-Za-z0-9_-]{6,64}$/;
const ROUND_RE = /^[A-Z2-7]{8}$/;
const REPORT_CAP = 100; // reports read per round

const bad = () => fail('INVALID_INPUT', 'invalid input');
const roundIdOf = (d) => (typeof d.roundId === 'string' && ROUND_RE.test(d.roundId) ? d.roundId : bad());
const intIn = (v, min, max) => (isInt(v, min, max) ? v : null);

async function audit(op, target, before, after, by) {
  await store.coll('audit_log').add({ data: { op, target, before: before === undefined ? null : before, after: after === undefined ? null : after, by, ts: now() } });
}

/** a transaction whose result is carried out through a closure (the pattern of every function here) */
async function txn(fn) {
  let out;
  await store.db().runTransaction(async (t) => {
    out = await fn(t);
  });
  return out;
}

async function loadRound(id) {
  const r = await store.getDoc('rounds', id);
  if (!r) fail('ROUND_NOT_FOUND', 'ROUND_NOT_FOUND');
  return r;
}
async function reportsOf(roundId) {
  return (await store.coll('clue_reports').where({ roundId }).limit(REPORT_CAP).get()).data;
}
/** a report as the admin sees it: never the reporter */
const reportView = (r) => ({ reason: r.reason, state: r.state, ts: r.ts, resolvedAt: r.resolvedAt || null });
const clueSummary = (r) => ({
  mode: r.clueMode || null,
  text: typeof r.clueText === 'string' ? r.clueText : null,
  hidden: r.clueHidden === true,
  hiddenBy: r.clueHiddenBy || null,
  hiddenAt: r.clueHiddenAt || null,
  mod: r.clueMod || null,
});
const hiddenState = (r) => ({ hidden: r.clueHidden === true, by: r.clueHiddenBy || null });

const ops = {
  async listReports(d) {
    const state = ['open', 'upheld', 'dismissed'].includes(d.state) ? d.state : 'open';
    const limit = d.limit === undefined ? 20 : intIn(d.limit, 1, 50);
    if (!limit) bad();
    const rows = (await store.coll('clue_reports').where({ state }).orderBy('ts', 'asc').limit(limit).get()).data;
    const items = [];
    for (const r of rows) {
      const round = await store.getDoc('rounds', r.roundId);
      items.push({ roundId: r.roundId, state: r.state, reason: r.reason, ts: r.ts, ageMs: now() - r.ts, clue: round ? clueSummary(round) : null });
    }
    return { items };
  },

  async getRound(d) {
    const round = await loadRound(roundIdOf(d));
    const reports = await reportsOf(round._id);
    const host = await players.read(round.hostOpenid);
    const view = {
      roundId: round._id,
      status: round.status,
      left: round.left,
      right: round.right,
      createdAt: round.createdAt,
      guessCount: round.guessCount,
      hostOpenid: round.hostOpenid, // the only place a host openid is shown
      clue: clueSummary(round),
      reports: reports.map(reportView),
      host: host ? { strikes30d: core.STK.activeStrikes(host.strikes, now()).length, restriction: core.STK.restrictionOf(host, now()), reviewFlag: host.reviewFlag === true } : null,
    };
    const logs = (await store.coll('mod_log').where({ roundId: round._id }).limit(20).get()).data;
    view.modLog = logs.map((l) => ({ api: l.api, result: l.result, label: l.label, latencyMs: l.latencyMs, errCode: l.errCode || null, text: l.text === undefined ? null : l.text, ts: l.ts }));
    return { round: view };
  },

  async sample(d) {
    const n = d.n === undefined ? 20 : intIn(d.n, 1, 50);
    if (!n) bad();
    const _ = store._();
    const rows = (await store.coll('rounds').where({ clueMode: 'text', 'clueMod.ts': _.gte(now() - CONFIG.ugc.sampleWindowMs) }).limit(500).get()).data.filter((r) => r.clueHidden !== true && typeof r.clueText === 'string');
    for (let i = rows.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [rows[i], rows[j]] = [rows[j], rows[i]];
    }
    return { items: rows.slice(0, n).map((r) => ({ roundId: r._id, left: r.left, right: r.right, text: r.clueText, ts: r.clueMod ? r.clueMod.ts : null })), pool: rows.length };
  },

  /** the reports stand: every report of the round becomes upheld, the clue stays hidden, the host gets ONE strike (once per round) */
  async upholdReport(d, by) {
    const id = roundIdOf(d);
    await loadRound(id); // ROUND_NOT_FOUND first
    const reports = await reportsOf(id);
    if (!reports.length) bad(); // nothing to uphold
    const out = await txn(async (t) => {
      const round = await store.getDocT(t, 'rounds', id);
      if (!round) fail('ROUND_NOT_FOUND', 'ROUND_NOT_FOUND');
      if (round.clueMode !== 'text') bad();
      if (round.clueUpheld === true) return { already: true };
      const before = hiddenState(round);
      await store.collT(t, 'rounds').doc(id).update({ data: { clueHidden: true, clueHiddenAt: round.clueHiddenAt || now(), clueHiddenBy: round.clueHiddenBy || 'admin', clueUpheld: true } });
      for (const r of reports) await store.collT(t, 'clue_reports').doc(r._id).update({ data: { state: 'upheld', resolvedAt: now() } });
      const sr = await players.strikeT(t, round.hostOpenid);
      return { before, strike: sr, reports: reports.length };
    });
    if (out.already) return { already: true };
    await players.emitStrike('upheld', out.strike);
    await audit('upholdReport', id, { clue: out.before }, { clue: { hidden: true }, reports: out.reports, strikes30d: out.strike.count, restrictedUntil: out.strike.restrictedUntil || 0 }, by);
    return { strikes30d: out.strike.count, restrictedUntil: out.strike.restrictedUntil || 0, flagged: out.strike.flagged, reports: out.reports };
  },

  /** the reports were wrong: dismissed; with restore the clue is shown again (a deleted clue cannot be restored) */
  async dismissReport(d, by) {
    const id = roundIdOf(d);
    if (d.restore !== undefined && typeof d.restore !== 'boolean') bad();
    const restore = d.restore === true;
    const reports = await reportsOf(id);
    const out = await txn(async (t) => {
      const round = await store.getDocT(t, 'rounds', id);
      if (!round) fail('ROUND_NOT_FOUND', 'ROUND_NOT_FOUND');
      for (const r of reports) await store.collT(t, 'clue_reports').doc(r._id).update({ data: { state: 'dismissed', resolvedAt: now() } });
      const before = hiddenState(round);
      let restored = false;
      if (restore && round.clueHidden === true) {
        const r = core.U.restoreClue(round);
        if (r.ok) {
          await store.collT(t, 'rounds').doc(id).update({ data: { clueHidden: false, clueHiddenAt: store._().remove(), clueHiddenBy: store._().remove() } });
          restored = true;
        }
      }
      return { before, restored, reports: reports.length };
    });
    await audit('dismissReport', id, { clue: out.before }, { reports: out.reports, restore, restored: out.restored }, by);
    return { restored: out.restored, reports: out.reports };
  },

  async hideClue(d, by) {
    const id = roundIdOf(d);
    const out = await txn(async (t) => {
      const round = await store.getDocT(t, 'rounds', id);
      if (!round) fail('ROUND_NOT_FOUND', 'ROUND_NOT_FOUND');
      if (round.clueMode !== 'text') bad();
      const before = hiddenState(round);
      if (round.clueHidden === true) return { before, changed: false };
      await store.collT(t, 'rounds').doc(id).update({ data: { clueHidden: true, clueHiddenAt: now(), clueHiddenBy: 'admin' } });
      return { before, changed: true };
    });
    await audit('hideClue', id, { clue: out.before }, { clue: { hidden: true } }, by);
    return { changed: out.changed };
  },

  async restoreClue(d, by) {
    const id = roundIdOf(d);
    const out = await txn(async (t) => {
      const round = await store.getDocT(t, 'rounds', id);
      if (!round) fail('ROUND_NOT_FOUND', 'ROUND_NOT_FOUND');
      if (round.clueMode !== 'text') bad();
      const before = hiddenState(round);
      const r = core.U.restoreClue(round);
      if (!r.ok) return { before, restored: false, why: 'deleted' };
      if (round.clueHidden !== true) return { before, restored: true, changed: false };
      await store.collT(t, 'rounds').doc(id).update({ data: { clueHidden: false, clueHiddenAt: store._().remove(), clueHiddenBy: store._().remove() } });
      return { before, restored: true, changed: true };
    });
    await audit('restoreClue', id, { clue: out.before }, { restored: out.restored, why: out.why || null }, by);
    return { restored: out.restored, reason: out.why || null };
  },

  /** deletion request: the text leaves the round for good; mod_log evidence stays */
  async deleteClue(d, by) {
    const id = roundIdOf(d);
    const out = await txn(async (t) => {
      const round = await store.getDocT(t, 'rounds', id);
      if (!round) fail('ROUND_NOT_FOUND', 'ROUND_NOT_FOUND');
      if (round.clueMode !== 'text') bad();
      const before = { ...hiddenState(round), hadText: typeof round.clueText === 'string' };
      await store.collT(t, 'rounds').doc(id).update({ data: { clueText: null, clueHidden: true, clueHiddenAt: round.clueHiddenAt || now(), clueHiddenBy: 'admin' } });
      return { before };
    });
    await audit('deleteClue', id, { clue: out.before }, { clue: { hidden: true, hadText: false } }, by);
    return { deleted: true };
  },

  async restrict(d, by) {
    if (typeof d.openid !== 'string' || !OPENID_RE.test(d.openid)) bad();
    if (!(await players.read(d.openid))) bad(); // never create a player by typo
    const permanent = d.permanent === true;
    const days = permanent ? null : intIn(d.days, 1, 3650);
    if (!permanent && !days) bad();
    const after = await players.mutate(d.openid, (p) => {
      const np = core.STK.restrict(p, permanent ? { permanent: true } : { days }, now());
      return { player: np, result: { restrictedUntil: np.restrictedUntil, permanent: !!np.restrictPermanent } };
    });
    await audit('restrict', d.openid, null, after, by);
    return after;
  },

  async liftRestriction(d, by) {
    if (typeof d.openid !== 'string' || !OPENID_RE.test(d.openid)) bad();
    if (!(await players.read(d.openid))) bad();
    const before = await players.mutate(d.openid, (p) => ({ player: core.STK.liftRestriction(p, now()), result: { restrictedUntil: p.restrictedUntil || 0, permanent: !!p.restrictPermanent } }));
    await audit('liftRestriction', d.openid, before, { restrictedUntil: 0, permanent: false }, by);
    return { lifted: true };
  },

  /** the kill switches (spec 11.6): createEnabled, viewEnabled. Effective for clients within 10 s. */
  async setUgc(d, by) {
    const set = {};
    for (const k of ['createEnabled', 'viewEnabled']) {
      if (d[k] === undefined) continue;
      if (typeof d[k] !== 'boolean') bad();
      set['ugc.' + k] = d[k];
    }
    if (!Object.keys(set).length) bad();
    set.updatedAt = now();
    const before = await store.getDoc('app_config', 'live');
    await store.addIfAbsent('app_config', { _id: 'live', ugc: { createEnabled: true, viewEnabled: true }, updatedAt: now() });
    if (!(before && before.ugc)) await store.coll('app_config').doc('live').update({ data: { ugc: { createEnabled: true, viewEnabled: true } } });
    await store.coll('app_config').doc('live').update({ data: set });
    store.clearCache();
    const after = await store.getDoc('app_config', 'live');
    await audit('setUgc', 'app_config/live', before && before.ugc, after.ugc, by);
    await store.writeEvent('server', 'ugc_pause', { createEnabled: after.ugc.createEnabled !== false, viewEnabled: after.ugc.viewEnabled !== false });
    return { ugc: after.ugc, note: 'clients see the change within 10 s (config cache)' };
  },

  /** textApi 'game' (default) | 'general' (the fallback msgSecCheck) */
  async setModeration(d, by) {
    if (d.textApi !== 'game' && d.textApi !== 'general') bad();
    const before = await store.getDoc('app_config', 'live');
    await store.addIfAbsent('app_config', { _id: 'live', ugc: { createEnabled: true, viewEnabled: true }, updatedAt: now() });
    await store.coll('app_config').doc('live').update({ data: { 'moderation.textApi': d.textApi, updatedAt: now() } });
    store.clearCache();
    const after = await store.getDoc('app_config', 'live');
    await audit('setModeration', 'app_config/live', before && before.moderation ? before.moderation : null, after.moderation, by);
    return { moderation: after.moderation, note: 'effective within 10 s' };
  },
};

exports.main = store.handler(async (event, { openid }) => {
  // the console carries no OPENID; a call that does must be on the allow-list (fallback), else FORBIDDEN
  if (openid && !env.adminOpenids().includes(openid)) fail('FORBIDDEN', 'FORBIDDEN');
  if (typeof event.op !== 'string' || !OPS.includes(event.op)) bad();
  const by = openid ? 'console/' + openid : 'console';
  if (openid) await store.rateLimit(openid, 'fn_admin', 1, rateOf('admin').limit);
  const res = await ops[event.op](event, by);
  return Object.assign({ ok: true, op: event.op }, res);
}, { auth: false });
