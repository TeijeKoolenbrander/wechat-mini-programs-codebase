/**
 * Document-level server logic (spec 5, 8, 11). Pure JS over plain documents: no database, no clock (callers pass
 * `nowMs`), no randomness (callers pass `rng`). The cloud functions read documents, call these, then write inside
 * their transaction; the mock server calls the very same functions over in-memory collections. That is what keeps
 * client mock, server and tests on one set of rules (AC 7, 19).
 *
 * Document shapes: cloudfunctions/CONTRACT.md section "Collections".
 */

const { CONFIG } = require('./config');
const S = require('./score');
const { cardText } = require('./content');
const { beijingDateKey, addDays } = require('./date');
const W = require('./windows');
const G = require('./group');
const R = require('./rounds');
const U = require('./ugc');

const N = CONFIG.daily.cards;

// ---- documents --------------------------------------------------------------------------------------------------

/** daily_sets document (spec 11.1). `cards` are server cards (with anchor). */
function newDailySet(o) {
  return {
    _id: o.dateKey,
    dateKey: o.dateKey,
    issueNo: W.issueOf(o.dateKey, o.launchKey),
    contentVersion: o.contentVersion,
    cards: o.cards.map((c) => ({ itemId: c.itemId, spectrumId: c.spectrumId, left: c.left, right: c.right, prompt: c.prompt, anchor: c.anchor, cat: c.cat })),
    boardSalt: o.boardSalt,
    edits: [],
    source: o.source,
    createdAt: o.nowMs,
  };
}

/** The 5 zeroed daily_card_stats documents for a set. */
function newStatsDocs(dateKey) {
  const out = [];
  for (let i = 0; i < N; i++) out.push({ _id: dateKey + '_' + i, hist: S.emptyHist(), n: 0 });
  return out;
}

/**
 * Ops replaces card `idx` (spec 4.2, AC 24): same index, histogram restarts, edit logged. Returns the new set and the
 * reset stats doc. (The console does this by hand; the function exists so the rule is tested and scripted.)
 */
function replaceCard(set, idx, newCard, nowMs) {
  const next = { ...set, cards: set.cards.slice(), edits: set.edits.concat([{ ts: nowMs, idx, from: set.cards[idx].itemId, to: newCard.itemId }]) };
  next.cards[idx] = { itemId: newCard.itemId, spectrumId: newCard.spectrumId, left: newCard.left, right: newCard.right, prompt: newCard.prompt, anchor: newCard.anchor, cat: newCard.cat };
  return { set: next, stats: { _id: set.dateKey + '_' + idx, hist: S.emptyHist(), n: 0 } };
}

/** daily_entries document for a first answer. */
function newEntry(o) {
  return {
    _id: o.dateKey + '_' + o.openid,
    openid: o.openid,
    dateKey: o.dateKey,
    pos: new Array(N).fill(null),
    answeredAt: new Array(N).fill(null),
    firstAt: null,
    completeAt: null,
    streak: null,
    contentVersion: o.contentVersion,
  };
}

function answeredCount(entry) {
  if (!entry) return 0;
  let n = 0;
  for (let i = 0; i < N; i++) if (entry.pos[i] !== null) n++;
  return n;
}
function isComplete(entry) {
  return !!entry && answeredCount(entry) === N;
}

// ---- references ----------------------------------------------------------------------------------------------------

/** True once the day is closed AND its references are frozen on the set (spec 3.3). */
function isFrozen(set, nowMs) {
  return Array.isArray(set.final) && W.dayClosed(set.dateKey, nowMs);
}

/** Live references R_c from the histograms (hists = 5 x 101). */
function liveRefs(set, hists) {
  return set.cards.map((c, i) => S.nationRef(hists[i], c.anchor));
}
/** References to score against right now: the frozen ones for a closed day, else live. */
function refsFor(set, hists, nowMs) {
  return isFrozen(set, nowMs) ? set.final.slice() : liveRefs(set, hists);
}

/**
 * The lazy 定分 (spec 3.3, 11.2 finalizeDay, AC 25): returns the final[5] to store for a CLOSED day without one, else null.
 */
function lazyFinal(set, hists, nowMs) {
  if (Array.isArray(set.final) || !W.dayClosed(set.dateKey, nowMs)) return null;
  return S.freezeRefs(hists, set.cards.map((c) => c.anchor));
}

