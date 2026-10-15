/**
 * Board model for the open data domain (spec 8). Pure: no wx.
 *
 * buildModel(msg, rawRows) joins WeChat's friend/group rows to the server's
 * hashed rows and ranks by SERVER values only:
 *   h = sha256Hex(openid + "|" + salt).slice(0, 12)
 *   match     -> ranked with the server n / s / k (KV marker ignored entirely)
 *   no match  -> unverified ("未验证", or "好友自报" in selfOnly mode): shown
 *                with the KV value, no rank number, below all ranked rows
 *   no KV key and no match -> not shown (that friend has not played)
 * Ranking: n descending; EQUAL n share the same rank number (1,2,2,4);
 * within a tie the earlier s is listed first. The viewer's own server row is
 * added even when WeChat did not return them.
 *
 * rawRows: [{openid, nickname, avatarUrl, KVDataList:[{key,value}]}]
 * server rows: [h, n, s, k?]; marker value: {"n":14}
 */

const { sha256Hex } = require('./sha256');

const MAX_STREAK = 60;

function hashOf(openid, salt) {
  return sha256Hex(openid + '|' + salt).slice(0, 12);
}

function parseKv(row, key) {
  const list = (row && row.KVDataList) || [];
  for (let i = 0; i < list.length; i++) {
    if (list[i].key === key) {
      try {
        const v = JSON.parse(list[i].value);
        if (v && typeof v.n === 'number' && v.n >= 0 && v.n <= MAX_STREAK && v.n === Math.floor(v.n)) return { n: v.n };
      } catch (e) {
        /* garbage marker: ignore */
      }
    }
  }
  return null;
}

function buildModel(msg, rawRows) {
  const server = {};
  (msg.rows || []).forEach((r) => {
    server[r[0]] = { n: r[1], s: r[2], k: r[3] };
  });
  const key = 'd_' + msg.dateKey;
  const matched = {};
  const ranked = [];
  const unverified = [];

  (rawRows || []).forEach((row) => {
    if (!row || !row.openid) return;
    const h = hashOf(row.openid, msg.salt);
    const sv = server[h];
    const isSelf = h === msg.selfHash;
    if (sv && !matched[h]) {
      matched[h] = true;
      ranked.push({ h, name: isSelf ? '你' : row.nickname || '', avatarUrl: isSelf ? null : row.avatarUrl, n: sv.n, s: sv.s, k: sv.k || 0, self: isSelf });
    } else if (!sv) {
      const kv = parseKv(row, key);
      if (kv && msg.showUnverified !== false) unverified.push({ name: row.nickname || '', avatarUrl: row.avatarUrl, n: kv.n, self: false });
    }
  });

  if (msg.selfHash && server[msg.selfHash] && !matched[msg.selfHash]) {
    const sv = server[msg.selfHash];
    ranked.push({ h: msg.selfHash, name: '你', avatarUrl: null, n: sv.n, s: sv.s, k: sv.k || 0, self: true });
  }

  ranked.sort((a, b) => b.n - a.n || a.s - b.s || (a.h < b.h ? -1 : 1));
  // equal n share a rank number (1, 2, 2, 4)
  ranked.forEach((r, i) => {
    r.rank = i > 0 && ranked[i - 1].n === r.n ? ranked[i - 1].rank : i + 1;
  });
  unverified.sort((a, b) => b.n - a.n);

  return {
    ranked,
    unverified,
    unverifiedLabel: msg.mode === 'selfOnly' ? '好友自报' : '未验证',
    selfOnly: msg.mode === 'selfOnly',
    kind: msg.kind,
    viewerPlayed: !!msg.viewerPlayed,
  };
}

module.exports = { buildModel, hashOf, parseKv, MAX_STREAK };
