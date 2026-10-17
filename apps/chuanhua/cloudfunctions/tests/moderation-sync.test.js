'use strict';
// The SYNCHRONOUS moderation path in the production configuration (ENV_KIND=prod, MODERATION_MODE=live) against a programmable fake of the WeChat platform
// (spec 6.1-6.9, AC 37-41, 51-56, 152-155): exact parameters, every failure mode FAILS CLOSED, the 5 s timeout, error 750031 switches imageMode to
// 'async' and fires an alert, 750032/750033 are plain busy, the quota guard, the dev budgets, the breaker, the text API switch.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { roomWorld, drawing } = require('./helpers/roomworld');
const sync = require('../scripts/sync-core');

const CORE = sync.DEFAULT_CORE;
const mod = require(path.join(CORE, 'moderation'));
const P = 'chuanhua_';
const PROD = { ENV_KIND: 'prod', MODERATION_MODE: 'live' };

async function live(o, fn) {
  const w = await roomWorld(Object.assign({ n: 4, env: PROD }, o));
  const plat = { calls: [], img: null, txt: null };
  w.plat = plat;
  // the fake: text follows the mock keywords, the image follows the stroke count of the player's last drawing (13 risky, 15 timeout, else pass)
  const last = new Map();
  const origCall = w.call;
  w.call = async (fn2, data, who) => {
    if ((fn2 === 'submitStep' || fn2 === 'submitRoomStep') && data && data.strokes) last.set('openid-' + who, data.strokes);
    return origCall(fn2, data, who);
  };
  for (const name of w.names) w.u[name].call = (fn2, data) => w.call(fn2, data, name);
  w.h.handle('wxa.game.contentSpam.msgSecCheck', async (p) => {
    plat.calls.push({ api: 'text', p });
    if (plat.txt) return plat.txt(p);
    const r = mod.mockText(p.content);
    if (r.error) throw new Error('boom');
    return { errCode: 0, errMsg: 'ok', trace_id: 't', result: { suggest: r.suggest, label: 100 }, detail: [] };
  });
  w.h.handle('wxa.game.contentSpam.mediaCheckSync', async (p) => {
    plat.calls.push({ api: 'image', p });
    if (plat.img) return plat.img(p);
    const m = mod.mockImageSync(last.get(p.openid));
    if (m.timeout) throw Object.assign(new Error('timeout'), { timeout: true });
    return { errCode: 0, errMsg: 'ok', trace_id: 'm', result: { suggest: m.suggest, label: m.suggest === 'pass' ? 100 : 20002 }, detail: [] };
  });
  try {
    await fn(w, plat);
  } finally {
    w.teardown();
  }
}

/** a room in round 1 (draw) with everybody's pick done */
async function inDrawRound(w, names) {
  const id = await w.game(names || ['A', 'B', 'C']);
  await w.pickAll(id, names || ['A', 'B', 'C']);
  await w.view(id, 'A');
  return id;
}
const sendDraw = (w, id, u, strokes, auto) => w.u[u].call('submitRoomStep', { roomId: id, round: 1, strokes, auto: !!auto, empty: false });

test('AC 152: every drawing is rasterised and checked with mediaCheckSync: version 2, scene 3, media_type 2, the author openid, a temp URL; the PNG has the right size', async () => {
  await live({}, async (w, plat) => {
    const id = await inDrawRound(w);
    const r = await sendDraw(w, id, 'A', drawing(3, 1363));
    assert.equal(r.state, 'sent');
    const img = plat.calls.filter((c) => c.api === 'image');
    assert.equal(img.length, 1);
    const p = img[0].p;
    assert.deepEqual([p.version, p.scene, p.media_type, p.openid], [2, 3, 2, 'openid-A']);
    assert.equal(p.mediaType, 2);
    assert.equal(p.mediaUrl, p.media_url, 'both spellings are sent [V3]');
    assert.match(p.media_url, /^https:\/\/tmp\.test\/.+maxAge=600$/, 'a 600 s temp URL');
    const fileID = decodeURIComponent(p.media_url.split('https://tmp.test/')[1].split('?')[0]);
    assert.match(fileID, /chuanhua\/mod\/\d{6}\/[A-Z2-7]{10}\/1_1\.png$/);
    const { decodePng } = require('../common/png');
    const png = decodePng(w.h.files.get(fileID));
    assert.deepEqual([png.width, png.height], [512, 682], '512 x round(512 * 1363 / 1024)');
    const step = w.h.db.all(P + 'steps').find((s) => s.kind === 'draw');
    assert.deepEqual([step.state, step.fileID, step.mod.api, step.strokes.h], ['passed', fileID, 'game', 1363]);
    // text: the game API with the author openid, scene 3, version 2
    const txt = plat.calls.filter((c) => c.api === 'text');
    assert.ok(txt.every((c) => c.p.version === 2 && c.p.scene === 3));
    // every sync check leaves a trace record so the PNG can be deleted after 180 days, and a mod_log entry
    assert.equal(w.h.db.all(P + 'mod_traces').filter((t) => t.sync && t.fileID === fileID).length, 1);
    assert.ok(w.h.db.all(P + 'mod_log').some((m) => m.kind === 'image' && m.fileID === fileID && m.suggest === 'pass'));
    const ev = w.h.db.all(P + 'events').filter((e) => e.name === 'mod_verdict' && e.props.kind === 'image');
    assert.deepEqual([ev.length, ev[0].props.api, ev[0].props.suggest, typeof ev[0].props.latencyMs], [1, 'game', 'pass', 'number']);
  });
});

