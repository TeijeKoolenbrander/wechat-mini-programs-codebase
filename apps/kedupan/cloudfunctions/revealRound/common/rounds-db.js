'use strict';
// Round plumbing: lazy transitions, the single reveal path, guess lists and subscribe sends (spec 7.4, 11.2).
const store = require('./store');
const { core, CONFIG } = require('./coreapi');
const { now, rowHash } = require('./util');
const groups = require('./groups');

const SEND_BUDGET_MS = 2000; // in-request send budget; the rest is sent by sweepRounds (TD-34)
const DEFAULT_FIELDS = { spectrum: 'thing1', mq: 'number2', time: 'time3' };

/**
 * The guesses of a round for the reveal view and the score. On-time guesses are few (the 8th reveals) and are read in
 * full; late guesses are capped at CONFIG.caps.guessesShown for display (M3), so a viral round cannot make one call
 * read thousands of rows. mq counts on-time guesses only, so the cap never changes a score.
 */
async function guessesOf(roundId) {
  const onTime = await store.queryAll('guesses', { roundId, late: false }, { max: 100 });
  const late = await store.queryAll('guesses', { roundId, late: true }, { max: CONFIG.caps.guessesShown });
  return onTime.concat(late);
}

/**
 * Reveal a round on any path (host tap, 8th guess, timer). Exactly one caller wins the status flip inside the
 * transaction (AC 32); the loser returns the already revealed round. The guess list is re-read until it matches the
 * on-time count the transaction saw, so mq never misses a concurrent guess.
 * @returns {Promise<{round:object, guesses:object[], did:boolean}>}
 */
async function revealRound(round, by) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const guesses = await guessesOf(round._id);
    let result = null;
    await store.db().runTransaction(async (t) => {
      result = null;
      const cur = await store.getDocT(t, 'rounds', round._id);
      if (!cur) return;
      if (cur.status === 'revealed') {
        result = { round: cur, did: false, consistent: true };
        return;
      }
      const onTime = guesses.filter((g) => !g.late).length;
      if (onTime !== cur.guessCount) {
        result = { consistent: false };
        return;
      }
      const next = core.SV.applyReveal({ ...cur }, guesses, by, now());
      await store.collT(t, 'rounds').doc(cur._id).update({ data: { status: 'revealed', revealedAt: next.revealedAt, revealBy: by, mq: next.mq } });
      result = { round: next, did: true, consistent: true };
    });
    if (!result) return { round: null, guesses, did: false };
    if (!result.consistent) continue;
    const all = result.did ? guesses : await guessesOf(round._id);
    if (result.did) {
      // server event round_reveal (spec 12): once per reveal; only the transaction winner gets did=true, so the host
      // tap, the 8th guess, the lazy timer and the sweep never double count. No openid, no groupRef.
      await store.writeEvent('server', 'round_reveal', { roundId: round._id, by, guesses: guesses.filter((g) => !g.late).length, mq: result.round.mq === undefined ? null : result.round.mq });
      await sendGrants(result.round, SEND_BUDGET_MS);
    }
    return { round: result.round, guesses: all, did: result.did };
  }
  throw new Error('reveal: guess list kept changing');
}

/**
 * Lazy transitions on read/write (24 h reveal or noGuesses, stale draft discarded). Returns the round or null.
 * A discarded draft is deleted. The destructive transitions (discard, noGuesses) run in a transaction that RE-READS the
 * round and re-decides on the fresh document (L1): a setClue that opened the draft, or a guess that landed, between the
 * first read and the write wins, and the transition is not applied on stale data. The reveal path already re-checks
 * inside its own transaction.
 */
