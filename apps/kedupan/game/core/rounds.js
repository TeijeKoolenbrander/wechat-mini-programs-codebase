/**
 * Host rounds (spec 2.2, 3.5, 11.2, PD-8, PD-9, AC 6, 26-35). Pure JS: target draw, offers, state rules, scoring.
 * Round statuses: draft | open | revealed | noGuesses  (a discarded draft is deleted / treated as not found).
 */

const { CONFIG } = require('./config');
const { cardScore, isPos } = require('./score');
const { shuffle } = require('./rng');

const R = CONFIG.rounds;

/** Integer target 5..95, uniform, from a uniform float r in [0,1). The server passes crypto randomness (AC 26). */
function drawTarget(r) {
  const n = R.targetMax - R.targetMin + 1;
  return R.targetMin + Math.min(n - 1, Math.floor(r * n));
}

/** Fresh items first (shuffled), topped up from already-seen ones when fewer than `want` are fresh. */
function freshFirst(rng, all, isSeen, want) {
  const fresh = shuffle(rng, all.filter((x) => !isSeen(x)));
  if (fresh.length >= want) return fresh.slice(0, want);
  const seen = shuffle(rng, all.filter((x) => isSeen(x)));
  return fresh.concat(seen).slice(0, want);
}

/** Three distinct spectra, unseen ones first (spec 6.5). Client-side. */
function offerSpectra(content, rng, exclude, n) {
  const ex = exclude || new Set();
  return freshFirst(rng, content.spectra, (s) => ex.has(s.id), n || R.offerSpectra).map((s) => ({ id: s.id, left: s.left, right: s.right }));
}

/** Six clue items of a spectrum, unseen first, recycling seen ones when fewer than six remain (spec 2.2 step 4). Client-side. */
function offerClues(content, spectrumId, rng, excludeIds, n) {
  const sp = content.spectrumById[spectrumId];
  if (!sp) return [];
  const ex = excludeIds || new Set();
  return freshFirst(rng, sp.items, (it) => ex.has(it.id), n || R.clueOptions).map((it) => ({ itemId: it.id, text: it.text }));
}

/** Does a clue item belong to the spectrum? (setClue validation) */
function clueBelongs(content, spectrumId, itemId) {
  const e = content.itemIndex[itemId];
  return !!e && e.spectrum.id === spectrumId;
}

/**
 * Lazy transitions applied before any read or write (spec 11.2 getRound / sweepRounds). Returns
 * 'discard' | 'reveal' (24 h, >= 1 guess; revealBy 'timer') | 'noGuesses' | null.
 */
function lazyTransition(round, nowMs) {
  if (round.status === 'draft' && nowMs > round.createdAt + R.draftMs) return 'discard';
  if (round.status === 'open' && nowMs >= round.createdAt + R.autoRevealMs) return round.guessCount >= 1 ? 'reveal' : 'noGuesses';
  return null;
}

/**
 * submitGuess gate (spec 11.2, AC 31). The caller has already applied lazyTransition.
 * @returns {{ok:true, late:boolean}|{ok:false, code:string}}
 */
function guessCheck(round, o) {
  if (!round || round.status === 'discarded') return { ok: false, code: 'ROUND_NOT_FOUND' };
  if (o.isHost) return { ok: false, code: 'OWN_ROUND' };
  if (round.status === 'draft') return { ok: false, code: 'ROUND_NOT_FOUND' };
  if (o.hasGuessed) return { ok: false, code: 'ALREADY_GUESSED' };
  if (!isPos(o.pos)) return { ok: false, code: 'INVALID_INPUT' };
  if (o.nowMs > round.createdAt + R.guessCloseMs || round.status === 'noGuesses') return { ok: false, code: 'ROUND_EXPIRED' };
  return { ok: true, late: round.status === 'revealed' };
}

/**
 * L4: is the reveal of a revealed round served to this viewer without an explicit choice? The host and anyone who has
 * guessed see it; so does everyone once guessing is closed (> 7 days, no late guess is possible any more). Anyone else
 * could still place a late guess, so they get the answer only by asking for it (getRound showAnswer), which records it
 * (`reveal_views`) and closes the late guess for them (submitGuess then returns ROUND_EXPIRED).
 */
function revealServedByDefault(round, o) {
  return !!(o.isHost || o.hasGuess || o.nowMs > round.createdAt + R.guessCloseMs);
}