/**
 * finalizeDay's aggregate step (spec 3.3): from complete entries' positions score at the frozen refs and build
 * `finalHist` / `finalCount`. `positionsList` = array of 5-position arrays of COMPLETE dailies.
 */
function finalAggregate(final, positionsList) {
  const totals = positionsList.map((p) => S.dailyTotal(p, final).total);
  return { finalHist: S.buildFinalHist(totals), finalCount: totals.length };
}

// ---- submitCard ----------------------------------------------------------------------------------------------------

/**
 * Validate and apply a card submission (spec 11.2 submitCard, AC 15, 20). `entry` may be null (first card).
 * Checked in this order: whitelist (V.submitCard did it) -> already answered (CARD_DONE) -> window -> order.
 * @returns {{ok:false, code:string}|{ok:true, entry:object, grace:boolean, complete:boolean, fast:boolean, first:boolean}}
 */
function applySubmit(o) {
  const { set, dateKey, idx, pos, nowMs, openid } = o;
  let entry = o.entry;
  if (dateKey > beijingDateKey(nowMs)) return { ok: false, code: 'INVALID_INPUT' };
  if (!set) return { ok: false, code: dateKey === beijingDateKey(nowMs) ? 'DAILY_UNAVAILABLE' : 'LATE_SUBMIT' };
  if (entry && entry.pos[idx] !== null) return { ok: false, code: 'CARD_DONE' };
  const win = W.submitWindow({ dateKey, nowMs, entry });
  if (!win.ok) return { ok: false, code: win.code };
  const firstUnanswered = entry ? entry.pos.indexOf(null) : 0;
  if (idx !== firstUnanswered) return { ok: false, code: 'CARD_ORDER' };
  const first = !entry;
  if (!entry) entry = newEntry({ openid, dateKey, contentVersion: set.contentVersion });
  const next = { ...entry, pos: entry.pos.slice(), answeredAt: entry.answeredAt.slice() };
  next.pos[idx] = pos;
  next.answeredAt[idx] = nowMs;
  if (next.firstAt === null) next.firstAt = nowMs;
  const complete = next.pos.indexOf(null) < 0;
  if (complete) next.completeAt = nowMs;
  const fast = complete && next.completeAt - next.firstAt < CONFIG.daily.fastMs;
  return { ok: true, entry: next, grace: win.grace, complete, fast, first };
}

/**
 * One card's reveal (spec 6.3), used by submitCard, its CARD_DONE replay, getDaily.mine.reveals and archive play.
 * @param {{set:object, hists:number[][], idx:number, pos:number, group:object|null, nowMs:number}} o
 * @returns {{idx,pos,ref,d,score,label,agreePct,n,small,group,frozen}}
 */
function cardReveal(o) {
  const frozen = isFrozen(o.set, o.nowMs);
  const hist = o.hists[o.idx];
  const ref = frozen ? o.set.final[o.idx] : S.nationRef(hist, o.set.cards[o.idx].anchor);
  const sc = S.scoreAt(o.pos, ref);
  const n = S.histTotal(hist);
  return {
    idx: o.idx,
    pos: o.pos,
    ref,
    d: sc.d,
    score: sc.score,
    label: sc.label,
    agreePct: S.agreePct(hist, o.pos),
    n,
    small: n < CONFIG.score.smallSampleN,
    group: o.group || null,
    frozen,
  };
}

/** Result block added to the submitCard response when the 5th card completes (spec 2.1 step 7). */
function completionBlock(o) {
  const refs = refsFor(o.set, o.hists, o.nowMs);
  const t = S.dailyTotal(o.entry.pos, refs);
  return { complete: true, total: t.total, band: S.dayBand(t.total), cardScores: t.scores, refs, divisiveIdx: S.mostDivisive(o.hists, refs) };
}

// ---- getDaily ------------------------------------------------------------------------------------------------------

/**
 * getDaily response (spec 11.2, AC 12, 13). `groupBlocks` = null (no valid groupRef) or an array of 5 blocks
 * ({median,n,dots}|null) for the cards the caller answered. Never includes anchors or histograms; refs and reveals
 * only for answered cards.
 * @param {{set, entry, hists, content, groupBlocks, streak, yesterday, features, nowMs}} o
 */