async function loadRound(roundId) {
  const r = await store.getDoc('rounds', roundId);
  if (!r) return null;
  const t = core.R.lazyTransition(r, now());
  if (!t) return r;
  if (t === 'reveal') {
    const x = await revealRound(r, 'timer');
    return x.round;
  }
  let out = null;
  let again = null;
  await store.db().runTransaction(async (tx) => {
    out = null;
    again = null;
    const cur = await store.getDocT(tx, 'rounds', roundId);
    if (!cur) return;
    const next = core.R.lazyTransition(cur, now());
    if (next === 'discard') {
      await store.collT(tx, 'rounds').doc(roundId).remove();
    } else if (next === 'noGuesses') {
      await store.collT(tx, 'rounds').doc(roundId).update({ data: { status: 'noGuesses' } });
      out = { ...cur, status: 'noGuesses' };
    } else if (next === 'reveal') {
      again = cur; // a guess arrived meanwhile: the round now has to be revealed instead
    } else {
      out = cur; // no longer due (opened, or revealed by someone else)
    }
  });
  if (again) return (await revealRound(again, 'timer')).round;
  return out;
}

function two(n) {
  return String(n).padStart(2, '0');
}
function bjtTime(ms) {
  const d = new Date(ms + 8 * 3600e3);
  return `${d.getUTCFullYear()}-${two(d.getUTCMonth() + 1)}-${two(d.getUTCDate())} ${two(d.getUTCHours())}:${two(d.getUTCMinutes())}`;
}

/**
 * Claim each unused grant of a revealed round (transaction: one grant -> at most one message) and send. Best effort,
 * never throws; stops claiming after `budgetMs` so the remaining grants are sent by the sweep.
 * @returns {Promise<number>} messages sent
 */
async function sendGrants(round, budgetMs) {
  let sent = 0;
  try {
    const started = now();
    const cfg = await groups.appConfig();
    if (!cfg || !cfg.subscribe || !cfg.subscribe.tmplId) return 0;
    const fields = { ...DEFAULT_FIELDS, ...(cfg.subscribe.fields || {}) };
    const grants = await store.queryAll('sub_grants', { roundId: round._id, used: false });
    for (const g of grants) {
      if (now() - started > budgetMs) break;
      let claimed = false;
      await store.db().runTransaction(async (t) => {
        claimed = false;
        const cur = await store.getDocT(t, 'sub_grants', g._id);
        if (!cur || cur.used) return;
        await store.collT(t, 'sub_grants').doc(g._id).update({ data: { used: true, claimedAt: now() } });
        claimed = true;
      });
      if (!claimed) continue;
      let errCode = null;
      try {
        const api = store.cloud.openapi && store.cloud.openapi.subscribeMessage;
        if (!api || typeof api.send !== 'function') throw Object.assign(new Error('openapi unavailable'), { errCode: 'NO_OPENAPI' });
        const msg = {
          touser: g.openid,
          templateId: g.tmplId || cfg.subscribe.tmplId,
          page: `index?r=${round._id}`,
          data: {
            [fields.spectrum]: { value: `${round.left}↔${round.right}`.slice(0, 20) },
            [fields.mq]: { value: round.mq === null || round.mq === undefined ? '-' : String(round.mq) },
            [fields.time]: { value: bjtTime(now()) },
          },
        };
        if (process.env.SUBSCRIBE_MP_STATE) msg.miniprogramState = process.env.SUBSCRIBE_MP_STATE;
        let timer;
        const cap = new Promise((_r, rej) => {
          timer = setTimeout(() => rej(Object.assign(new Error('send timeout'), { errCode: 'TIMEOUT' })), SEND_BUDGET_MS);
        });
        try {
          await Promise.race([api.send(msg), cap]);
        } finally {
          clearTimeout(timer);
        }
      } catch (e) {
        errCode = e && e.errCode !== undefined ? e.errCode : 'ERR';
      }
      try {
        await store.updateDoc('sub_grants', g._id, errCode === null ? { sentAt: now() } : { sendErrCode: String(errCode) });
      } catch (e) {
        /* bookkeeping only */
      }
      await store.writeEvent('server', 'subscribe_send', { where: g.openid === round.hostOpenid ? 'host' : 'guess', result: errCode === null ? 'ok' : 'fail', errCode: errCode === null ? null : String(errCode) });
      if (errCode === null) sent++;
    }
  } catch (e) {
    console.warn('[subscribe] send failed', store.errText(e));
  }
  return sent;
}

module.exports = { guessesOf, revealRound, loadRound, sendGrants, rowHash, SEND_BUDGET_MS, CONFIG };
