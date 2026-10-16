'use strict';
// submitRun: full server-side validation (spec §14.3). The server simulation is authoritative.
const core = require('./common/coreapi');
const store = require('./common/store');
const limits = require('./common/limits');
const input = require('./common/input');
const rules = require('./common/rules');
const progress = require('./common/progress');
const anomaly = require('./common/anomaly');
const streak = require('./common/streak');
const notify = require('./common/notify');
const { now, fail } = require('./common/util');

/** Build the client response from a stored run. Rarity is read live for ranked runs. */
async function respond(run) {
  const out = {
    ok: true, runId: run.clientRunId, record: run.serverRecord, battles: run.result.battles,
    events: run.result.events, band: run.result.band, morale: run.result.morale,
    ranked: run.ranked, rarity: null,
  };
  if (run.ranked && run.streak) out.streak = { current: run.streak.current, best: run.streak.best };
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

/**
 * Inside the run's transaction: count this caller's FIRST answer to the challenge. The marker doc (deterministic _id
 * <challengeId>_<openid>) makes it once per caller; answerCount and bestAnswer are updated from the document as read
 * INSIDE the transaction. Returns true if this call counted.
 */
async function recordAnswer(t, challengeId, openid, record) {
  const markerId = `${challengeId}_${openid}`;
  if (await store.getDocT(t, 'challenge_answers', markerId)) return false;
  const ch = await store.getDocT(t, 'challenges', challengeId);
  if (!ch) return false; // purged meanwhile: nothing to count
  const upd = { answerCount: store._().inc(1) };
  if (!ch.bestAnswer || record.w > ch.bestAnswer.w) upd.bestAnswer = record;
  await t.collection('challenge_answers').doc(markerId).set({ data: { challengeId, openid, createdAt: now() } });
  await t.collection('challenges').doc(challengeId).update({ data: upd });
  return true;
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
    configVersion = core.configVersionFor(contentVersion);
    core.roster(contentVersion); // unknown version -> INVALID_ACTIONS
    rounds = core.buildSheet(seed, contentVersion, configVersion);
  }

  // ---- 3b. (v1) ranked: progressive prefix. All 5 rounds must have been released and the actions must
  //          extend the frozen prefix exactly; otherwise INVALID_ACTIONS plus observe-only flags. ----
  const invalid = async (msg, kind) => {
    if (ranked) {
      if (kind) await anomaly.flag(openid, clientRunId, dateKey, kind, { where: 'submitRun' });
      await anomaly.flag(openid, clientRunId, dateKey, 'invalid_ranked', { reason: String(msg).slice(0, 60) });
    }
    return fail('INVALID_ACTIONS', String(msg).slice(0, 120));
  };
  if (ranked) {
    const prog = await store.getDoc('daily_progress', progress.progressId(dateKey, openid));
    if (!prog || prog.released !== 5) await invalid('rounds not fully released', 'prefix');
    else if (!progress.isPrefix(prog.actions || [], actions)) await invalid('actions do not extend the frozen prefix', 'prefix');
  }

  // ---- 4. replay actions against the rebuilt sheet ----
  const rp = core.replay(seed, contentVersion, actions, replayMode, configVersion);
  if (!rp.ok) await invalid(rp.error || 'invalid actions');
  const lineup = core.normaliseLineup(rp.lineup);
  if (!lineup) await invalid('lineup must be 5 distinct generals in 5 slots');

  // ---- 5. simulate: the server record is authoritative ----
  const sim = core.simulate(lineup, seed, contentVersion, configVersion);
  const record = { w: sim.record.w, l: sim.record.l };
  const mismatch = !!clientRecord && (clientRecord.w !== record.w || clientRecord.l !== record.l);
  if (mismatch) {
    console.warn('[submitRun] record mismatch', JSON.stringify({ client: clientRecord, server: record, mode, dateKey }));
    await store.writeEvent(openid, 'error', { where: 'submitRun', code: 'MISMATCH', client: clientRecord, server: record });
    await anomaly.flag(openid, clientRunId, dateKey, 'mismatch', { client: clientRecord, server: record });
  }

  const start = ranked ? await store.getDoc('daily_starts', `${dateKey}_${openid}`) : null;
  const finalTokens = core.finalTokens(rounds, actions, rp);
  const run = {
    _id: runDocId, openid, clientRunId, mode, dateKey, seed, challengeId, actions,
    serverRecord: record, clientRecord, mismatch, ranked, contentVersion, configVersion,
    lineupIdx: core.lineupToIdx(lineup, contentVersion), lineup,
    finalTokens,
    result: { record, battles: sim.battles, events: sim.events, band: sim.band, morale: sim.morale },
    startedAt: start ? start.startedAt : null, submittedAt: nowMs,
  };

  // ---- 6. persist ----
  // The run, the ranked result / streak / stats AND the challenge answer bookkeeping commit in ONE transaction, so a retry or a
  // second device racing the same call can neither double count an answer nor lower the challenge's best answer.
  let firstAnswer = false;
  try {
    if (ranked || challenge) {
      let sctx = null;
      if (ranked) {
        await ensureStats(dateKey);
        sctx = { prev: (await streak.prevPublished(dateKey))[0] || null, next: await streak.nextPublished(dateKey) };
      }
      const _ = store._();
      await store.db().runTransaction(async (t) => {
        firstAnswer = false; // a retried transaction starts over
        if (ranked) {
          const st = await streak.applyRanked(t, openid, dateKey, sctx, nowMs);
          run.streak = { current: st.current, best: st.best, thisResult: st.streak };
        }
        await t.collection('runs').add({ data: run });
        if (ranked) {
          await t.collection('daily_results').add({
            data: {
              _id: `${dateKey}_${openid}`, dateKey, openid, runId: clientRunId, w: record.w, l: record.l,
              submittedAt: nowMs, lineupIdx: run.lineupIdx, lineupFac: core.lineupFactions(lineup, actions, finalTokens),
              streak: run.streak.thisResult, contentVersion,
            },
          });
          await t.collection('daily_stats').doc(dateKey).update({ data: { total: _.inc(1), [`hist.${record.w}`]: _.inc(1) } });
        }
        if (challenge) firstAnswer = await recordAnswer(t, challengeId, openid, record);
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

  if (ranked && start && nowMs - start.startedAt < core.anomalyMinMs()) {
    await anomaly.flag(openid, clientRunId, dateKey, 'fast', { ms: nowMs - start.startedAt });
  }
  const response = await respond(run);
  // ---- 8. (v1) opt-in answer notice: best effort, <= 2 s, never changes the response ----
  if (challenge && firstAnswer) await notify.sendOnce(challenge, record);
  return response;
}, { rate: limits.rateOf('submitRun') });