function dailyView(o) {
  const set = o.set;
  const entry = o.entry;
  const refsAll = refsFor(set, o.hists, o.nowMs);
  const pos = entry ? entry.pos.slice() : new Array(N).fill(null);
  const answered = answeredCount(entry);
  const complete = answered === N;
  const refs = refsAll.map((r, i) => (pos[i] === null ? null : r));
  const t = S.dailyTotal(pos, refs);
  const reveals = pos.map((p, i) => (p === null ? null : cardReveal({ set, hists: o.hists, idx: i, pos: p, group: o.groupBlocks ? o.groupBlocks[i] || null : null, nowMs: o.nowMs })));
  return {
    ok: true,
    dateKey: set.dateKey,
    issueNo: set.issueNo,
    serverNow: o.nowMs,
    closesAt: W.closeMs(set.dateKey),
    contentVersion: set.contentVersion,
    frozen: isFrozen(set, o.nowMs),
    cards: set.cards.map((c) => cardText(o.content, c)),
    mine: { pos, answered, complete, total: answered ? t.total : null, cardScores: t.scores, reveals },
    refs,
    groupRefs: o.groupBlocks ? o.groupBlocks.map((b, i) => (pos[i] === null ? null : b || null)) : null,
    divisiveIdx: complete ? S.mostDivisive(o.hists, refsAll) : null,
    yesterday: o.yesterday || null,
    myStreak: o.streak,
    features: o.features,
  };
}

/** getDaily.yesterday: only for a closed, finalised previous day the caller completed (spec 6.1). */
function yesterdayInfo(prevSet, prevEntry, nowMs) {
  if (!prevSet || !prevEntry || !isComplete(prevEntry) || !isFrozen(prevSet, nowMs)) return null;
  const total = S.dailyTotal(prevEntry.pos, prevSet.final).total;
  return { dateKey: prevSet.dateKey, issueNo: prevSet.issueNo, total, pct: S.percentile(total, prevSet.finalHist, prevSet.finalCount), final: true };
}

// ---- archive ---------------------------------------------------------------------------------------------------------

/** Sets eligible for the archive page: closed, older than `before`, newest first, `limit` (+ hasMore). */
function archivePage(sets, before, limit, nowMs) {
  const closed = sets.filter((s) => W.dayClosed(s.dateKey, nowMs) && (!before || s.dateKey < before)).sort((a, b) => (a.dateKey < b.dateKey ? 1 : -1));
  return { page: closed.slice(0, limit), hasMore: closed.length > limit };
}
/** getArchive item (spec 11.2). `set.final` must exist (lazy 定分 first). */
function archiveItem(set, entry) {
  const item = { dateKey: set.dateKey, issueNo: set.issueNo };
  if (entry && isComplete(entry) && Array.isArray(set.final)) item.mine = { total: S.dailyTotal(entry.pos, set.final).total, final: true };
  return item;
}

/**
 * getArchiveDay (spec 11.2, AC 36-38). Error 'DAY_OPEN' unless the day is closed and frozen. `mine` is present for any
 * entry (complete = read-only review; partial = the client treats the day as not played).
 */
function archiveDayView(set, entry, content, nowMs) {
  if (!set || !isFrozen(set, nowMs)) return { ok: false, code: 'DAY_OPEN' };
  let mine = null;
  if (entry) {
    const t = S.dailyTotal(entry.pos, set.final);
    mine = { pos: entry.pos.slice(), answered: t.answered, complete: t.complete, total: t.complete ? t.total : null, cardScores: t.scores, pct: t.complete ? S.percentile(t.total, set.finalHist, set.finalCount) : null };
  }
  return { ok: true, dateKey: set.dateKey, issueNo: set.issueNo, cards: set.cards.map((c) => cardText(content, c)), finals: set.final.slice(), mine };
}

/** One unanswered card of a closed day for 加一题 (spec 11.2 getBonusCard); null when none (NO_CARD_AVAILABLE). */
function pickBonusCard(closedSets, entriesByDate, exclude, rng, content) {
  const cands = [];
  closedSets.forEach((set) => {
    if (!Array.isArray(set.final)) return;
    const e = entriesByDate[set.dateKey];
    set.cards.forEach((c, i) => {
      if (e && e.pos[i] !== null) return;
      if (exclude.has(c.itemId)) return;
      cands.push({ set, i });
    });
  });
  if (!cands.length) return null;
  const pick = cands[Math.floor(rng() * cands.length)];
  return { card: cardText(content, pick.set.cards[pick.i]), final: pick.set.final[pick.i], dateKey: pick.set.dateKey, issueNo: pick.set.issueNo, idx: pick.i };
}

/**
 * unlockDistribution payload (spec 11.2, AC 40): 5 x 21 histograms. For an open day only answered cards (others null);
 * a closed day gives all five.
 */