test('AC 153: risky blocks + one strike; error, timeout, 750032, 750033, an unknown verdict and `review` are MODERATION_BUSY; nothing is stored or shown in any non-pass case', async () => {
  await live({ n: 4 }, async (w, plat) => {
    const id = await inDrawRound(w);
    const base = w.h.db.all(P + 'steps').length;
    const ok = async (strokes) => sendDraw(w, id, 'A', strokes);
    assert.equal((await ok(drawing(13))).code, 'IMAGE_BLOCKED');
    assert.equal(w.player('A').strikes.length, 1);
    for (const behave of [
      () => { throw new Error('network'); },
      () => { throw Object.assign(new Error('timeout'), { timeout: true }); },
      () => { throw Object.assign(new Error('errCode 750032'), { errCode: 750032 }); },
      () => { throw Object.assign(new Error('errCode 750033'), { errCode: 750033 }); },
      () => ({ errCode: 40001, errMsg: 'access_token invalid' }),
      () => ({ errCode: 0, result: { suggest: 'maybe', label: 1 } }),
      () => ({ errCode: 0, result: { suggest: 'review', label: 1 } }),
      () => ({ errCode: 0 }),
      () => null,
    ]) {
      plat.img = async () => behave();
      const r = await ok(drawing(3));
      assert.equal(r.code, 'MODERATION_BUSY', JSON.stringify(r));
      assert.equal(w.player('A').strikes.length, 1, 'a busy answer is no strike');
      assert.equal(w.room(id).slots['1'][0].state, 'blocked', 'the slot reopens: nothing was delivered');
    }
    assert.equal(w.h.db.all(P + 'steps').length, base, 'no step document for a blocked or busy drawing');
    // 750032 / 750033 never switch the mode
    assert.equal(((w.h.db.get(P + 'app_config', 'live') || {}).moderation || {}).imageMode === 'async', false);
    plat.img = null;
    assert.equal((await ok(drawing(3))).state, 'sent', 'a resend after the failure works');
    assert.equal(w.h.db.all(P + 'steps').length, base + 1);
    // the evidence of the blocked drawing is kept for the admin, never returned to a client
    assert.ok(w.h.db.all(P + 'mod_log').some((m) => m.kind === 'image' && m.suggest === 'risky'));
    assert.doesNotMatch(JSON.stringify(w.log), /mod_log|fileID|tmp\.test/);
  });
});

test('AC 153: a forced send with a failing check becomes the marker 「（这一棒没传过来）」; the late verdict is logged; nothing unchecked is delivered', async () => {
  await live({ n: 4 }, async (w, plat) => {
    const id = await inDrawRound(w);
    plat.img = async () => { throw new Error('platform down'); };
    const r = await sendDraw(w, id, 'A', drawing(3), true);
    assert.deepEqual([r.state, r.marker, r.failed], ['marker', 'notDelivered', 'busy']);
    const slot = w.room(id).slots['1'][0];
    assert.deepEqual([slot.state, slot.marker, slot.stepId], ['marker', 'notDelivered', undefined]);
    assert.equal(w.h.db.all(P + 'steps').filter((s) => s.kind === 'draw' && s.state === 'passed').length, 0);
  });
});

