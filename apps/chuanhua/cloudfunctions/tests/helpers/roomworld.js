'use strict';
// A tiny world for the room tests: a harness, N agreed players in one group, and helpers to open / fill / start / play rooms.
const path = require('path');
const assert = require('node:assert/strict');
const { createHarness, cid } = require('./harness');
const sync = require('../../scripts/sync-core');

const CORE = sync.DEFAULT_CORE;
const { CONFIG } = require(path.join(CORE, 'config'));
const roomLib = require(path.join(CORE, 'room'));

const LETTERS = 'ABCDEFGHIJKLMNOP'.split('');
const drawing = (k, h) => ({ v: 2, h: h || 1363, s: Array.from({ length: k || 3 }, (_, i) => [i % 6, 1, 100 + i * 10, 100, 20, 30, 15, -10]) });

/**
 * @param {{n?:number, env?:object, now?:number}} [o] n = players A.. (default 5)
 * @returns the world: { h, u:{A:{id, ref, call}}, ids, create, joinAll, start, ... }
 */
async function roomWorld(o) {
  o = o || {};
  const n = o.n || 5;
  const h = createHarness({ now: o.now, env: o.env, imageMode: o.imageMode || 'sync' });
  const w = { h, u: {}, names: LETTERS.slice(0, n), log: [] };
  const quiet = console.error;
  const alerts = [];
  console.error = (...a) => {
    if (typeof a[0] === 'string' && a[0].startsWith('[ALERT]')) alerts.push(a[0]);
  };
  w.alerts = alerts;
  w.teardown = () => {
    console.error = quiet;
    h.teardown();
  };
  w.call = async (fn, data, who) => {
    h.db._col('chuanhua_rate_limits').clear(); // the limiter has its own tests (hardening.test.js)
    const r = await h.call(fn, data, { openid: who ? 'openid-' + who : undefined });
    w.log.push(r);
    return r;
  };
  for (const name of w.names) {
    const id = 'openid-' + name;
    w.u[name] = { id, call: (fn, data) => w.call(fn, data, name) };
    assert.equal((await w.u[name].call('agreeRules', { version: CONFIG.rulesVersion })).ok, true);
    const g = await w.u[name].call('joinGroup', { cloudID: cid('group-1') });
    assert.equal(g.ok, true, JSON.stringify(g));
    w.u[name].ref = g.groupRef;
  }
  w.ref = w.u.A.ref;
  w.rows = (col) => h.db.all('chuanhua_' + col);
  w.room = (id) => h.db.get('chuanhua_rooms', id);
  w.player = (name) => h.db.get('chuanhua_players', 'openid-' + name);
  w.patchRoom = (id, fn) => {
    const r = h.db.get('chuanhua_rooms', id);
    fn(r);
    h.db.put('chuanhua_rooms', r);
  };
  w.patchPlayer = (name, fn) => {
    const p = h.db.get('chuanhua_players', 'openid-' + name);
    fn(p);
    h.db.put('chuanhua_players', p);
  };
  /** host A creates a room from the group; the other names join; returns roomId */
  w.lobby = async (names, host) => {
    const hn = host || names[0];
    const c = await w.u[hn].call('createRoom', { groupRef: w.u[hn].ref });
    assert.equal(c.ok, true, JSON.stringify(c));
    for (const nm of names.filter((x) => x !== hn)) {
      const j = await w.u[nm].call('joinRoom', { roomId: c.roomId, groupRef: w.u[nm].ref });
      assert.equal(j.ok, true, nm + ' ' + JSON.stringify(j));
    }
    return c.roomId;
  };
  w.start = async (roomId, host) => {
    const s = await w.u[host || 'A'].call('startRoom', { roomId });
    assert.equal(s.ok, true, JSON.stringify(s));
    return s;
  };
  /** open a started room with `names` (default the first n) */
  w.game = async (names) => {
    const nm = names || w.names;
    const id = await w.lobby(nm);
    await w.start(id, nm[0]);
    return id;
  };
  /** the view of `name` once the current round has started */
  w.view = async (roomId, name) => {
    const r = w.room(roomId);
    if (r.state === 'playing' && h.now() < r.roundStartAt) h.setNow(r.roundStartAt + 1);
    return w.u[name].call('getRoom', { roomId });
  };
  /** everybody sends the round-0 pick (the first rolled prompt) */
  w.pickAll = async (roomId, names, opts) => {
    const out = {};
    for (const nm of names) {
      const v = await w.view(roomId, nm);
      assert.equal(v.round, 0, JSON.stringify(v));
      const roll = v.assignment.roll;
      out[nm] = await w.u[nm].call('submitRoomStep', Object.assign({ roomId, round: 0, rollId: roll.rollId, promptId: roll.prompts[0].id, auto: false, empty: false }, opts || {}));
      assert.equal(out[nm].ok, true, JSON.stringify(out[nm]));
    }
    return out;
  };
  /** everybody sends this round (draw: strokes, describe: text); returns responses by name */
  w.sendRound = async (roomId, names, o2) => {
    const r0 = w.room(roomId);
    const round = r0.round;
    const out = {};
    for (const nm of names) {
      await w.view(roomId, nm);
      const body = { roomId, round, auto: false, empty: false };
      if (r0.kind === 'draw') body.strokes = (o2 && o2.strokes) || drawing(3);
      else body.text = (o2 && o2.text) || '一只猫在开出租车';
      out[nm] = await w.u[nm].call('submitRoomStep', body);
    }
    return out;
  };
  w.expireRound = (roomId) => {
    const r = w.room(roomId);
    h.setNow(r.deadline + r.timers.graceSec * 1000 + 1);
  };
  return w;
}

module.exports = { roomWorld, drawing, LETTERS };
