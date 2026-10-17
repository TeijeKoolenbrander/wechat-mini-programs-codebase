'use strict';
// getHome: the player's allowances and restriction, the room they are seated in, the group's open games, features and kill-switch state (spec 12, 13.2).
// Rev. 2: no 今日起点, no `daily`, no national counts, no meta/launch (F-2, AC 121). `groupRef` (optional) adds `group`: the group's open lobby and the number of
// 慢慢传 chains waiting for this player.
const { CONFIG } = require('./core/config');
const allowance = require('./core/allowance');
const strikes = require('./core/strikes');
const chainLib = require('./core/chain');
const roomLib = require('./core/room');
const store = require('./common/store');
const players = require('./common/players');
const groups = require('./common/groups');
const appconfig = require('./common/appconfig');
const { now } = require('./common/util');

exports.main = store.handler(async (event, { openid }) => {
  await store.rateLimit(openid, 'home', 1, 60);
  const c = await appconfig.forHome();
  const p = await players.touch(openid);
  const dk = players.dateKey();

  let warn = false;
  if (p.warnPending) {
    // read-once (TD-13): the transaction makes sure exactly one concurrent caller sees `true`
    warn = !!(await players.mutate(openid, (pl) => ({ player: Object.assign({}, pl, { warnPending: false }), result: pl.warnPending === true })));
  }
  const r = strikes.restrictionOf(p, now());
  const sl = allowance.startsLeft(p, dk);
  const left = allowance.roomsLeft(p, dk);
  const mine = await store.coll('chains').where({ participants: openid, state: 'revealed' }).limit(100).get();
  const unseenChains = mine.data.filter((ch) => ch.mode !== 'live' && !(ch.revealViewed || []).includes(openid)).length;
  const myRooms = await store.coll('rooms').where({ 'seats.openid': openid, state: 'reveal' }).limit(100).get();
  const unseenRooms = myRooms.data.filter((rm) => !(rm.revealViewed || []).includes(openid)).length;
  const paused = appconfig.createAllowed(c);

  // the room the player is seated in (a stale pointer is ignored)
  let activeRoom = null;
  if (p.activeRoomId) {
    const rm = await store.getDoc('rooms', p.activeRoomId);
    const i = rm ? roomLib.seatOf(rm, openid) : -1;
    if (rm && (rm.state === 'lobby' || rm.state === 'playing') && i >= 0 && rm.seats[i].status === 'active') {
      activeRoom = { roomId: rm._id, state: rm.state, round: rm.round, rounds: rm.R };
    }
  }

  const out = {
    ok: true,
    dateKey: dk,
    serverNow: now(),
    me: {
      rulesVersion: p.rulesVersion,
      rulesRequiredVersion: CONFIG.rulesVersion,
      restriction: r ? { until: r.until, permanent: r.permanent } : null,
      warnPending: warn,
      startsLeft: sl.startsLeft,
      adStartsLeft: sl.adStartsLeft,
      roomsLeft: left.created,
      joinsLeft: left.joined,
      turnsLeft: left.turns,
      paletteToday: allowance.paletteToday(p, dk),
      streak: allowance.currentStreak(p, dk),
      unseenReveals: unseenChains + unseenRooms,
      activeRoom,
    },
    features: { liveRooms: c.features.liveRooms, subscribe: c.subscribe, updatableCard: c.features.updatableCard, banner: c.banner, interstitial: c.config.ads.interstitial, rt: c.config.rt },
    room: { minPlayers: c.config.room.minPlayers, maxPlayers: c.config.room.maxPlayers, maxRounds: c.config.room.maxRounds, promptSec: c.config.room.promptSec, drawSec: c.config.room.drawSec, describeSec: c.config.room.describeSec, graceSec: c.config.room.graceSec },
    timers: c.config.timers,
    ugc: { createEnabled: paused.ok && c.ugc.createEnabled, viewEnabled: c.ugc.viewEnabled, pausedSource: paused.source },
  };

  if (typeof event.groupRef === 'string') {
    const openGId = await groups.groupContext(openid, event.groupRef);
    if (openGId) {
      const lobbies = await store.coll('rooms').where({ openGId, state: 'lobby' }).orderBy('lastActivityAt', 'desc').limit(5).get();
      const open = lobbies.data.find((rm) => rm.seats.length < CONFIG.room.maxPlayers);
      const _ = store._();
      const chains = (await store.coll('chains').where({ openGId, state: _.in(['open']) }).orderBy('lastActivityAt', 'desc').limit(30).get()).data;
      const ctx = {
        now: now(), rulesOk: p.rulesVersion >= CONFIG.rulesVersion, restrictedUntil: r ? r.until : 0, ugcOk: paused.ok, groupOpenGId: openGId, memberOfChainGroup: true,
        stepsToday: p.day.steps,
      };
      let waiting = 0;
      for (const ch of chains) {
        if (ch.mode === 'live') continue;
        const dec = chainLib.canClaim(ch, Object.assign({ openid, claimsOnChainToday: p.day.claims[ch._id] || 0 }, ctx));
        if (dec.ok && !dec.resume) waiting++;
      }
      out.group = { openRoom: open ? { roomId: open._id, joined: open.seats.length } : null, waitingChains: waiting };
    } else out.group = null;
  }
  return out;
});
