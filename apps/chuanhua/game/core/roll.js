'use strict';
/**
 * The prompt roll (spec 4.1, F-2, PO-34, AC 115-119). Pure functions over the prompt bank and the player's `seenPrompts`
 * ring buffer; the server passes a seeded rng, so no client rng is ever trusted.
 *
 *   - a roll = 3 non-retired prompts from 3 DIFFERENT categories
 *   - never a prompt among the last 300 ids shown to the player (every shown prompt counts, picked or not)
 *   - in one live room no two seats' rolls (or rerolls) share a prompt
 *   - 换一批 (reroll) = 3 new prompts, none shown earlier in this pick; up to CONFIG.roll.rerollsPerPick (5) per pick (TD-151)
 *   - if the pool is too small to satisfy this (impossible with >= 2,000 prompts), the oldest ids drop out of the window until it can
 */

const { CONFIG } = require('./config');

const SIZE = CONFIG.roll.size;
const WINDOW = CONFIG.roll.window;
/** 换一批 allowed per pick (rev. 2.1, founder 2026-10-16); the server enforces it, the client only shows rerollLeft */
const MAX_REROLLS = CONFIG.roll.rerollsPerPick;
const ALNUM = 'abcdefghijklmnopqrstuvwxyz0123456789';

/** a roll id from an rng (the cloud functions use crypto ids of the same shape) */
function rollId(rng) {
  let s = 'r';
  for (let i = 0; i < 11; i++) s += ALNUM[Math.floor(rng() * ALNUM.length)];
  return s;
}

function pickOne(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

/**
 * Roll 3 prompts from 3 categories.
 * @param {{bank:{byCat:Object<string,{id:string}[]>}, seen?:string[], exclude?:string[], rng:()=>number, size?:number, window?:number}} o
 *   seen = the player's shown ids, oldest first; exclude = ids that are off limits whatever the window (the first roll of a reroll,
 *   the other seats of the room)
 * @returns {{ids:string[], windowUsed:number, relaxed:boolean}} relaxed = the window had to shrink (or `exclude` was dropped)
 */
function rollThree(o) {
  const size = o.size || SIZE;
  const seen = o.seen || [];
  const cats = Object.keys(o.bank.byCat).sort();
  const ex = new Set(o.exclude || []);
  let win = seen.slice(-(o.window || WINDOW));
  let relaxed = false;
  for (let guard = 0; guard < 64; guard++) {
    const banned = new Set(win);
    ex.forEach((id) => banned.add(id));
    const open = [];
    for (const c of cats) {
      const pool = o.bank.byCat[c].filter((p) => !banned.has(p.id));
      if (pool.length) open.push(pool);
    }
    if (open.length >= size) {
      // choose `size` distinct categories at random, then one prompt in each
      const order = open.map((_, i) => i);
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(o.rng() * (i + 1));
        const t = order[i];
        order[i] = order[j];
        order[j] = t;
      }
      const ids = order.slice(0, size).map((i) => pickOne(o.rng, open[i]).id);
      return { ids, windowUsed: win.length, relaxed };
    }
    relaxed = true;
    if (win.length) win = win.slice(Math.ceil(win.length / 4)); // drop the oldest quarter and retry (4.1)
    else if (ex.size) ex.clear(); // last resort: only reachable with a tiny test bank
    else break;
  }
  // a bank too small for 3 categories at all: whatever exists, distinct ids
  const all = cats.reduce((a, c) => a.concat(o.bank.byCat[c]), []);
  const ids = [];
  while (ids.length < size && all.length) ids.push(all.splice(Math.floor(o.rng() * all.length), 1)[0].id);
  return { ids, windowUsed: 0, relaxed: true };
}

/** append shown ids to the ring buffer (newest last, at most `cap`); an id already inside moves to the end */
function pushSeen(seen, ids, cap) {
  const max = cap || CONFIG.roll.window;
  const set = new Set(ids);
  const out = (seen || []).filter((id) => !set.has(id));
  for (const id of ids) out.push(id);
  return out.length > max ? out.slice(out.length - max) : out;
}

/**
 * The first rolls of a room (4.1, AC 118): one roll per seat, pairwise disjoint.
 * @param {{bank, seenBySeat:string[][], rng:()=>number}} o
 * @returns {string[][]} ids per seat
 */
function rollRoom(o) {
  const used = [];
  const out = [];
  for (const seen of o.seenBySeat) {
    const r = rollThree({ bank: o.bank, seen, exclude: used, rng: o.rng });
    out.push(r.ids);
    used.push(...r.ids);
  }
  return out;
}

/**
 * 换一批 (AC 116): 3 new prompts, none from `firstIds` (every set already shown in this pick); in a room also none that anyone has been shown (`exclude`).
 * @returns {{ids:string[], relaxed:boolean}}
 */
function reroll(o) {
  const r = rollThree({ bank: o.bank, seen: o.seen, exclude: (o.firstIds || []).concat(o.exclude || []), rng: o.rng });
  return { ids: r.ids, relaxed: r.relaxed };
}

/** rerolls used on a roll record: `rerolls` 0..5 (a pre-2.1 record only has the boolean `rerolled`) */
function rerollsOf(rec) {
  if (!rec) return 0;
  if (Number.isInteger(rec.rerolls) && rec.rerolls >= 0) return rec.rerolls;
  return rec.rerolled ? 1 : 0;
}

/** rerolls left on a roll record: 0..MAX_REROLLS */
function rerollLeft(rec) {
  return Math.max(0, MAX_REROLLS - rerollsOf(rec));
}

/** every id shown in this pick so far (the current set and the rerolled-away sets), <= 18 */
function shownOf(rec) {
  if (!rec) return [];
  if (Array.isArray(rec.shownIds)) return rec.shownIds.slice();
  const out = [];
  for (const id of (rec.ids || []).concat(rec.prevIds || [])) if (!out.includes(id)) out.push(id);
  return out;
}

/** the fields every roll record carries (players.roll, rooms.rolls[seat]) */
function newRec(rollId, ids) {
  return { rollId, ids: ids.slice(), rerolls: 0, shownIds: ids.slice() };
}

/** the record after one more 换一批: new rollId, new set, count + 1, shownIds grown by the new set */
function nextRec(rec, rollId, ids) {
  return Object.assign({}, rec, { rollId, ids: ids.slice(), rerolls: rerollsOf(rec) + 1, shownIds: shownOf(rec).concat(ids) });
}

/** is the pick part of the roll that is current? (AC 119) */
function pickValid(roll, rollIdIn, promptId) {
  return !!roll && roll.rollId === rollIdIn && typeof promptId === 'string' && roll.ids.includes(promptId);
}

module.exports = { SIZE, WINDOW, MAX_REROLLS, rerollsOf, rerollLeft, shownOf, newRec, nextRec, rollId, rollThree, pushSeen, rollRoom, reroll, pickValid };
