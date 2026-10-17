'use strict';
// getMyChains: 我的接龙 (spec 8.11, TD-8, TD-9). The caller's OWN 棒 only (including a pending drawing), never other
// authors' content. In `{chainId}` mode it also returns the caller's own 棒 with content for the detail screen.
const { CONFIG } = require('./core/config');
const chainLib = require('./core/chain');
const roomLib = require('./core/room');
const views = require('./core/views');
const allowance = require('./core/allowance');
const store = require('./common/store');
const players = require('./common/players');
const env = require('./common/env');
const { bad } = require('./common/errors');
const { chainIdOf } = require('./common/input');

const { STATE, STEP } = chainLib;
const MAX_STEPS = 400;

async function chainsByIds(ids) {
  const out = {};
  const _ = store._();
  for (let i = 0; i < ids.length; i += 50) {
    const r = await store.coll('chains').where({ _id: _.in(ids.slice(i, i + 50)) }).limit(50).get();
    r.data.forEach((c) => (out[c._id] = c));
  }
  return out;
}

exports.main = store.handler(async (event, { openid }) => {
  env.ugcGuard();
  await store.rateLimit(openid, 'mine', 1, 60);

  if (event.chainId !== undefined) {
    const id = chainIdOf(event);
    const ch = id && (await store.getDoc('chains', id));
    const mineDocs = ch ? (await store.coll('steps').where({ chainId: id }).limit(100).get()).data.filter((s) => s.author === openid) : [];
    if (!ch || !(mineDocs.length || (ch.starter === openid && ch.state !== STATE.ABANDONED))) bad('CHAIN_NOT_FOUND');
    const byN = {};
    mineDocs.forEach((s) => (byN[s.n + '_' + s.attempt] = s));
    const item = views.albumItem(ch, byN, openid);
    const mine = mineDocs.sort((a, b) => a.n - b.n || a.attempt - b.attempt).map((s) => {
      const row = { n: s.n, kind: s.kind, modState: s.state, canDelete: s.state === STEP.PASSED };
      if (s.strokes) row.strokes = s.strokes;
      if (s.text) row.text = s.text;
      return row;
    });
    return { ok: true, item, mine };
  }

  const stepDocs = (await store.coll('steps').where({ author: openid }).orderBy('createdAt', 'desc').limit(MAX_STEPS).get()).data;
  const mineByChain = {};
  stepDocs.forEach((s) => ((mineByChain[s.chainId] = mineByChain[s.chainId] || {})[s.n + '_' + s.attempt] = s));
  const started = (await store.coll('chains').where({ participants: openid }).limit(MAX_STEPS).get()).data.filter((c) => c.starter === openid && c.state !== STATE.ABANDONED);
  const ids = new Set(Object.keys(mineByChain));
  const docs = {};
  started.forEach((c) => {
    ids.add(c._id);
    docs[c._id] = c;
  });
  const missing = [...ids].filter((i) => !docs[i]);
  Object.assign(docs, await chainsByIds(missing));
  // a live room's chains are shown as ONE room item (8.12), never one per chain
  const chainItems = [...ids].filter((i) => docs[i] && docs[i].mode !== 'live').map((i) => views.albumItem(docs[i], mineByChain[i] || {}, openid));
  const rooms = (await store.coll('rooms').where({ 'seats.openid': openid }).orderBy('lastActivityAt', 'desc').limit(100).get()).data;
  const roomItems = rooms.filter((r) => r.state !== 'closed' || r.startedAt).map((r) => roomLib.albumItem(r, openid, r.state === 'reveal' && !(r.revealViewed || []).includes(openid)));
  const all = chainItems.concat(roomItems).sort((a, b) => b.lastActivityAt - a.lastActivityAt);
  const parsed = parseInt(event.cursor, 10);
  const start = typeof event.cursor === 'string' && parsed > 0 ? parsed : 0;
  const page = all.slice(start, start + CONFIG.groupList.albumPage);
  const next = start + page.length < all.length ? String(start + page.length) : null;
  const p = await players.read(openid);
  return { ok: true, items: page, cursor: next, streak: allowance.currentStreak(p, players.dateKey()), unseenReveals: all.filter((x) => x.unseen).length };
});
