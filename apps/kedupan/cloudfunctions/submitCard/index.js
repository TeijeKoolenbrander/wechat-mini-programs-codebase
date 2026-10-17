'use strict';
// submitCard: the one scoring write of the daily (spec 11.2, AC 15, 20). Server clock only. The entry write, the
// histogram increment and (on the 5th card) the streak update commit in one transaction, so a card counts exactly
// once even for parallel identical calls. All decisions are core/service applySubmit / cardReveal / completionBlock.
const store = require('./common/store');
const { fail, now } = require('./common/util');
const { core, rateOf } = require('./common/coreapi');
const daily = require('./common/daily');
const groups = require('./common/groups');

const strip = (doc) => {
  const { _id, ...rest } = doc;
  return rest;
};

exports.main = store.handler(async (event, { openid }) => {
  const v = core.V.submitCard(event);
  if (!v.ok) fail('INVALID_INPUT', 'invalid input');
  const { dateKey, idx, pos, groupRef } = v.v;
  const nowMs = now();
  const set = await daily.ensureSet(dateKey);
  const member = groupRef ? await groups.isMember(openid, groupRef) : false;
  // only the 5th card can complete the day (order is enforced), so the previous published day is needed only then
  const prev = set && idx === 4 ? await daily.prevPublished(dateKey) : null;
  const entryId = `${dateKey}_${openid}`;
  const _ = store._();

  let plan = null;
  let stats = null;
  let streakOut = null;
  await store.db().runTransaction(async (t) => {
    plan = null;
    stats = null;
    streakOut = null;
    const entry = await store.getDocT(t, 'daily_entries', entryId);
    const p = core.SV.applySubmit({ set, entry, dateKey, idx, pos, nowMs, openid });
    plan = { p, entry };
    if (!p.ok) return;
    let next = p.entry;
    if (p.complete) {
      const ps = await store.getDocT(t, 'player_stats', openid);
      const r = core.ST.onComplete(ps, dateKey, prev ? prev._id : null);
      stats = { ...r.stats, updatedAt: nowMs };
      streakOut = { current: r.stats.curStreak, best: r.stats.bestStreak };
      next = { ...next, streak: r.streak };
      plan.p = { ...p, entry: next };
      // D-2: player_stats also holds the UGC state (rules, strikes, restriction): update the streak fields, never replace the document
      if (ps) await store.collT(t, 'player_stats').doc(openid).update({ data: stats });
      else await store.collT(t, 'player_stats').doc(openid).set({ data: stats });
    }
    if (p.first) await store.collT(t, 'daily_entries').add({ data: next });
    else await store.collT(t, 'daily_entries').doc(entryId).set({ data: strip(next) });
    await store.collT(t, 'daily_card_stats').doc(`${dateKey}_${idx}`).update({ data: { [`hist.${pos}`]: _.inc(1), n: _.inc(1) } });
  });

  const p = plan.p;
  if (!p.ok) {
    if (p.code === 'CARD_DONE') {
      const hists = await daily.loadHists(dateKey);
      const b = member ? await groups.groupBlocks(openid, groupRef, dateKey, plan.entry) : null;
      const reveal = core.SV.cardReveal({ set, hists, idx, pos: plan.entry.pos[idx], group: b ? b[idx] : null, nowMs });
      fail('CARD_DONE', 'already answered', { reveal });
    }
    fail(p.code, p.code);
  }

  // best effort, never changes the answer (AC 82)
  if (p.fast) {
    await store.addIfAbsent('anomalies', { _id: `${openid}_${dateKey}_fast`, kind: 'fast', detail: { ms: p.entry.completeAt - p.entry.firstAt }, ts: nowMs }).catch(() => {});
  }

  const hists = await daily.loadHists(dateKey); // includes this answer
  const b = member ? await groups.groupBlocks(openid, groupRef, dateKey, p.entry) : null;
  const reveal = core.SV.cardReveal({ set, hists, idx, pos, group: b ? b[idx] : null, nowMs });
  const out = { ok: true, dateKey, ...reveal, complete: p.complete };
  if (p.complete) Object.assign(out, core.SV.completionBlock({ set, hists, entry: p.entry, nowMs }), { streak: streakOut });
  return out;
}, { rate: rateOf('submitCard') });
