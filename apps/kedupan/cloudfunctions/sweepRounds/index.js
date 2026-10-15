'use strict';
// sweepRounds: hourly timer (config.json). Server-only.
//   1. discards drafts older than 30 min (never shareable, ROUND_NOT_FOUND for everyone)
//   2. reveals open rounds older than 24 h (>= 1 guess) or marks them noGuesses
//   3. sends subscribe messages still pending for revealed rounds
// Idempotent: each step only acts on rounds still in the earlier state, and reveal/claim are transactions.
const store = require('./common/store');
const rounds = require('./common/rounds');
const { now, configuredTimeoutMs } = require('./common/util');

const BATCH = 100;

exports.main = store.handler(async (event, { startedAt }) => {
  const nowMs = now();
  const deadline = startedAt + 0.7 * configuredTimeoutMs();
  const _ = store._();
  const out = { ok: true, draftsRemoved: 0, revealed: 0, noGuesses: 0, notified: 0 };

  const drafts = (await store.db().collection('rounds').where({ status: 'draft', createdAt: _.lt(nowMs - rounds.DRAFT_TTL_MS) }).limit(BATCH).get()).data;
  for (const d of drafts) {
    const r = await store.db().collection('rounds').doc(d._id).remove();
    out.draftsRemoved += (r && r.stats && r.stats.removed) || 0;
  }

  const stale = (await store.db().collection('rounds').where({ status: 'open', createdAt: _.lt(nowMs - rounds.AUTO_REVEAL_MS) }).limit(BATCH).get()).data;
  for (const s of stale) {
    if (now() > deadline) break;
    const f = await rounds.flipReveal(s._id, 'timer', nowMs);
    if (!f.flipped) continue;
    if (f.round.status === 'revealed') out.revealed++; else out.noGuesses++;
    const n = await rounds.notifyRound(f.round, { budgetMs: 2000 });
    out.notified += n.sent;
  }

  // pending messages (the in-request best-effort send ran out of budget, or the config arrived later)
  const pending = (await store.db().collection('sub_grants').where({ used: false }).limit(BATCH).get()).data;
  const ids = [...new Set(pending.map((g) => g.roundId))];
  for (const id of ids) {
    if (now() > deadline) break;
    const r = await store.getDoc('rounds', id);
    if (r && r.status === 'revealed') out.notified += (await rounds.notifyRound(r, { budgetMs: 2000 })).sent;
  }
  return out;
}, { auth: false, serverOnly: true });