test('V16/6.9: error 750031 (game not supported) fails closed, switches imageMode to async, fires an [ALERT], turns live rooms off and finishes games in play', async () => {
  await live({ n: 4 }, async (w, plat) => {
    const id = await inDrawRound(w);
    plat.img = async () => { throw Object.assign(new Error('mediaCheckSync: errCode 750031 game not supported'), { errCode: 750031 }); };
    const r = await sendDraw(w, id, 'A', drawing(3));
    assert.equal(r.code, 'MODERATION_BUSY', 'the drawing is NOT delivered');
    assert.equal(w.room(id).slots['1'][0].state, 'blocked');
    const cfg = w.h.db.get(P + 'app_config', 'live');
    assert.equal(cfg.moderation.imageMode, 'async');
    assert.ok(w.alerts.some((a) => /750031/.test(a) && /async/.test(a)), 'an alert tells the founder: ' + JSON.stringify(w.alerts));
    const audit = w.h.db.all(P + 'audit_log').find((x) => x.op === 'autoAsync');
    assert.ok(audit && /system:/.test(audit.by));
    w.h.resetCaches();
    w.h.advance(11e3);
    // live rooms are off everywhere
    const home = await w.u.A.call('getHome', {});
    assert.equal(home.features.liveRooms, false);
    assert.equal((await w.u.D.call('createRoom', {})).code, 'LIVE_OFF');
    // the sweeper finishes the room in play (remaining slots become markers) and the reveal opens
    await w.h.call('roomSweeper', {});
    assert.deepEqual([w.room(id).state, w.room(id).endedBy], ['reveal', 'switch']);
    assert.equal((await w.u.A.call('getRoomReveal', { roomId: id })).ok, true);
    // 慢慢传 now uses the async pipeline: the drawing is pending, never visible
    const roll = await w.u.D.call('rollPrompts', {});
    const c = await w.u.D.call('createChain', { rollId: roll.rollId, promptId: roll.prompts[0].id, groupRef: w.u.D.ref });
    const s = await w.u.D.call('submitStep', { chainId: c.chainId, claimId: c.claim.claimId, strokes: drawing(3), auto: false, empty: false });
    assert.equal(s.state, 'pending');
    // admin can switch back
    const back = await w.h.call('admin', { op: 'setModeration', imageMode: 'sync' });
    assert.equal(back.ok, true, JSON.stringify(back));
    assert.equal(w.h.db.get(P + 'app_config', 'live').moderation.imageMode, 'sync');
    assert.ok(w.h.db.all(P + 'audit_log').some((x) => x.op === 'setModeration'));
  });
});

test('AC 153: the 5 s timeout: a platform that never answers is cut off at 5 s and fails closed (MODERATION_BUSY), the call is counted as a failure', async () => {
  await live({ n: 4 }, async (w, plat) => {
    const id = await inDrawRound(w);
    plat.img = () => new Promise(() => {}); // never resolves
    const t0 = process.hrtime.bigint();
    const r = await sendDraw(w, id, 'A', drawing(3));
    const took = Number((process.hrtime.bigint() - t0) / 1000000n);
    assert.equal(r.code, 'MODERATION_BUSY');
    assert.ok(took >= 4900 && took < 8000, 'cut off after about 5 s, took ' + took);
    const q = w.h.db.get(P + 'mod_quota', '20261103');
    assert.ok(q.errors >= 1);
    plat.img = null;
    assert.equal((await sendDraw(w, id, 'A', drawing(3))).state, 'sent');
  });
});

