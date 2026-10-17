'use strict';
// One interface over the two implementations of the contract, so ONE suite can run against both:
//   mock  = apps/kedupan/game/js/mock-server.js (what the client is built against)
//   real  = the cloud functions themselves, on the fake database
// Every method is async. Both sides use the same content library (the real one), the same schedule and a controlled clock.
const path = require('node:path');
const { createMockServer, encodeMockCloudID, encodeMockCloudData } = require('../../../game/js/mock-server');
const { getServerContent: getContent } = require('../../../game/core/content');
const SCH = require('../../../game/core/schedule');
const { dateKeyToMs, beijingDateKey } = require('../../../game/core/date');
const { mulberry32, hash32 } = require('../../../game/core/rng');
const SV = require('../../../game/core/service');
const S = require('../../../game/core/score');
const { stage, createRealBackend } = require('./real-backend');
const { clone } = require('./fake-db');

const LAUNCH = '20261101';
const content = getContent();
const schedule = SCH.buildSchedule(content, { launchKey: LAUNCH, days: 60 }).schedule;
const BJ = (key, h, m, s) => dateKeyToMs(key) + (((h || 0) * 60 + (m || 0)) * 60 + (s || 0)) * 1000;

const COL = {
  sets: 'daily_sets', stats: 'daily_card_stats', entries: 'daily_entries', players: 'player_stats', members: 'group_members',
  rounds: 'rounds', guesses: 'guesses', grants: 'sub_grants', reports: 'card_reports', events: 'events', anomalies: 'anomalies', rate: 'rate_limits',
};

let stages = {};
function sharedStage(withSchedule) {
  const k = withSchedule ? 'sch' : 'auto';
  if (!stages[k]) stages[k] = stage({ schedule: withSchedule ? schedule : null });
  return stages[k];
}
function disposeStages() {
  Object.values(stages).forEach((s) => s.dispose());
  stages = {};
}

/** crowd histogram, identical to mock-server seedCrowd */
function crowd(hist, anchor, dateKey, idx, n, o) {
  const r = mulberry32(hash32('crowd:' + dateKey + ':' + idx));
  const mean = (o && o.mean) || anchor;
  const sd = (o && o.sd) || 14;
  for (let i = 0; i < n; i++) {
    const g = (r() + r() + r() + r() - 2) * sd * 1.7;
    hist[Math.max(0, Math.min(100, Math.round(mean + g)))] += 1;
  }
}

/**
 * @param {'mock'|'real'} kind
 * @param {{date?:string, noSchedule?:boolean, appConfig?:object, hour?:number}} o
 */
