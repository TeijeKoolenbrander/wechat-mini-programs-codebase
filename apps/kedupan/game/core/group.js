/**
 * Group scores, boards and trend (spec 3.4, 8.3, 8.4, PD-5, PD-20, PD-21, AC 5, 19, 42-47). Pure JS: the server calls
 * these over rows it read from the database; the mock server calls the same code.
 *
 * Raw openids appear only as the opaque `key` the caller passes in; output rows carry the hash `h` computed by the
 * injected `hashFn(key, salt)` (server: sha256hex(key + '|' + salt).slice(0, 12)). Nothing here returns a key.
 */

const { CONFIG } = require('./config');
const { cardScore, medianOf, madOf, dailyTotal } = require('./score');
const { addDays, dateKeyToMs } = require('./date');

const G = CONFIG.group;

/** Seconds from 00:00 BJT of `dateKey` to completion (may exceed 86400 for grace completions; tie-break `t`). */
function secondsInDay(completeAt, dateKey) {
  return Math.max(0, Math.floor((completeAt - dateKeyToMs(dateKey)) / 1000));
}

/** Per-card values of a list of 5-position arrays. */
function column(list, c) {
  const out = [];
  for (let i = 0; i < list.length; i++) out.push(list[i][c]);
  return out;
}

/** Median of members' positions per card (m_c). null entries when no members. */
function groupMedians(positionsList) {
  const out = [];
  for (let c = 0; c < CONFIG.daily.cards; c++) out.push(medianOf(column(positionsList, c)));
  return out;
}

/** 群默契度 (spec 3.4): n >= 3 -> rounded mean over the 5 cards of max(0, 100 - ceil(2.5 * MAD_c)), else null. */
function groupMq(positionsList) {
  const n = positionsList.length;
  if (n < G.minForMq) return null;
  let sum = 0;
  for (let c = 0; c < CONFIG.daily.cards; c++) {
    const vals = column(positionsList, c);
    sum += cardScore(madOf(vals, medianOf(vals)));
  }
  return Math.round(sum / CONFIG.daily.cards);
}

/** Group's most divisive card: highest MAD_c about m_c, ties -> lower index, n >= 3 else null (TD-6). */
function groupDivisiveIdx(positionsList) {
  if (positionsList.length < G.minForMq) return null;
  let best = 0;
  let bestMad = -1;
  for (let c = 0; c < CONFIG.daily.cards; c++) {
    const vals = column(positionsList, c);
    const m = madOf(vals, medianOf(vals));
    if (m > bestMad) {
      bestMad = m;
      best = c;
    }
  }
  return best;
}

/** 群内默契分 of member `i` (spec 3.4, leave-one-out). null when n < 2. */
function leaveOneOutScore(positionsList, i) {
  if (positionsList.length < G.minForLeaveOneOut) return null;
  let total = 0;
  for (let c = 0; c < CONFIG.daily.cards; c++) {
    const others = [];
    for (let j = 0; j < positionsList.length; j++) if (j !== i) others.push(positionsList[j][c]);
    total += cardScore(Math.abs(positionsList[i][c] - medianOf(others)));
  }
  return total;
}

/**
 * The ● / member dots of one card reveal (spec 3.4 "Group median per card", 6.3): over OTHER members who submitted the card.
 * `values` = their positions. Dots are sorted (no order leaks identity) and down-sampled to dotCap. {median:null,n:0,dots:[]} when none.
 */
function cardGroupBlock(values) {
  const n = values.length;
  if (n === 0) return { median: null, n: 0, dots: [] };
  const sorted = values.slice().sort((a, b) => a - b);
  let dots = sorted;
  if (n > G.dotCap) {
    dots = [];
    for (let i = 0; i < G.dotCap; i++) dots.push(sorted[Math.round((i * (n - 1)) / (G.dotCap - 1))]);
  }
  return { median: medianOf(sorted), n, dots };
}

/**
 * 最同频 (spec 3.4, PD-20; computed in the open data domain, the same code is used by tests and the mock):
 * peers = [{key, pos[5], completeAt}] excluding the viewer; smallest mean |gap| wins, ties -> earlier completion.
 * @returns {{key:string, gap:number}|null} gap is the exact mean; display rounds it.
 */
function closestPeer(viewerPos, peers) {
  let best = null;
  for (let i = 0; i < peers.length; i++) {
    const p = peers[i];
    let s = 0;
    for (let c = 0; c < CONFIG.daily.cards; c++) s += Math.abs(viewerPos[c] - p.pos[c]);
    const gap = s / CONFIG.daily.cards;
    if (best === null || gap < best.gap || (gap === best.gap && p.completeAt < best.completeAt)) best = { key: p.key, gap, completeAt: p.completeAt };
  }
  return best ? { key: best.key, gap: best.gap } : null;
}

