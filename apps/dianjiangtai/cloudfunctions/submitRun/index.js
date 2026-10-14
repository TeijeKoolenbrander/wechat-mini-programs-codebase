'use strict';
// submitRun: full server-side validation (spec §14.3). The server simulation is authoritative.
const core = require('./common/coreapi');
const store = require('./common/store');
const input = require('./common/input');
const rules = require('./common/rules');
const { now, fail } = require('./common/util');

const SUBMITS_PER_MIN = 30;

/** Build the client response from a stored run. Rarity is read live for ranked runs. */
async function respond(run) {
  const out = {
    ok: true, runId: run.clientRunId, record: run.serverRecord, battles: run.result.battles,
    events: run.result.events, band: run.result.band, morale: run.result.morale,
    ranked: run.ranked, rarity: null,
  };
  if (run.ranked && run.dateKey) {
    const st = await store.getDoc('daily_stats', run.dateKey);
    if (st && st.total >= 30) {
      const atOrBetter = st.hist.slice(run.serverRecord.w).reduce((a, b) => a + b, 0);
      out.rarity = { pct: Math.round((atOrBetter / st.total) * 1000) / 10, total: st.total };
    }
  }
  if (run.challengeId) {
    const ch = await store.getDoc('challenges', run.challengeId);
    if (ch) {
      // the sharer's lineup on a still-playable daily seed is a spoiler until the caller has their ranked daily
      const locked = await rules.dailyLocked(ch.mode === 'daily' ? ch.dateKey : null, run.openid, now());
      out.challengeCompare = { theirRecord: ch.record, theirLineup: locked ? null : ch.lineup, lineupLocked: locked, myRecord: run.serverRecord };
    }
  }
  return out;
}

/** A ranked result already exists: same clientRunId -> idempotent success, otherwise ALREADY_PLAYED. */
async function alreadyPlayed(openid, prior, clientRunId) {
  const priorRun = await store.getDoc('runs', `${openid}_${prior.runId}`);
  if (prior.runId === clientRunId && priorRun) return respond(priorRun);
  return fail('ALREADY_PLAYED', 'daily already played', priorRun ? { result: await respond(priorRun) } : {});
}

async function ensureStats(dateKey) {
  await store.addIfAbsent('daily_stats', { _id: dateKey, hist: new Array(13).fill(0), total: 0 });
}

