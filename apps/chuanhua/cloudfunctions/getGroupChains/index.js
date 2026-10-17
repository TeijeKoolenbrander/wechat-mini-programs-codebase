'use strict';
// getGroupChains: 本群接龙 (spec 8.10, AC 98): waiting / in-progress / recently revealed chains of ONE group plus aggregate
// counts. Requires a fresh membership row for that group. No per-person data, no content other than passed texts.
const { CONFIG } = require('./core/config');
const views = require('./core/views');
const roomLib = require('./core/room');
const strikes = require('./core/strikes');
const store = require('./common/store');
const players = require('./common/players');
const groups = require('./common/groups');
const appconfig = require('./common/appconfig');
const env = require('./common/env');
const { bad } = require('./common/errors');
const { now } = require('./common/util');

exports.main = store.handler(async (event, { openid }) => {
  env.ugcGuard();
  await store.rateLimit(openid, 'group', 1, 60);
  const openGId = await groups.groupContext(openid, event.groupRef);
  if (!openGId) bad('NOT_MEMBER');
  const _ = store._();
  const [p, cfg] = await Promise.all([players.read(openid), appconfig.get()]);
  // a live room's chains appear as ONE room row (rooms / revealed), never as chains
  const live = (await store.coll('chains').where({ openGId, state: _.in(['starting', 'open', 'pending']) }).orderBy('lastActivityAt', 'desc').limit(100).get()).data.filter((c) => c.mode !== 'live');
  const done = (await store.coll('chains').where({ openGId, state: 'revealed' }).orderBy('lastActivityAt', 'desc').limit(CONFIG.groupList.revealedMax * 2).get()).data.filter((c) => c.mode !== 'live');
  const openRooms = (await store.coll('rooms').where({ openGId, state: _.in(['lobby', 'playing']) }).orderBy('lastActivityAt', 'desc').limit(20).get()).data;
  const doneRooms = (await store.coll('rooms').where({ openGId, state: 'reveal' }).orderBy('lastActivityAt', 'desc').limit(CONFIG.groupList.revealedMax).get()).data;

  // the final sentences of the revealed chains (passed text only)
  const sentenceIds = [];
  done.forEach((ch) => [6, 4, 2].forEach((n) => ch.stepIds[n] && sentenceIds.push(ch.stepIds[n])));
  const stepDocs = {};
  for (let i = 0; i < sentenceIds.length; i += 50) {
    const r = await store.coll('steps').where({ _id: _.in(sentenceIds.slice(i, i + 50)) }).limit(50).get();
    r.data.forEach((s) => (stepDocs[s._id] = s));
  }

  const r = strikes.restrictionOf(p, now());
  const baseCtx = {
    openid, now: now(), rulesOk: p.rulesVersion >= CONFIG.rulesVersion, restrictedUntil: r ? r.until : 0,
    ugcOk: appconfig.createAllowed(cfg).ok, groupOpenGId: openGId, memberOfChainGroup: true, stepsToday: p.day.steps,
  };
  const out = { rooms: [], waiting: [], inProgress: [], revealed: [] };
  for (const rm of openRooms) {
    const row = roomLib.groupRoomRow(rm, { member: roomLib.isMember(rm, openid) });
    if (row) out.rooms.push(Object.assign({ kind: 'room' }, row));
  }
  for (const ch of live.concat(done)) {
    const row = views.groupRow(ch, Object.assign({ claimsOnChainToday: p.day.claims[ch._id] || 0 }, baseCtx));
    if (!row) continue;
    if (row.section === 'revealed') {
      const sbn = {};
      ch.stepIds.forEach((sid, n) => {
        if (sid && stepDocs[sid]) sbn[n] = stepDocs[sid];
      });
      out.revealed.push({ kind: 'chain', chainId: ch._id, participant: row.participant, ...(cfg.ugc.viewEnabled ? { promptText: ch.promptText, finalText: views.finalSentence(ch, sbn) } : { promptText: null, finalText: null, paused: true }), revealedAt: ch.revealedAt });
    } else out[row.section].push(row);
  }
  for (const rm of doneRooms) out.revealed.push({ kind: 'room', roomId: rm._id, n: rm.n, member: roomLib.isMember(rm, openid), revealedAt: rm.endedAt });
  out.revealed.sort((a, b) => b.revealedAt - a.revealedAt);
  out.revealed = out.revealed.slice(0, CONFIG.groupList.revealedMax);
  out.waiting.sort((a, b) => b.lastActivityAt - a.lastActivityAt);
  out.inProgress.sort((a, b) => b.lastActivityAt - a.lastActivityAt);
  const gs = await store.getDoc('group_stats', openGId);
  return Object.assign({ ok: true, stats: views.groupStatsView(gs), serverNow: now() }, out);
});