function distributionView(set, entry, hists, nowMs) {
  const closed = W.dayClosed(set.dateKey, nowMs);
  return hists.map((h, i) => (closed || (entry && entry.pos[i] !== null) ? S.distribution21(h) : null));
}

// ---- rounds ----------------------------------------------------------------------------------------------------------

/** rounds document in `draft` (spec 11.1). */
function newRound(o) {
  return {
    _id: o.roundId,
    hostOpenid: o.hostOpenid,
    spectrumId: o.spectrum.id,
    left: o.spectrum.left,
    right: o.spectrum.right,
    target: o.target,
    clueMode: null,
    clueItemId: null,
    clueText: null,
    salt: o.salt,
    createdAt: o.nowMs,
    status: 'draft',
    guessCount: 0,
    groupRefs: [],
    contentVersion: o.contentVersion,
  };
}

/**
 * setClue, PRESET path (spec 11.2, AC 28). Host only; the item must belong to the round's spectrum; only on a draft or an
 * open round with no guess (ROUND_EXPIRED otherwise); a hidden clue cannot be replaced. The typed path is ugc.textGate /
 * ugc.applyTextClue (it needs the player's state and a WeChat check in between).
 * @returns {{ok:false,code}|{ok:true, round}}
 */
function applyClue(round, isHost, input, content) {
  if (!round || round.status === 'discarded' || R.lazyTransition(round, input.nowMs) === 'discard') return { ok: false, code: 'ROUND_NOT_FOUND' };
  if (!isHost) return { ok: false, code: 'NOT_HOST' };
  if (round.status === 'revealed' || round.status === 'noGuesses' || round.guessCount > 0) return { ok: false, code: 'ROUND_EXPIRED' };
  if (round.clueHidden === true) return { ok: false, code: 'INVALID_INPUT' };
  if (input.clueMode !== 'preset' || !R.clueBelongs(content, round.spectrumId, input.clueItemId)) return { ok: false, code: 'INVALID_INPUT' };
  const clueText = content.itemIndex[input.clueItemId].item.text;
  return { ok: true, round: { ...round, status: 'open', clueMode: 'preset', clueItemId: input.clueItemId, clueText } };
}

/**
 * getRound response (spec 8.4, 11.2, AC 26, 30, 33). `guesses` (all of the round's guess documents) is needed only
 * for a revealed round. A non-host never receives `target` before the reveal; drafts are the host's alone.
 * D-2: `clue` = {mode, text, hidden, state} (ugc.clueView: a hidden, paused or deleted typed clue has text null) and
 * `me` = {canReport, rulesAgreed, restriction, strikeNotice} for the VIEWER. The legacy top-level clueMode / clueText /
 * clueState carry the same values. No openid of the host or of a reporter, no moderation field, ever (AC 49).
 * @param {{round, viewerOpenid, myGuess:{pos,late}|null, guesses?:Array, hashFn, nowMs, withhold?:boolean,
 *          ugc?:{flags:object, player:object|null, hasReport:boolean, strikeNotice?:boolean}}} o
 */
function roundView(o) {
  const r = o.round;
  const isHost = r.hostOpenid === o.viewerOpenid;
  if (r.status === 'draft' && !isHost) return { ok: false, code: 'ROUND_NOT_FOUND' };
  const u = o.ugc || {};
  const fl = u.flags || U.flags(null);
  const clue = U.clueView(r, fl);
  const pv = U.playerView(u.player || null, o.nowMs);
  const out = {
    ok: true,
    roundId: r._id,
    status: r.status,
    isHost,
    left: r.left,
    right: r.right,
    clue,
    clueMode: clue.mode,
    clueText: clue.text,
    clueState: clue.state,
    me: { canReport: U.canReport(r, o.viewerOpenid, fl, !!u.hasReport), rulesAgreed: pv.rulesAgreed, restriction: pv.restriction, strikeNotice: u.strikeNotice === true },
    guessCount: r.guessCount,
    createdAt: r.createdAt,
    autoRevealAt: r.createdAt + CONFIG.rounds.autoRevealMs,
    closesAt: r.createdAt + CONFIG.rounds.guessCloseMs,
    myGuess: o.myGuess ? { pos: o.myGuess.pos, late: !!o.myGuess.late } : null,
    canReveal: isHost && r.status === 'open' && r.guessCount >= CONFIG.rounds.minGuessesToReveal,
  };
  if (isHost && r.status !== 'revealed') out.target = r.target;
  // L4: a viewer who could still place a late guess is not served the answer until they choose to see it (o.withhold)
  if (r.status === 'revealed') {
    if (o.withhold) out.answerHidden = true;
    else out.reveal = revealOf(r, o);
  }
  return out;
}