test('AC 37: the game msgSecCheck for every custom prompt and description; `review` is unknown on the game API (busy); the general API fallback blocks review without a strike; timeouts and errors fail closed', async () => {
  await live({ n: 4 }, async (w, plat) => {
    const id = await w.game(['A', 'B', 'C']);
    await w.view(id, 'A');
    const cust = (t) => w.u.A.call('submitRoomStep', { roomId: id, round: 0, customText: t, auto: false, empty: false });
    assert.equal((await cust('测试违规')).code, 'TEXT_BLOCKED');
    assert.equal(w.player('A').strikes.length, 1);
    assert.equal((await cust('测试复审')).code, 'MODERATION_BUSY');
    assert.equal((await cust('测试繁忙')).code, 'MODERATION_BUSY');
    plat.txt = async () => new Promise(() => {});
    const t0 = process.hrtime.bigint();
    assert.equal((await cust('会飞的西瓜')).code, 'MODERATION_BUSY');
    const took = Number((process.hrtime.bigint() - t0) / 1000000n);
    assert.ok(took >= 1900 && took < 4000, 'the game text API is cut off at 2 s, took ' + took);
    plat.txt = async () => ({ errCode: 0, result: { suggest: 'review' } });
    assert.equal((await cust('会飞的西瓜')).code, 'MODERATION_BUSY');
    assert.equal(w.player('A').strikes.length, 1);
    assert.equal(w.room(id).slots['0'][0].state, 'blocked');
    // the fallback: textApi general = security.msgSecCheck, where review blocks without a strike
    await w.h.call('admin', { op: 'setModeration', textApi: 'general' });
    w.h.advance(11e3);
    w.h.handle('security.msgSecCheck', async (p) => {
      plat.calls.push({ api: 'general', p });
      const r = mod.mockText(p.content);
      return { errCode: 0, result: { suggest: r.suggest || 'pass', label: 100 } };
    });
    assert.equal((await cust('测试复审')).code, 'TEXT_BLOCKED');
    assert.equal(w.player('A').strikes.length, 1, 'review: no strike');
    const gen = plat.calls.filter((c) => c.api === 'general');
    assert.deepEqual([gen.length, gen[0].p.version, gen[0].p.scene, gen[0].p.openid], [1, 2, 3, 'openid-A']);
    plat.txt = null;
    assert.equal((await cust('会飞的西瓜')).state, 'sent');
    assert.ok(w.h.db.all(P + 'mod_log').some((m) => m.kind === 'text' && m.textCopy === '测试违规'));
  });
});

test('AC 56: the image quota guard: alert at 70%, UGC_BUSY for new rooms and chains at 95%, drawing sends fail closed at 100% (forced: marker)', async () => {
  await live({ n: 4 }, async (w, plat) => {
    const id = await inDrawRound(w);
    const set = (n) => {
      const q = w.h.db.get(P + 'mod_quota', '20261103') || { _id: '20261103', text: 0, image: 0, errors: 0, calls: {} };
      q.image = n;
      w.h.db.put(P + 'mod_quota', q);
    };
    set(140000);
    assert.equal((await sendDraw(w, id, 'A', drawing(3))).state, 'sent');
    assert.ok(w.alerts.some((a) => /image quota >= 70%/.test(a)));
    assert.equal(plat.calls.filter((c) => c.api === 'image').length, 1, 'still checked');
    set(190000);
    assert.equal((await w.u.D.call('createRoom', {})).code, 'UGC_BUSY');
    const roll = await w.u.D.call('rollPrompts', {});
    assert.equal((await w.u.D.call('createChain', { rollId: roll.rollId, promptId: roll.prompts[0].id })).code, 'UGC_BUSY');
    assert.equal((await sendDraw(w, id, 'B', drawing(3))).state, 'sent', 'rooms already playing continue');
    set(200000);
    const calls = plat.calls.length;
    assert.equal((await sendDraw(w, id, 'C', drawing(3))).code, 'MODERATION_BUSY');
    assert.equal(plat.calls.length, calls, 'no platform call at 100%');
    const f = await sendDraw(w, id, 'C', drawing(3), true);
    assert.deepEqual([f.state, f.marker], ['marker', 'notDelivered']);
  });
});

test('AC 52: dev + live: mediaCheckSync is capped by MOD_IMAGE_DAILY_BUDGET (and text by MOD_TEXT_DAILY_BUDGET), beyond it MODERATION_BUSY without a platform call', async () => {
  await live({ n: 3, env: { ENV_KIND: 'dev', MODERATION_MODE: 'live', MOD_IMAGE_DAILY_BUDGET: '2', MOD_TEXT_DAILY_BUDGET: '3' } }, async (w, plat) => {
    const id = await w.game(['A', 'B', 'C']);
    await w.pickAll(id, ['A', 'B', 'C']); // 3 text-free picks (preset ids): no text call
    await w.view(id, 'A');
    assert.equal((await sendDraw(w, id, 'A', drawing(3))).state, 'sent');
    assert.equal((await sendDraw(w, id, 'B', drawing(3))).state, 'sent');
    const n = plat.calls.length;
    assert.equal((await sendDraw(w, id, 'C', drawing(3))).code, 'MODERATION_BUSY');
    assert.equal(plat.calls.length, n);
    assert.equal(w.h.db.get(P + 'mod_quota', '20261103').image, 2);
  });
});

