'use strict';
// Contract-suite drivers: one interface over (1) the in-memory mock server (game/js/mock-server.js) and (2) the REAL cloud
// functions on the fake database / fake SDK, in two moderation setups:
//   - 'mock'  : MODERATION_MODE=mock, ENV_KIND=dev (verdicts scheduled by the functions themselves, like the mock server)
//   - 'live'  : ENV_KIND=prod, MODERATION_MODE=live. The fake WeChat platform answers msgSecCheck / mediaCheckAsync with the
//               same rules as the mock verdicts and pushes image verdicts into the real `onMediaCheck` function when due.
// A scenario written against this interface therefore proves the functions behave exactly like the executable reference.
const path = require('path');
const { createHarness, cid } = require('./harness');
const sync = require('../../scripts/sync-core');

const CORE = sync.DEFAULT_CORE;
const mod = require(path.join(CORE, 'moderation'));
const allowance = require(path.join(CORE, 'allowance'));
const { createMockServer } = require(path.join(CORE, '..', 'js', 'mock-server'));

const T0 = Date.UTC(2026, 10, 3, 4, 0, 0); // 2026-11-03 12:00 BJT
const MIN = 60e3;
const clone = (o) => JSON.parse(JSON.stringify(o));
const PREFIX = 'chuanhua_';
let rollSeq = 0;
const dateKeyOf = (ms) => new Date(ms + 8 * 3600e3).toISOString().slice(0, 10).replace(/-/g, '');

// ---------------------------------------------------------------------------------------------------------------------
function mockDriver(opts) {
  opts = opts || {};
  let t = T0;
  const srv = createMockServer({
    now: () => t, seed: 5, envKind: opts.envKind || 'dev', moderationMode: opts.mode || 'mock', textDailyBudget: opts.textBudget,
    appConfig: opts.imageMode === 'sync' ? null : { moderation: { imageMode: 'async', textApi: 'general' } }, // the v1 scenarios run the dormant async pipeline (6.10)
  });
  const legacy = opts.imageMode !== 'sync';
  const d = {
    name: 'mock-server',
    srv,
    get t() { return t; },
    set t(v) { t = v; },
    alerts: srv.alerts,
    async call(fn, data, openid) {
      if (fn === 'createChain' && data && typeof data.promptId === 'string' && data.rollId === undefined) {
        // a preset prompt must come from the caller's current server roll (F-2): the v1 scenarios get one seeded
        const who = openid || srv.user;
        const p = srv.db.players[who] || allowance.newPlayer(who, t);
        p.roll = { rollId: 'rtest' + String(++rollSeq).padStart(6, '0'), ctx: 'chain', ids: [data.promptId], rerolls: 0, shownIds: [data.promptId], used: false, at: t };
        srv.db.players[who] = p;
        data = Object.assign({}, data, { rollId: p.roll.rollId });
      }
      return clone(srv.call(fn, fn === 'joinGroup' && data && typeof data.groupData === 'string' ? { cloudID: cid(data.groupData) } : data, openid));
    },
    async sweepNow() { return clone(srv.server.modSweeper()); },
    async push(traceId, suggest) { return clone(srv.server.onMediaCheck({ trace_id: traceId, suggest })); },
    async join(openid, g) { const r = srv.call('joinGroup', { cloudID: cid(g) }, openid); return r.groupRef; },
    setConfig(doc) { srv.appConfig = legacy && !(doc && doc.moderation) ? Object.assign({}, doc, { moderation: { imageMode: 'async', textApi: 'general' } }) : doc; },
    chain: (id) => srv.db.chains[id] || null,
    step: (id) => srv.db.steps[id] || null,
    player: (u) => srv.db.players[u] || null,
    patchChain(id, fn) { fn(srv.db.chains[id]); },
    patchPlayer(u, fn) { fn(srv.db.players[u]); },
    patchStep(id, fn) { fn(srv.db.steps[id]); },
    room: (id) => srv.db.rooms[id] || null,
    rooms: () => Object.values(srv.db.rooms),
    signals: () => Object.values(srv.db.signals),
    patchRoom(id, fn) { fn(srv.db.rooms[id]); },
    async roomSweepNow() { return clone(srv.server.roomSweeper()); },
    plat: { fail: false },
    chains: () => Object.values(srv.db.chains),
    steps: () => Object.values(srv.db.steps),
    reports: () => Object.values(srv.db.reports),
    modLog: () => srv.db.modLog,
    events: () => srv.db.events,
    subGrants: () => Object.values(srv.db.subGrants),
    sent: () => srv.sent.map((s) => ({ chainId: s.chainId, to: s.to })),
    trace: (id) => srv.db.traces[id] || null,
    quotaImage: () => (srv.db.quota[dateKeyOf(t)] || {}).image || 0,
    setImageUsed(n) { srv.db.quota[dateKeyOf(t)] = Object.assign(srv.db.quota[dateKeyOf(t)] || { text: 0, image: 0, errors: 0 }, { image: n }); },
    textUsed: () => (srv.db.quota[dateKeyOf(t)] || {}).text || 0,
    canFailImageCalls: true,
    failImage(b) { srv.failImageCalls = b; },
    destroy() {},
  };
  d.sweep = async (min) => { t += min * MIN; return d.sweepNow(); };
  return d;
}