/** The 8th on-time guess reveals (PD-8). `countAfter` = on-time guesses including this one. */
function revealsOnGuess(countAfter) {
  return countAfter >= R.autoRevealAtGuesses;
}

/** Host 揭晓 gate (spec 11.2): idempotent once revealed. */
function hostRevealCheck(round, o) {
  if (!round || round.status === 'draft' || round.status === 'discarded') return { ok: false, code: 'ROUND_NOT_FOUND' };
  if (!o.isHost) return { ok: false, code: 'NOT_HOST' };
  if (round.status === 'revealed') return { ok: true, already: true };
  if (round.status === 'noGuesses') return { ok: false, code: 'TOO_FEW_GUESSES' };
  if (round.guessCount < R.minGuessesToReveal) return { ok: false, code: 'TOO_FEW_GUESSES' };
  return { ok: true, already: false };
}

/**
 * Score a round (spec 3.5). guesses: [{id, pos, ts, late}] (id = any stable key, e.g. the guess _id).
 * @returns {{mq:number|null, closestId:string|null, scored:Array<{id,pos,d,score,late}>}}
 */
function scoreRound(target, guesses) {
  const scored = guesses.map((g) => {
    const d = Math.abs(g.pos - target);
    return { id: g.id, pos: g.pos, ts: g.ts, d, score: cardScore(d), late: !!g.late };
  });
  const onTime = scored.filter((g) => !g.late);
  let mq = null;
  let closestId = null;
  if (onTime.length) {
    let sum = 0;
    let best = null;
    for (let i = 0; i < onTime.length; i++) {
      sum += onTime[i].score;
      const g = onTime[i];
      if (best === null || g.d < best.d || (g.d === best.d && g.ts < best.ts)) best = g;
    }
    mq = Math.round(sum / onTime.length);
    closestId = best.id;
  }
  return { mq, closestId, scored };
}

/**
 * Revealed payload (spec 8.4 getRound revealed): rows `[h, g, s, late, isHost]`, `h` hashed per round salt via the
 * injected `hashFn(openid, salt)` (server: sha256 hex first 12). On-time rows by closeness then time, late rows by
 * time, the host row last. `closestH` is 最懂你 (null if no on-time guess).
 * @param {{target:number, salt:string, hostOpenid:string, guesses:Array<{openid:string,pos:number,ts:number,late:boolean}>, viewerOpenid:string}} o
 */
function revealPayload(o, hashFn) {
  const gs = o.guesses.map((g, i) => ({ id: String(i), pos: g.pos, ts: g.ts, late: g.late }));
  const sc = scoreRound(o.target, gs);
  const byId = {};
  sc.scored.forEach((s) => {
    byId[s.id] = s;
  });
  const rows = o.guesses.map((g, i) => {
    const s = byId[String(i)];
    return { h: hashFn(g.openid, o.salt), g: g.pos, s: s.score, late: s.late ? 1 : 0, d: s.d, ts: g.ts };
  });
  rows.sort((a, b) => a.late - b.late || (a.late ? a.ts - b.ts : a.d - b.d || a.ts - b.ts));
  const closestH = sc.closestId === null ? null : hashFn(o.guesses[+sc.closestId].openid, o.salt);
  // L4: a late guess never shows a score (the guesser has seen the answer); mq already excludes late rows
  const out = rows.map((r) => [r.h, r.g, r.late ? null : r.s, r.late, 0]);
  out.push([hashFn(o.hostOpenid, o.salt), null, null, 0, 1]);
  return { target: o.target, mq: sc.mq, salt: o.salt, selfHash: hashFn(o.viewerOpenid, o.salt), closestH, rows: out };
}

/** Append a verified groupRef (<= cap, no duplicates). Returns the new list (same list when unchanged). */
function appendGroupRef(list, ref) {
  if (!ref || list.indexOf(ref) >= 0 || list.length >= R.groupRefsCap) return list;
  return list.concat([ref]);
}

module.exports = {
  drawTarget,
  offerSpectra,
  offerClues,
  clueBelongs,
  lazyTransition,
  guessCheck,
  revealsOnGuess,
  revealServedByDefault,
  hostRevealCheck,
  scoreRound,
  revealPayload,
  appendGroupRef,
};
