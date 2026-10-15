/**
 * Board model for the open data domain (spec 8.8, 11). Pure: no wx.
 *
 * buildModel(msg, rawRows) joins WeChat's friend/group rows to the server's
 * hashed rows and orders them by SERVER values only:
 *   h = sha256Hex(openid + "|" + salt).slice(0, 12)
 *   server row: [h, st, n, hi, b, s, k?]
 *     st 1 solved / 2 playing / 3 gave up, n steps, hi hints used,
 *     b best rank, s finish (or last-guess) seconds after 00:00 BJT, k streak
 *   match     -> sectioned by the server's st; the KV marker is ignored
 *   no match  -> "未验证" (KV marker d_<dateKey> present), no rank number,
 *                below all other sections
 *   no match and no marker -> not shown
 * The viewer's own server row is added even when WeChat did not list them.
 * Rows carry no words and no lineups, so there is nothing to spoil.
 *
 * msg: {kind, dateKey, salt, selfHash, mode: 'full'|'group'|'selfOnly',
 *   rows, showUnverified?, othersPlaying?}
 *   othersPlaying: count shown as "另有 N 人正在猜" when WeChat withheld
 *   openids for members with no marker (spec 11 fallback); default 0.
 * rawRows: [{openid, nickname, avatarUrl, KVDataList:[{key,value}]}]
 */

const { sha256Hex } = require('./sha256');

function hashOf(openid, salt) {
  return sha256Hex(openid + '|' + salt).slice(0, 12);
}

/** KV marker {s, h, st} written by the client after a finished ranked daily. */
function parseKv(row, key) {
  const list = (row && row.KVDataList) || [];
  for (let i = 0; i < list.length; i++) {
    if (list[i].key === key) {
      try {
        const v = JSON.parse(list[i].value);
        if (v && typeof v.s === 'number' && v.s >= 0 && v.s <= 100000) return { s: v.s, h: typeof v.h === 'number' ? v.h : 0, st: v.st === 'gaveup' ? 'gaveup' : 'solved' };
      } catch (e) {
        /* garbage marker: ignore */
      }
    }
  }
  return null;
}

function byOrder(a, b) {
  return a.key1 - b.key1 || a.key2 - b.key2 || a.key3 - b.key3 || (a.h < b.h ? -1 : a.h > b.h ? 1 : 0);
}

function buildModel(msg, rawRows) {
  const server = {};
  (msg.rows || []).forEach((r) => {
    server[r[0]] = { st: r[1], n: r[2], hi: r[3], b: r[4], s: r[5], k: r[6] };
  });
  const key = 'd_' + msg.dateKey;
  const matched = {};
  const solved = [];
  const playing = [];
  const gaveup = [];
  const unverified = [];

  const place = (h, sv, name, avatarUrl, isSelf) => {
    const base = { h, name: isSelf ? '你' : name || '', avatarUrl: isSelf ? null : avatarUrl, self: isSelf, n: sv.n, hi: sv.hi, b: sv.b, k: sv.k >= 2 ? sv.k : 0 };
    if (sv.st === 1) solved.push(Object.assign(base, { key1: sv.n, key2: sv.hi, key3: sv.s }));
    else if (sv.st === 2) playing.push(Object.assign(base, { key1: sv.b, key2: 0, key3: sv.s }));
    else if (sv.st === 3) gaveup.push(Object.assign(base, { key1: sv.b, key2: 0, key3: sv.s }));
  };

  (rawRows || []).forEach((row) => {
    if (!row || !row.openid) return;
    const h = hashOf(row.openid, msg.salt);
    const sv = server[h];
    const isSelf = h === msg.selfHash;
    if (sv && !matched[h]) {
      matched[h] = true;
      place(h, sv, row.nickname, row.avatarUrl, isSelf);
    } else if (!sv) {
      const kv = parseKv(row, key);
      if (kv && msg.showUnverified !== false) unverified.push({ h, name: row.nickname || '', avatarUrl: row.avatarUrl, self: false, kv });
    }
  });

  if (msg.selfHash && server[msg.selfHash] && !matched[msg.selfHash]) place(msg.selfHash, server[msg.selfHash], '你', null, true);

  solved.sort(byOrder);
  solved.forEach((r, i) => (r.rank = i + 1));
  playing.sort(byOrder);
  gaveup.sort(byOrder);
  unverified.sort((a, b) => (a.h < b.h ? -1 : 1));

  return {
    kind: msg.kind,
    solved,
    playing,
    gaveup,
    unverified,
    othersPlaying: msg.othersPlaying > 0 ? Math.floor(msg.othersPlaying) : 0,
    selfOnly: msg.mode === 'selfOnly',
    unverifiedLabel: msg.mode === 'selfOnly' ? '好友自报' : '未验证',
  };
}

module.exports = { buildModel, hashOf, parseKv };