// ---------------------------------------------------------------------------------------------------------------------
function cloudDriver(opts) {
  opts = opts || {};
  const moderation = opts.moderation || 'mock';
  const envKind = opts.envKind || (moderation === 'mock' ? 'dev' : 'prod');
  const mode = opts.mode || moderation;
  const env = { ENV_KIND: envKind, MODERATION_MODE: mode, MOCK_MEDIA_DELAY_SEC: '60' };
  if (opts.textBudget !== undefined) env.MOD_TEXT_DAILY_BUDGET = String(opts.textBudget);
  Object.assign(env, opts.env || {});
  const h = createHarness({ now: T0, env, imageMode: opts.imageMode });
  const alerts = [];
  const origErr = console.error;
  console.error = (...a) => {
    if (typeof a[0] === 'string' && a[0].startsWith('[ALERT]')) alerts.push(a[0]);
    else if (!opts.noisy) return; // expected failure paths log; keep the test output readable
    else origErr(...a);
  };

  // ---- the fake WeChat content-security platform (live mode) -------------------------------------------------------
  const plat = { fail: false, n: 0, traces: new Map() };
  if (mode === 'live') {
    h.handle('security.msgSecCheck', async (p) => {
      if (plat.failText) throw new Error('msgSecCheck down');
      const r = mod.mockText(p.content);
      if (r.error) throw new Error('msgSecCheck error');
      return { errCode: 0, errMsg: 'ok', result: { suggest: r.suggest, label: 100 }, detail: [] };
    });
    h.handle('security.mediaCheckAsync', async (p) => {
      if (plat.fail) throw new Error('mediaCheckAsync down');
      const id = 'plat-' + ++plat.n;
      const fileID = decodeURIComponent(String(p.mediaUrl).split('https://tmp.test/')[1].split('?')[0]);
      plat.traces.set(id, { fileID, due: Date.now() + 60e3, done: false });
      return { errCode: 0, errMsg: 'ok', trace_id: id };
    });
  }
  // the SYNC game APIs of the fake platform (spec 6.1): the text verdict follows the mock keywords; the image verdict follows the stroke count of the
  // drawing that the same player submitted last (the fake cannot read a PNG), through moderation.mockImageSync: 13 risky, 15 timeout, else pass
  const lastStrokes = new Map();
  plat.syncCalls = [];
  if (mode === 'live') {
    h.handle('wxa.game.contentSpam.msgSecCheck', async (p) => {
      plat.syncCalls.push({ api: 'text', p });
      if (plat.failText) throw new Error('msgSecCheck down');
      const r = mod.mockText(p.content);
      if (r.error) throw new Error('msgSecCheck error');
      return { errCode: 0, errMsg: 'ok', trace_id: 'gt', result: { suggest: r.suggest, label: 100 }, detail: [] };
    });
    h.handle('wxa.game.contentSpam.mediaCheckSync', async (p) => {
      plat.syncCalls.push({ api: 'image', p });
      if (plat.syncError) throw Object.assign(new Error('mediaCheckSync: errCode ' + plat.syncError), { errCode: plat.syncError });
      if (plat.fail) throw new Error('mediaCheckSync down');
      const strokes = lastStrokes.get(p.openid);
      const m = mod.mockImageSync(strokes);
      if (m.timeout) throw Object.assign(new Error('mediaCheckSync timed out'), { timeout: true });
      return { errCode: 0, errMsg: 'ok', trace_id: 'gm', result: { suggest: m.suggest, label: m.suggest === 'pass' ? 100 : 20002 }, detail: [] };
    });
  }
  async function deliverDue() {
    for (const [id, tr] of plat.traces) {
      if (tr.done || tr.due > Date.now()) continue;
      const step = h.db.all(PREFIX + 'steps').find((s) => s.fileID === tr.fileID);
      if (!step) continue;
      tr.done = true;
      const v = mod.mockImage(step.strokes);
      if (v) await h.call('onMediaCheck', { Event: 'wxa_media_check', MsgType: 'event', trace_id: id, result: { suggest: v.suggest, label: 100 } });
    }
  }

  const d = {
    name: 'functions/' + moderation,
    h,
    get t() { return h.now(); },
    set t(v) { h.setNow(v); },
    alerts,
    async call(fn, data, openid) {
      let ev = data;
      // the parity scenarios replay many calls inside one simulated minute; the mock server has no limiter, so the per-openid
      // limiter (M3) is reset before each call here and covered separately by tests/hardening.test.js
      h.db._col(PREFIX + 'rate_limits').clear();
      if ((fn === 'submitStep' || fn === 'submitRoomStep') && data && data.strokes) lastStrokes.set(openid, data.strokes);
      if (fn === 'joinGroup' && ev && typeof ev.groupData === 'string') ev = { cloudID: cid(ev.groupData) }; // test shorthand: a group name the fake platform can decrypt
      return clone(await h.call(fn, ev, { openid }));
    },
    async sweepNow() {
      if (mode === 'live') await deliverDue();
      return clone(await h.call('modSweeper', {}));
    },
    async push(traceId, suggest) {
      return h.call('onMediaCheck', { Event: 'wxa_media_check', trace_id: traceId, result: { suggest, label: 100 } });
    },
    async join(openid, g) { const r = await d.call('joinGroup', { cloudID: cid(g) }, openid); return r.groupRef; },
    setConfig(doc) {
      if (doc === null) h.db._col(PREFIX + 'app_config').delete('live');
      else h.db.put(PREFIX + 'app_config', Object.assign({ _id: 'live' }, doc)); // the harness keeps the legacy async switch on
      h.resetCaches();
    },
    chain: (id) => h.db.get(PREFIX + 'chains', id),
    step: (id) => h.db.get(PREFIX + 'steps', id),
    player: (u) => h.db.get(PREFIX + 'players', u),
    patchChain(id, fn) { const c = h.db.get(PREFIX + 'chains', id); fn(c); h.db.put(PREFIX + 'chains', c); },
    patchPlayer(u, fn) { const p = h.db.get(PREFIX + 'players', u) || allowance.newPlayer(u, h.now()); fn(p); h.db.put(PREFIX + 'players', p); },
    patchStep(id, fn) { const s = h.db.get(PREFIX + 'steps', id); fn(s); h.db.put(PREFIX + 'steps', s); },
    room: (id) => h.db.get(PREFIX + 'rooms', id),
    rooms: () => h.db.all(PREFIX + 'rooms'),
    signals: () => h.db.all(PREFIX + 'room_signals'),
    patchRoom(id, fn) { const r = h.db.get(PREFIX + 'rooms', id); fn(r); h.db.put(PREFIX + 'rooms', r); },
    async roomSweepNow() { return clone(await h.call('roomSweeper', {})); },
    chains: () => h.db.all(PREFIX + 'chains'),
    steps: () => h.db.all(PREFIX + 'steps'),
    reports: () => h.db.all(PREFIX + 'reports'),
    modLog: () => h.db.all(PREFIX + 'mod_log'),
    events: () => h.db.all(PREFIX + 'events'),
    subGrants: () => h.db.all(PREFIX + 'sub_grants'),
    sent: () => h.calls.filter((c) => c.api === 'subscribeMessage.send').map((c) => ({ chainId: String(c.params.page).split('=')[1], to: c.params.touser })),
    trace: (id) => h.db.get(PREFIX + 'mod_traces', id),
    quotaImage: () => (h.db.get(PREFIX + 'mod_quota', dateKeyOf(h.now())) || {}).image || 0,
    setImageUsed(n) {
      const k = dateKeyOf(h.now());
      const q = h.db.get(PREFIX + 'mod_quota', k) || { _id: k, text: 0, image: 0, errors: 0, calls: {} };
      q.image = n;
      h.db.put(PREFIX + 'mod_quota', q);
    },
    textUsed: () => (h.db.get(PREFIX + 'mod_quota', dateKeyOf(h.now())) || {}).text || 0,
    canFailImageCalls: mode === 'live',
    failImage(b) { plat.fail = b; },
    plat,
    destroy() {
      console.error = origErr;
      h.teardown();
    },
  };
  d.sweep = async (min) => { h.advance(min * MIN); return d.sweepNow(); };
  return d;
}

/** the three flavours every shared scenario runs against */
const FLAVORS = [
  { name: 'mock-server', make: (o) => mockDriver(o) },
  { name: 'functions + mock moderation', make: (o) => cloudDriver(Object.assign({ moderation: 'mock' }, o)) },
  { name: 'functions + live moderation (fake WeChat)', make: (o) => cloudDriver(Object.assign({ moderation: 'live' }, o)) },
];

module.exports = { mockDriver, cloudDriver, FLAVORS, T0, MIN, dateKeyOf };