function makeBackend(kind, o) {
  o = o || {};
  let t = BJ(o.date || '20261105', o.hour === undefined ? 10 : o.hour, 0, 0);
  const clock = { now: () => t, set: (ms) => { t = ms; }, add: (ms) => { t += ms; }, BJ };
  const sch = o.noSchedule ? null : schedule;
  let rngSeed = 7;
  const random = () => ((rngSeed = (rngSeed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const be = { kind, clock, content, schedule: sch, LAUNCH, BJ, cloudID: encodeMockCloudID, cloudData: encodeMockCloudData };
  /** open a draft round with a PRESET clue (the 'chat' clue is gone, D-2): the round's own spectrum, item `idx` (default 0). Returns the setClue response. */
  be.clue = async (host, roundId, idx) => {
    const r = await be.roundDoc(roundId);
    const sp = content.spectrumById[r.spectrumId];
    return be.call(host, 'setClue', { roundId, clueMode: 'preset', clueItemId: sp.items[idx || 0].id });
  };

  if (kind === 'mock') {
    const srv = createMockServer({ now: clock.now, content, schedule: sch, launchKey: LAUNCH, random, appConfig: o.appConfig || null });
    be.srv = srv;
    srv.rateLimits = !!o.limits; // the per-minute limiter (M3) is off unless a test asks for it: most suites hammer one function inside one fake minute
    be.call = async (openid, name, data) => srv.callAs(openid, name, data);
    be.timer = async (name) => srv.runTimer(name);
    be.dispose = () => {};
    be.sent = async () => srv.sent.map((m) => ({ to: m.to, roundId: m.roundId, mq: m.mq }));
    be.setAppConfig = async (cfg) => { srv.appConfig = cfg; };
    be.hist = async (dateKey, idx) => srv.db.stats[dateKey + '_' + idx].hist.slice();
    be.statsN = async (dateKey, idx) => srv.db.stats[dateKey + '_' + idx].n;
    be.setDoc = async (dateKey) => (srv.db.sets[dateKey] ? clone(srv.db.sets[dateKey]) : null);
    be.entryDoc = async (dateKey, openid) => clone(srv.db.entries[dateKey + '_' + openid] || null);
    be.count = async (logical) => {
      const m = { group_members: 'members', rounds: 'rounds', guesses: 'guesses', sub_grants: 'grants', card_reports: 'reports', events: 'events', daily_entries: 'entries', daily_sets: 'sets' }[logical];
      const v = srv.db[m];
      return Array.isArray(v) ? v.length : Object.keys(v).length;
    };
    be.seedCrowd = async (dateKey, idx, n, opt) => srv.seedCrowd(dateKey, idx, n, opt);
    be.putEntry = async (dateKey, openid, pos, completeAt) => {
      const e = SV.newEntry({ openid, dateKey, contentVersion: 1 });
      e.pos = pos.slice();
      e.answeredAt = pos.map((p) => (p === null ? null : completeAt));
      e.firstAt = completeAt - 60000;
      if (pos.indexOf(null) < 0) e.completeAt = completeAt;
      srv.db.entries[e._id] = e;
    };
    be.replaceCard = async (dateKey, idx, itemId) => {
      const card = require('../../../game/core/content').cardOf(content, itemId);
      const r = SV.replaceCard(srv.db.sets[dateKey], idx, card, clock.now());
      srv.db.sets[dateKey] = r.set;
      srv.db.stats[r.stats._id] = r.stats;
    };
    be.putMember = async (openGId, openid, groupRef) => {
      srv.db.members[openGId + '_' + openid] = { openGId, openid, groupRef, firstSeen: '20261105', lastSeen: '20261105' };
    };
    // D-2 typed clues: server-side state a test may look at (never reachable through a client response)
    be.modLog = async () => clone(srv.db.modLog);
    be.playerDoc = async (openid) => clone(srv.db.players[openid] || null);
    be.putPlayer = async (doc) => { srv.db.players[doc._id] = clone(doc); };
    be.clueReports = async () => clone(Object.keys(srv.db.clueReports).map((k) => srv.db.clueReports[k]));
    be.auditLog = async () => clone(srv.db.audit);
    be.allEvents = async () => clone(srv.db.events);
    be.roundDoc = async (id) => clone(srv.db.rounds[id] || null);
    be.putRound = async (r) => { srv.db.rounds[r._id] = clone(r); };
    be.putSet = async (s) => { srv.db.sets[s._id] = clone(s); };
    return be;
  }

  const st = sharedStage(!o.noSchedule);
  const real = createRealBackend({ stage: st, clock, appConfig: o.appConfig || null, env: o.env });
  be.real = real;
  be.db = real.db;
  // the per-minute limiter (M3) is real, but its counters are cleared before every call unless a test asks for o.limits:
  // most suites hammer one function inside one fake minute. The limiter itself is exercised in hardening.test.js.
  be.call = (openid, name, data) => {
    if (!o.limits && real.db.cols.kedupan_rate_limits) for (const d of real.db.all('kedupan_rate_limits')) if (d._id.indexOf('fn_') === 0) real.db.cols.kedupan_rate_limits.delete(d._id);
    return real.callAs(openid, name, data);
  };
  be.timer = (name) => real.runTimer(name);
  be.dispose = () => real.dispose();
  be.sent = async () => real.sdk.state.sent.map((m) => ({ to: m.touser, roundId: String(m.page).split('r=')[1], data: m.data }));
  be.setAppConfig = async (cfg) => { real.db.put('kedupan_app_config', { _id: 'live', ...cfg }); };
  be.hist = async (dateKey, idx) => real.db.get('kedupan_daily_card_stats', dateKey + '_' + idx).hist.slice();
  be.statsN = async (dateKey, idx) => real.db.get('kedupan_daily_card_stats', dateKey + '_' + idx).n;
  be.setDoc = async (dateKey) => real.db.get('kedupan_daily_sets', dateKey) || null;
  be.entryDoc = async (dateKey, openid) => real.db.get('kedupan_daily_entries', dateKey + '_' + openid) || null;
  be.count = async (logical) => real.db.size('kedupan_' + logical);
  be.seedCrowd = async (dateKey, idx, n, opt) => {
    if (!real.db.get('kedupan_daily_sets', dateKey)) await be.call('seed-user', 'getDaily', {});
    const set = real.db.get('kedupan_daily_sets', dateKey);
    const stats = real.db.get('kedupan_daily_card_stats', dateKey + '_' + idx);
    crowd(stats.hist, set.cards[idx].anchor, dateKey, idx, n, opt);
    stats.n += n;
    real.db.put('kedupan_daily_card_stats', stats);
  };
  be.putEntry = async (dateKey, openid, pos, completeAt) => {
    const e = SV.newEntry({ openid, dateKey, contentVersion: 1 });
    e.pos = pos.slice();
    e.answeredAt = pos.map((p) => (p === null ? null : completeAt));
    e.firstAt = completeAt - 60000;
    if (pos.indexOf(null) < 0) e.completeAt = completeAt;
    real.db.put('kedupan_daily_entries', e);
  };
  be.replaceCard = async (dateKey, idx, itemId) => {
    const card = require('../../../game/core/content').cardOf(content, itemId);
    const r = SV.replaceCard(real.db.get('kedupan_daily_sets', dateKey), idx, card, clock.now());
    real.db.put('kedupan_daily_sets', r.set);
    real.db.put('kedupan_daily_card_stats', r.stats);
  };
  be.putMember = async (openGId, openid, groupRef) => {
    real.db.put('kedupan_group_members', { _id: openGId + '_' + openid, openGId, openid, groupRef, firstSeen: '20261105', lastSeen: '20261105' });
  };
  be.modLog = async () => real.db.all('kedupan_mod_log');
  be.playerDoc = async (openid) => real.db.get('kedupan_player_stats', openid) || null;
  be.putPlayer = async (doc) => real.db.put('kedupan_player_stats', doc);
  be.clueReports = async () => real.db.all('kedupan_clue_reports');
  be.auditLog = async () => real.db.all('kedupan_audit_log');
  be.allEvents = async () => real.db.all('kedupan_events');
  be.roundDoc = async (id) => real.db.get('kedupan_rounds', id) || null;
  be.putRound = async (r) => real.db.put('kedupan_rounds', r);
  be.putSet = async (s) => real.db.put('kedupan_daily_sets', s);
  return be;
}

/** Answer all five cards as `openid` at `positions`; returns the 5 responses. */
async function playDay(be, openid, positions, extra, dateKey) {
  const dk = dateKey || beijingDateKey(be.clock.now());
  await be.call(openid, 'getDaily', dateKey ? { dateKey } : {});
  const out = [];
  for (let i = 0; i < 5; i++) out.push(await be.call(openid, 'submitCard', { dateKey: dk, idx: i, pos: positions[i], ...(extra || {}) }));
  return out;
}

/** Every string (keys and values) in a JSON value */
function allStrings(x, acc) {
  acc = acc || [];
  if (typeof x === 'string') acc.push(x);
  else if (Array.isArray(x)) x.forEach((v) => allStrings(v, acc));
  else if (x && typeof x === 'object') Object.keys(x).forEach((k) => { acc.push(k); allStrings(x[k], acc); });
  return acc;
}

module.exports = { makeBackend, sharedStage, playDay, allStrings, disposeStages, content, schedule, LAUNCH, BJ, COL, S, path };
