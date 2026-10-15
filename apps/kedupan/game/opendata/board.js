/**
 * Board models for the open data domain (spec 8.3-8.5). Pure: no wx.
 *
 * buildModel(msg, rawRows) joins WeChat's friend/group rows to the server's
 * hashed rows and ranks by SERVER values only:
 *   h = sha256Hex(openid + "|" + salt).slice(0, 12)
 *   matched server row   -> nickname + avatar, server numbers
 *   unmatched server row -> "群友 A/B/C…" (stable order by h); never a name
 *   KV row, no server row -> not shown (group, round); in friend `selfOnly`
 *                            mode only, as "好友自报" without a rank
 * The viewer's own server row is always present and labelled 你.
 *
 * msg.view:
 *   'group'  rows [[h, gs, ns, t, pos?, k?], ...]
 *   'friend' rows [[h, ns, t, pos?, k?], ...]  (+ refs [R x5], mode 'full'|'selfOnly')
 *   'round'  rows [[h, g, s, late, isHost], ...] (+ target)
 * rawRows: [{openid, nickname, avatarUrl, KVDataList:[{key,value}]}]
 */

const { sha256Hex } = require('./sha256');

const KV_KEY = 'kd';

function hashOf(openid, salt) {
  return sha256Hex(openid + '|' + salt).slice(0, 12);
}

/** "a,b,c,d,e" or array -> 5 numbers 0-100, else null. */
function parsePos(x) {
  if (x == null) return null;
  const nums = Array.isArray(x) ? x : String(x).split(',');
  if (nums.length !== 5) return null;
  const out = nums.map(Number);
  return out.every((n) => n >= 0 && n <= 100) ? out : null;
}

function parseKv(row) {
  const list = (row && row.KVDataList) || [];
  for (let i = 0; i < list.length; i++) {
    if (list[i].key === KV_KEY) {
      try {
        const v = JSON.parse(list[i].value);
        if (v && typeof v.s === 'number' && v.s >= 0 && v.s <= 500) return { d: v.d, s: v.s };
      } catch (e) {
        /* garbage marker: ignore */
      }
    }
  }
  return null;
}

function anonName(i) {
  return '群友 ' + (i < 26 ? String.fromCharCode(65 + i) : String(i + 1));
}

/** Map of server hash -> {name, avatarUrl} for the matched WeChat rows. */
function matchRows(msg, rawRows) {
  const byHash = {};
  (rawRows || []).forEach((row) => {
    if (!row || !row.openid) return;
    const h = hashOf(row.openid, msg.salt);
    if (!byHash[h]) byHash[h] = row;
  });
  return byHash;
}

/** 最同频: smallest mean gap between the viewer and a matched member. */
function bestMatch(entries, selfPos) {
  if (!selfPos) return null;
  let best = null;
  entries.forEach((e) => {
    if (e.self || e.anon || !e.pos) return;
    let sum = 0;
    for (let i = 0; i < 5; i++) sum += Math.abs(e.pos[i] - selfPos[i]);
    const gap = sum / 5;
    if (!best || gap < best.gap || (gap === best.gap && e.t < best.t)) best = { name: e.name, gap, t: e.t };
  });
  return best;
}

function matchLine(best) {
  return best ? '今天和你最同频：' + best.name + '（平均差 ' + Math.round(best.gap) + ' 格）' : null;
}

function buildGroupOrFriend(msg, rawRows) {
  const group = msg.view === 'group';
  const byHash = matchRows(msg, rawRows);
  const server = (msg.rows || []).map((r) => {
    if (group) return { h: r[0], gs: r[1], ns: r[2], t: r[3], pos: msg.viewerDone ? parsePos(r[4]) : null, k: r[5] || 0 };
    return { h: r[0], ns: r[1], t: r[2], pos: msg.viewerDone ? parsePos(r[3]) : null, k: r[4] || 0 };
  });
  const key = group ? 'gs' : 'ns';
  const ordered = server.slice().sort((a, b) => b[key] - a[key] || a.t - b.t || (a.h < b.h ? -1 : 1));
  // stable anonymous letters: by hash order among rows that will be anonymous
  const anonOrder = server
    .filter((s) => s.h !== msg.selfHash && !(byHash[s.h] && byHash[s.h].nickname))
    .map((s) => s.h)
    .sort();
  const letter = {};
  anonOrder.forEach((h, i) => (letter[h] = anonName(i)));
  const entries = ordered.map((s, i) => {
    const self = s.h === msg.selfHash;
    const w = byHash[s.h];
    const anon = !self && !(w && w.nickname);
    return Object.assign({}, s, {
      rank: i + 1,
      self,
      anon,
      name: self ? '你' : anon ? letter[s.h] : w.nickname,
      avatarUrl: self || anon ? null : w.avatarUrl || null,
    });
  });
  const unverified = [];
  if (!group && msg.mode === 'selfOnly') {
    (rawRows || []).forEach((row) => {
      if (!row || !row.openid) return;
      const h = hashOf(row.openid, msg.salt);
      if (h === msg.selfHash || server.some((s) => s.h === h)) return;
      const kv = parseKv(row);
      if (kv) unverified.push({ name: row.nickname || '好友', avatarUrl: row.avatarUrl || null, reported: kv.s });
    });
    unverified.sort((a, b) => b.reported - a.reported);
  }
  const self = entries.find((e) => e.self);
  const best = msg.viewerDone ? bestMatch(entries, self && self.pos) : null;
  return {
    view: msg.view,
    entries,
    unverified,
    selfOnly: !group && msg.mode === 'selfOnly',
    refs: msg.refs || null,
    matchText: matchLine(best),
    viewerDone: !!msg.viewerDone,
  };
}

function buildRound(msg, rawRows) {
  const byHash = matchRows(msg, rawRows);
  const server = (msg.rows || []).map((r, i) => ({ h: r[0], g: r[1], s: r[2], late: !!r[3], host: !!r[4], order: i }));
  const anonOrder = server
    .filter((s) => s.h !== msg.selfHash && !(byHash[s.h] && byHash[s.h].nickname))
    .map((s) => s.h)
    .sort();
  const letter = {};
  anonOrder.forEach((h, i) => (letter[h] = anonName(i)));
  const target = typeof msg.target === 'number' ? msg.target : null;
  let bestIdx = -1;
  server.forEach((s, i) => {
    if (s.late || s.host) return;
    if (bestIdx < 0 || s.s > server[bestIdx].s) bestIdx = i;
  });
  const entries = server.map((s, i) => {
    const self = s.h === msg.selfHash;
    const w = byHash[s.h];
    const anon = !self && !(w && w.nickname);
    const name = self ? '你' : s.host && anon ? '出题人' : anon ? letter[s.h] : w.nickname;
    return {
      h: s.h,
      self,
      anon,
      host: s.host,
      late: s.late,
      best: i === bestIdx,
      name,
      avatarUrl: self || anon ? null : w.avatarUrl || null,
      g: s.g,
      s: s.s,
      gap: target != null && s.g != null ? Math.round(Math.abs(s.g - target)) : null,
      order: s.order,
    };
  });
  // on-time by score, then late, then the host row
  const rank = (e) => (e.host ? 2 : e.late ? 1 : 0);
  entries.sort((a, b) => rank(a) - rank(b) || b.s - a.s || a.order - b.order);
  return { view: 'round', entries, unverified: [], matchText: null, viewerDone: true };
}

function buildModel(msg, rawRows) {
  return msg.view === 'round' ? buildRound(msg, rawRows) : buildGroupOrFriend(msg, rawRows);
}

module.exports = { buildModel, hashOf, parseKv, parsePos, anonName, KV_KEY };