test('AC 55: failures of the sync checks feed the circuit breaker: >= 50% of >= 20 calls in 5 minutes pause creation for 15 minutes with an [ALERT]', async () => {
  await live({ n: 4 }, async (w, plat) => {
    const id = await inDrawRound(w);
    plat.img = async () => { throw new Error('down'); };
    for (let i = 0; i < 24; i++) {
      w.h.advance(1000);
      await sendDraw(w, id, 'A', drawing(3));
    }
    const sw = await w.h.call('modSweeper', {});
    assert.equal(sw.ok, true, JSON.stringify(sw));
    assert.ok(w.alerts.some((a) => /circuit breaker/.test(a)), JSON.stringify(w.alerts));
    w.h.resetCaches();
    assert.equal((await w.u.D.call('createRoom', {})).code, 'UGC_PAUSED');
    assert.equal((await w.u.D.call('rollPrompts', {})).ok, true, 'rolling is not creation');
    w.h.advance(16 * 60e3);
    w.h.resetCaches();
    assert.equal((await w.u.D.call('createRoom', {})).ok, true, 'the pause ended after 15 minutes');
  });
});

test('AC 51: mock moderation in production: every UGC function incl. the room functions returns SERVER_CONFIG and logs [ALERT]', async () => {
  const w = await roomWorld({ n: 3, env: { ENV_KIND: 'prod', MODERATION_MODE: 'mock' } });
  try {
    const schema = require(path.join(CORE, 'schema'));
    for (const fn of ['rollPrompts', 'createRoom', 'joinRoom', 'leaveRoom', 'startRoom', 'getRoom', 'submitRoomStep', 'roomTick', 'getRoomReveal', 'rematch']) {
      assert.ok(schema.UGC_FUNCTIONS.includes(fn), fn);
      w.alerts.length = 0;
      const r = await w.call(fn, { roomId: 'AAAAAAAAAA', round: 0, text: 'x' }, 'A');
      assert.equal(r.code, 'SERVER_CONFIG', fn);
      assert.ok(w.alerts.length >= 1, fn + ' logs an [ALERT]');
    }
    const r2 = await w.call('roomSweeper', {}, undefined);
    assert.equal(r2.code, 'SERVER_CONFIG');
    const r3 = await w.call('submitStep', { chainId: 'AAAAAAAAAA' }, 'A');
    assert.equal(r3.code, 'SERVER_CONFIG');
    // dev mock verdicts do not exist in production: the test strings are ordinary input
    const prod = await roomWorld({ n: 3, env: PROD });
    try {
      const id = await prod.game(['A', 'B', 'C']);
      await prod.view(id, 'A');
      const pr = await prod.u.A.call('submitRoomStep', { roomId: id, round: 0, customText: '测试违规', auto: false, empty: false });
      assert.equal(pr.state, 'sent', 'production asks the real platform, which says pass (default fake): the keyword has no meaning');
    } finally {
      prod.teardown();
    }
  } finally {
    w.teardown();
  }
});

test('mock mode (dev): the stroke-count verdicts 13 risky / 15 timeout, the MOCK_SYNC_DELAY_MS latency, no platform call at all', async () => {
  const w = await roomWorld({ n: 3, env: { MOCK_SYNC_DELAY_MS: '120' } });
  try {
    const id = await w.game(['A', 'B', 'C']);
    await w.pickAll(id, ['A', 'B', 'C']);
    await w.view(id, 'A');
    const send = (u, k) => w.u[u].call('submitRoomStep', { roomId: id, round: 1, strokes: drawing(k), auto: false, empty: false });
    const t0 = process.hrtime.bigint();
    assert.equal((await send('A', 3)).state, 'sent');
    assert.ok(Number((process.hrtime.bigint() - t0) / 1000000n) >= 110, 'simulated latency');
    assert.equal((await send('B', 13)).code, 'IMAGE_BLOCKED');
    assert.equal((await send('B', 15)).code, 'MODERATION_BUSY');
    assert.equal(w.h.calls.length, 0, 'no openapi call in mock mode');
    assert.equal(w.player('B').strikes.length, 1);
  } finally {
    w.teardown();
  }
});
