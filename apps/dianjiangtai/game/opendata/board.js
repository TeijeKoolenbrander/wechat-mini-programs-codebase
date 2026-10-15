/**
 * Board model for the open data domain (spec 11.4). Pure: no wx.
 *
 * buildModel(msg, rawRows) joins WeChat's friend/group rows to the server's
 * hashed rows and ranks by SERVER values only:
 *   h = sha256Hex(openid + "|" + salt).slice(0, 12)
 *   match     -> ranked with the server w / s (KV marker ignored entirely)
 *   no match  -> unverified ("未验证", or "好友自报" in selfOnly mode): shown
 *                with the KV record, no rank number, below all ranked rows
 *   no KV key and no match -> not shown (that friend has not played)
 * The viewer's own server row is added even when WeChat did not return them.
 *
 * rawRows: [{openid, nickname, avatarUrl, KVDataList:[{key,value}]}]
 */

const { sha256Hex } = require('./sha256');

const BATTLES = 12;

function hashOf(openid, salt) {
  return sha256Hex(openid + '|' + salt).slice(0, 12);
}

function parseKv(row, key) {
  const list = (row && row.KVDataList) || [];
  for (let i = 0; i < list.length; i++) {
    if (list[i].key === key) {
      try {
        const v = JSON.parse(list[i].value);
        if (v && typeof v.w === 'number' && v.w >= 0 && v.w <= BATTLES) return { w: v.w, l: typeof v.l === 'number' ? v.l : BATTLES - v.w };
      } catch (e) {
        /* garbage marker: ignore */
      }
    }
  }
  return null;
}

function parseLineup(x) {
  if (x == null) return null;
  const nums = Array.isArray(x) ? x : String(x).match(/\d+/g);
  if (!nums || nums.length !== 5) return null;
  const out = nums.map(Number);
  return out.every((n) => n >= 0 && n < 1000) ? out : null;
}

function buildModel(msg, rawRows) {
  const server = {};
  (msg.rows || []).forEach((r) => {
    server[r[0]] = { w: r[1], s: r[2], x: r[3], k: typeof r[4] === 'number' ? r[4] : 0 };
  });
  const key = 'd_' + msg.dateKey;
  const matchedHashes = {};
  const ranked = [];
  const unverified = [];

  (rawRows || []).forEach((row) => {
    if (!row || !row.openid) return;
    const h = hashOf(row.openid, msg.salt);
    const sv = server[h];
    const isSelf = h === msg.selfHash;
    if (sv && !matchedHashes[h]) {
      matchedHashes[h] = true;
      ranked.push({ h, name: isSelf ? '你' : row.nickname || '', avatarUrl: isSelf ? null : row.avatarUrl, w: sv.w, l: BATTLES - sv.w, s: sv.s, self: isSelf, k: sv.k, lineup: msg.viewerPlayed ? parseLineup(sv.x) : null });
    } else if (!sv) {
      const kv = parseKv(row, key);
      if (kv && msg.showUnverified !== false) unverified.push({ name: row.nickname || '', avatarUrl: row.avatarUrl, w: kv.w, l: kv.l, self: false });
    }
  });

  // the viewer's own server row, even if WeChat did not list them
  if (msg.selfHash && server[msg.selfHash] && !matchedHashes[msg.selfHash]) {
    const sv = server[msg.selfHash];
    ranked.push({ h: msg.selfHash, name: '你', avatarUrl: null, w: sv.w, l: BATTLES - sv.w, s: sv.s, self: true, k: sv.k, lineup: msg.viewerPlayed ? parseLineup(sv.x) : null });
  }

  ranked.sort((a, b) => b.w - a.w || a.s - b.s || (a.h < b.h ? -1 : 1));
  ranked.forEach((r, i) => (r.rank = i + 1));
  unverified.sort((a, b) => b.w - a.w);

  return {
    ranked,
    unverified,
    unverifiedLabel: msg.mode === 'selfOnly' ? '好友自报' : '未验证',
    selfOnly: msg.mode === 'selfOnly',
    kind: msg.kind,
    viewerPlayed: !!msg.viewerPlayed,
  };
}

module.exports = { buildModel, hashOf, parseKv, parseLineup, BATTLES };
