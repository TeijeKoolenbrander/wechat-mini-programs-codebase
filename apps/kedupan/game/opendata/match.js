/**
 * Open data domain data model (spec 8.5, AC 43-45): joins SERVER rows with the WeChat friend/group list. Pure JS, no wx.
 * The drawing (opendata/draw.js, frontend-ui) only paints what this returns. Ranks, scores and order come from the server rows
 * alone; the KV marker (`kd`) is never used to rank (AC 43). Nicknames and avatars exist only here (data minimisation).
 *
 *   buildModel({ view:'group'|'friend'|'round', serverRows, salt, selfHash, kvList, viewerDone, mode?, dateKey? })
 *
 * kvList items are what wx.getGroupCloudStorage / getFriendCloudStorage return:
 *   { openid, nickname, avatarUrl, KVDataList:[{key:'kd', value:'{"d":"20261105","s":412}'}] }
 */

const { sha256Hex } = require('./sha256');
const { closestPeer, parsePos } = require('./peer');

/** h = sha256(openid + '|' + salt)[0..12): the same rule as cloudfunctions/common/util.js rowHash. */
function rowHash(openid, salt) {
  return sha256Hex(openid + '|' + salt).slice(0, 12);
}

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
function anonLabel(i) {
  return '群友 ' + (i < 26 ? LETTERS[i] : i + 1);
}

/** Parse the presence marker; returns {d, s} or null. Never used for ranking. */
function parseMarker(kv) {
  const item = (kv.KVDataList || []).find((x) => x && x.key === 'kd');
  if (!item) return null;
  try {
    const v = JSON.parse(item.value);
    return v && typeof v.d === 'string' && Number.isInteger(v.s) ? { d: v.d, s: v.s } : null;
  } catch (e) {
    return null;
  }
}

function buildModel(o) {
  const byHash = {};
  const kvHashes = new Set();
  (o.kvList || []).forEach((kv) => {
    if (!kv || typeof kv.openid !== 'string') return;
    const h = rowHash(kv.openid, o.salt);
    byHash[h] = kv;
    kvHashes.add(h);
  });

  // stable anonymous letters: unmatched server rows ordered by h (independent of rank, so labels do not jump)
  const unmatched = o.serverRows.map((r) => r[0]).filter((h) => !byHash[h] && h !== o.selfHash).sort();
  const letter = {};
  unmatched.forEach((h, i) => {
    letter[h] = anonLabel(i);
  });

  const nameOf = (h, isHost) => {
    if (h === o.selfHash) return '你';
    if (isHost) return '出题人';
    return byHash[h] ? byHash[h].nickname || anonLabel(unmatched.length) : letter[h];
  };

  const rows = o.serverRows.map((r, i) => {
    const h = r[0];
    const kv = byHash[h] || null;
    const base = { h, rank: i + 1, isSelf: h === o.selfHash, matched: !!kv, name: null, avatarUrl: kv ? kv.avatarUrl || null : null };
    if (o.view === 'group') Object.assign(base, { gs: r[1], ns: r[2], t: r[3], pos: r[4], k: r[5] });
    else if (o.view === 'friend') Object.assign(base, { ns: r[1], t: r[2], pos: r[3], k: r[4] });
    else Object.assign(base, { g: r[1], s: r[2], late: r[3] === 1, isHost: r[4] === 1, rank: undefined });
    base.name = nameOf(h, base.isHost);
    base.anonymous = !kv && !base.isSelf && !base.isHost;
    return base;
  });

  // 最同频: viewer completed, matched peers only, computed here (PD-20)
  let peer = null;
  if (o.viewerDone && (o.view === 'group' || o.view === 'friend')) {
    const self = rows.find((r) => r.isSelf);
    const me = self ? parsePos(self.pos) : null;
    if (me) {
      const peers = rows
        .filter((r) => !r.isSelf && r.matched && parsePos(r.pos))
        .map((r) => ({ key: r.h, pos: parsePos(r.pos), completeAt: r.t }));
      const best = closestPeer(me, peers);
      if (best) peer = { h: best.key, name: nameOf(best.key, false), gap: best.gap, gapText: String(Math.round(best.gap)) };
    }
  }

  // friend board selfOnly: KV-only friends are listed as 好友自报 without a rank (spec 6.8, AC 43)
  const selfReported = [];
  if (o.view === 'friend' && o.mode === 'selfOnly') {
    (o.kvList || []).forEach((kv) => {
      const h = rowHash(kv.openid, o.salt);
      if (h === o.selfHash || o.serverRows.some((r) => r[0] === h)) return;
      const m = parseMarker(kv);
      if (m && m.d === o.dateKey) selfReported.push({ name: kv.nickname || '好友', avatarUrl: kv.avatarUrl || null, scoreText: String(m.s), rank: null, label: '好友自报' });
    });
  }

  const hasNames = rows.some((r) => r.matched);
  return { rows, peer, selfReported, hasNames };
}

module.exports = { buildModel, rowHash, anonLabel, parseMarker };