exports.main = store.handler(async (event, { openid }) => {
  // ---- 1. input validation (identity is NEVER read from input) ----
  const clientRunId = input.clientRunId(event.clientRunId);
  const mode = input.mode(event.mode);
  const actions = input.actions(event.actions);
  const clientRecord = input.optRecord(event.clientRecord);
  const runDocId = `${openid}_${clientRunId}`;
  const nowMs = now();

  // ---- 2. idempotency: same clientRunId returns the stored result, never double counts ----
  const existing = await store.getDoc('runs', runDocId);
  if (existing) return respond(existing);
  await store.rateLimit(openid, 'submit', 1, SUBMITS_PER_MIN);

  // ---- 3. resolve seed / versions / ranking eligibility per mode ----
  let seed;
  let contentVersion;
  let configVersion;
  let dateKey = null;
  let ranked = false;
  let challenge = null;
  let challengeId = null;
  let replayMode = mode;
  let rounds;

  if (mode === 'daily') {
    dateKey = input.optDateKey(event.dateKey);
    if (!dateKey) fail('INVALID_ACTIONS', 'dateKey required for daily');
    const seedDoc = await store.getDoc('daily_seeds', dateKey);
    if (!seedDoc) fail('SEED_NOT_FOUND', 'no seed for date');
    const ws = rules.windowState(dateKey, nowMs);
    if (ws === 'future') fail('INVALID_ACTIONS', 'date in the future');
    if (ws === 'late') fail('LATE_SUBMIT', 'daily expired');
    const start = await store.getDoc('daily_starts', `${dateKey}_${openid}`);
    if (!start) fail('NOT_STARTED', 'daily was never started');
    const prior = await store.getDoc('daily_results', `${dateKey}_${openid}`);
    if (prior) return alreadyPlayed(openid, prior, clientRunId);
    seed = seedDoc.seed; contentVersion = seedDoc.contentVersion; configVersion = seedDoc.configVersion;
    rounds = seedDoc.rounds;
    ranked = true;
  } else if (mode === 'challenge') {
    challengeId = input.challengeId(event.challengeId);
    challenge = await rules.loadAnswerableChallenge(challengeId, openid, nowMs);
    seed = challenge.seed; contentVersion = challenge.contentVersion; configVersion = challenge.configVersion;
    rounds = challenge.rounds;
    dateKey = challenge.dateKey || null;
    if (challenge.mode === 'daily' && dateKey) {
      // The run IS the caller's daily attempt only if the daily was started (startRun) inside the
      // submit window and no daily result exists. Otherwise a friendly match (never ranked).
      const ws = rules.windowState(dateKey, nowMs);
      if (ws === 'open' || ws === 'grace') {
        const start = await store.getDoc('daily_starts', `${dateKey}_${openid}`);
        const prior = await store.getDoc('daily_results', `${dateKey}_${openid}`);
        ranked = !!start && !prior;
      }
    }
  } else {
    seed = input.seedU32(event.seed);
    const cv = input.optContentVersion(event.contentVersion);
    const v = core.currentVersions();
    contentVersion = cv || v.contentVersion;
    configVersion = v.configVersion;
    core.roster(contentVersion); // unknown version -> INVALID_ACTIONS
    rounds = core.buildSheet(seed, contentVersion);
  }

  // ---- 4. replay actions against the rebuilt sheet ----
  const rp = core.replay(seed, contentVersion, actions, replayMode);
  if (!rp.ok) fail('INVALID_ACTIONS', String(rp.error || 'invalid actions').slice(0, 120));
  const lineup = core.normaliseLineup(rp.lineup);
  if (!lineup) fail('INVALID_ACTIONS', 'lineup must be 5 distinct generals in 5 slots');

  // ---- 5. simulate: the server record is authoritative ----
  const sim = core.simulate(lineup, seed, contentVersion, configVersion);
  const record = { w: sim.record.w, l: sim.record.l };
  const mismatch = !!clientRecord && (clientRecord.w !== record.w || clientRecord.l !== record.l);
  if (mismatch) {
    console.warn('[submitRun] record mismatch', JSON.stringify({ client: clientRecord, server: record, mode, dateKey }));
    await store.writeEvent(openid, 'error', { where: 'submitRun', code: 'MISMATCH', client: clientRecord, server: record });
  }

  let priorAnswer = null;
  if (challengeId) priorAnswer = await rules.priorAnswer(openid, challengeId);

  const start = ranked ? await store.getDoc('daily_starts', `${dateKey}_${openid}`) : null;
  const run = {
    _id: runDocId, openid, clientRunId, mode, dateKey, seed, challengeId, actions,
    serverRecord: record, clientRecord, mismatch, ranked, contentVersion, configVersion,
    lineupIdx: core.lineupToIdx(lineup, contentVersion), lineup,
    finalTokens: core.finalTokens(rounds, actions, rp),
    result: { record, battles: sim.battles, events: sim.events, band: sim.band, morale: sim.morale },
    startedAt: start ? start.startedAt : null, submittedAt: nowMs,
  };

  // ---- 6. persist ----
  try {
    if (ranked) {
      await ensureStats(dateKey);
      const _ = store._();
      await store.db().runTransaction(async (t) => {
        await t.collection('runs').add({ data: run });
        await t.collection('daily_results').add({
          data: {
            _id: `${dateKey}_${openid}`, dateKey, openid, runId: clientRunId, w: record.w, l: record.l,
            submittedAt: nowMs, lineupIdx: run.lineupIdx, contentVersion,
          },
        });
        await t.collection('daily_stats').doc(dateKey).update({ data: { total: _.inc(1), [`hist.${record.w}`]: _.inc(1) } });
      });
    } else {
      await store.db().collection('runs').add({ data: run });
    }
  } catch (e) {
    if (!store.isDup(e)) throw e;
    // lost a race: either the same clientRunId (idempotent) or a second distinct daily
    const again = await store.getDoc('runs', runDocId);
    if (again) return respond(again);
    const prior = ranked ? await store.getDoc('daily_results', `${dateKey}_${openid}`) : null;
    if (prior) return alreadyPlayed(openid, prior, clientRunId);
    throw e;
  }

  // ---- 7. challenge answer bookkeeping (first answer by this caller only; best effort) ----
  if (challenge && !priorAnswer) {
    try {
      const _ = store._();
      const upd = { answerCount: _.inc(1) };
      if (!challenge.bestAnswer || record.w > challenge.bestAnswer.w) upd.bestAnswer = record;
      await store.db().collection('challenges').doc(challengeId).update({ data: upd });
    } catch (e) {
      console.warn('challenge bookkeeping failed', store.errText(e));
    }
  }
  return respond(run);
});