/** Reveal payload (shared by getRound, submitGuess, revealRound). */
function revealOf(r, o) {
  const p = R.revealPayload(
    { target: r.target, salt: r.salt, hostOpenid: r.hostOpenid, viewerOpenid: o.viewerOpenid, guesses: o.guesses || [] },
    o.hashFn
  );
  p.revealBy = r.revealBy || null;
  p.revealedAt = r.revealedAt || null;
  return p;
}

/**
 * Apply a reveal to a round document (any path): returns the new round with mq, status and revealBy.
 * `guesses` = all stored guesses; mq counts on-time ones only.
 */
function applyReveal(round, guesses, by, nowMs) {
  const sc = R.scoreRound(round.target, guesses.map((g, i) => ({ id: String(i), pos: g.pos, ts: g.ts, late: g.late })));
  return { ...round, status: 'revealed', revealedAt: nowMs, revealBy: by, mq: sc.mq };
}

// ---- group helpers shared by getDaily / submitCard / getGroupDay -------------------------------------------------

/** Group blocks for the cards the caller answered (spec 3.4): `others` = members' entries EXCLUDING the caller. */
function groupBlocksFor(others, callerEntry) {
  const out = [];
  for (let c = 0; c < N; c++) {
    if (!callerEntry || callerEntry.pos[c] === null) {
      out.push(null);
      continue;
    }
    const vals = [];
    others.forEach((e) => {
      if (e.pos[c] !== null) vals.push(e.pos[c]);
    });
    out.push(G.cardGroupBlock(vals));
  }
  return out;
}

/** getGroupDay response (spec 8.4). Callers pass complete members only. */
function groupDayView(o) {
  const board = G.buildGroupDay({
    dateKey: o.set.dateKey,
    salt: o.set.boardSalt,
    refs: refsFor(o.set, o.hists, o.nowMs),
    members: o.members,
    viewerKey: o.viewerOpenid,
    viewerDone: o.viewerDone,
    hashFn: o.hashFn,
  });
  return {
    ok: true,
    dateKey: o.set.dateKey,
    issueNo: o.set.issueNo,
    salt: o.set.boardSalt,
    selfHash: board.selfHash,
    viewerDone: o.viewerDone,
    n: board.n,
    mq: board.mq,
    divisiveIdx: board.divisiveIdx,
    rows: board.rows,
    trend: o.trend,
    rounds: o.rounds,
  };
}

function friendBoardView(o) {
  const refs = refsFor(o.set, o.hists, o.nowMs);
  const b = G.buildFriendBoard({
    dateKey: o.set.dateKey,
    salt: o.set.boardSalt,
    refs,
    entries: o.entries,
    total: o.total,
    viewerKey: o.viewerOpenid,
    viewerDone: o.viewerDone,
    hashFn: o.hashFn,
  });
  return { ok: true, dateKey: o.set.dateKey, issueNo: o.set.issueNo, salt: o.set.boardSalt, selfHash: b.selfHash, viewerDone: o.viewerDone, mode: b.mode, refs: o.viewerDone ? refs : null, rows: b.rows, total: b.total };
}

/** Is `dateKey` a day the boards will serve (today, or yesterday before the day closes)? Spec 8.4. */
function boardDayOk(dateKey, nowMs) {
  const today = beijingDateKey(nowMs);
  return dateKey === today || dateKey === addDays(today, -1);
}

/** Beijing date key of `nowMs` (re-export so callers need one import for the common case). */
function todayKey(nowMs) {
  return beijingDateKey(nowMs);
}

module.exports = {
  newDailySet,
  newStatsDocs,
  replaceCard,
  newEntry,
  answeredCount,
  isComplete,
  isFrozen,
  liveRefs,
  refsFor,
  lazyFinal,
  finalAggregate,
  applySubmit,
  cardReveal,
  completionBlock,
  dailyView,
  yesterdayInfo,
  archivePage,
  archiveItem,
  archiveDayView,
  pickBonusCard,
  distributionView,
  newRound,
  applyClue,
  roundView,
  revealOf,
  applyReveal,
  groupBlocksFor,
  groupDayView,
  friendBoardView,
  boardDayOk,
  todayKey,
};