function cmpRows(a, b) {
  // a, b: {gs|null, ns, t, h}; group order: gs desc (null last), then t asc, then h
  const ga = a.gs === null ? -1 : a.gs;
  const gb = b.gs === null ? -1 : b.gs;
  return gb - ga || a.t - b.t || (a.h < b.h ? -1 : a.h > b.h ? 1 : 0);
}

/**
 * Group page payload (spec 8.4 getGroupDay) from the group's COMPLETE dailies.
 * @param {{dateKey:string, salt:string, refs:number[], members:Array<{key:string,pos:number[],completeAt:number,streak:number|null}>,
 *   viewerKey:string, viewerDone:boolean, hashFn:Function, rowCap?:number}} o
 * @returns {{n:number, mq:number|null, divisiveIdx:number|null, selfHash:string, rows:Array}}
 */
function buildGroupDay(o) {
  const cap = o.rowCap || G.rowCap;
  const list = o.members.map((m) => m.pos);
  const n = o.members.length;
  const rows = o.members.map((m, i) => {
    const gs = leaveOneOutScore(list, i);
    return {
      key: m.key,
      h: o.hashFn(m.key, o.salt),
      gs,
      ns: dailyTotal(m.pos, o.refs).total,
      t: secondsInDay(m.completeAt, o.dateKey),
      pos: o.viewerDone ? m.pos.join(',') : null,
      k: m.streak && m.streak >= 2 ? m.streak : null,
    };
  });
  rows.sort(cmpRows);
  let kept = rows;
  if (rows.length > cap) {
    kept = rows.slice(0, cap);
    if (!kept.some((r) => r.key === o.viewerKey)) {
      const mine = rows.find((r) => r.key === o.viewerKey);
      if (mine) kept.push(mine);
    }
  }
  return {
    n,
    mq: groupMq(list),
    divisiveIdx: groupDivisiveIdx(list),
    selfHash: o.hashFn(o.viewerKey, o.salt),
    rows: kept.map((r) => [r.h, r.gs, r.ns, r.t, r.pos, r.k]),
  };
}

/**
 * Friend board payload (spec 8.4 getFriendBoard): every complete daily of the day, hashed, ranked by national live
 * score then completion time. Over `listCap` -> `selfOnly` with only the caller's row (if complete).
 * @param {{dateKey:string, salt:string, refs:number[], entries:Array<{key,pos,completeAt,streak}>, viewerKey:string, viewerDone:boolean,
 *   hashFn:Function, listCap?:number}} o
 */
function buildFriendBoard(o) {
  const cap = o.listCap || CONFIG.board.listCap;
  const mk = (m) => ({
    key: m.key,
    h: o.hashFn(m.key, o.salt),
    ns: dailyTotal(m.pos, o.refs).total,
    t: secondsInDay(m.completeAt, o.dateKey),
    pos: o.viewerDone ? m.pos.join(',') : null,
    k: m.streak && m.streak >= 2 ? m.streak : null,
  });
  // o.total (optional, TD-42): the true number of complete dailies when the caller passes only a subset of entries (a backend
  // that pages or caps its read); defaults to entries.length. Above the cap the board is selfOnly (the viewer's own entry).
  const total = Number.isInteger(o.total) && o.total >= o.entries.length ? o.total : o.entries.length;
  let mode = 'full';
  let src = o.entries;
  if (total > cap) {
    mode = 'selfOnly';
    src = o.entries.filter((m) => m.key === o.viewerKey);
  }
  const rows = src.map(mk);
  rows.sort((a, b) => b.ns - a.ns || a.t - b.t || (a.h < b.h ? -1 : a.h > b.h ? 1 : 0));
  return {
    mode,
    total,
    selfHash: o.hashFn(o.viewerKey, o.salt),
    rows: rows.map((r) => [r.h, r.ns, r.t, r.pos, r.k]),
  };
}

/** The 7 date keys ending today, oldest first (spec 6.8). */
function trendDates(todayKey, days) {
  const n = days || G.trendDays;
  const out = [];
  for (let i = n - 1; i >= 0; i--) out.push(addDays(todayKey, -i));
  return out;
}

/** 7-day trend from a lookup(dateKey) -> {mq, n} | null (spec 8.4). A day with n < 3 or no data has mq null. */
function buildTrend(todayKey, lookup) {
  return trendDates(todayKey).map((dateKey) => {
    const g = lookup(dateKey);
    return { dateKey, mq: g && g.mq !== undefined && g.mq !== null && g.n >= G.minForMq ? g.mq : null, n: g ? g.n : 0 };
  });
}

module.exports = {
  secondsInDay,
  groupMedians,
  groupMq,
  groupDivisiveIdx,
  leaveOneOutScore,
  cardGroupBlock,
  closestPeer,
  buildGroupDay,
  buildFriendBoard,
  trendDates,
  buildTrend,
};
