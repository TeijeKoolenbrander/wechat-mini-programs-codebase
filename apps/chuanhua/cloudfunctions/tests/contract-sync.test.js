'use strict';
// THE REV. 2 CONTRACT SUITE. Like contract.test.js, one set of scenarios runs against three implementations of CONTRACT.md:
//   1. the mock server (the executable reference)
//   2. the REAL cloud functions, MODERATION_MODE=mock / ENV_KIND=dev
//   3. the REAL cloud functions, ENV_KIND=prod / MODERATION_MODE=live, behind a fake WeChat platform that answers the SYNC game APIs
// Covered: server rolls (F-2), synchronous moderation of 慢慢传 (PO-44), forced send and markers (F-4, PO-40), live rooms (F-5): lobby, rounds, rotation,
// deadlines, leave, rematch, sweeper, reports, caps, signals. AC numbers (spec 19) are in the names.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { FLAVORS, T0 } = require('./helpers/drivers');
const sync = require('../scripts/sync-core');

const CORE = sync.DEFAULT_CORE;
const copy = require(path.join(CORE, 'copy'));
const promptsLib = require(path.join(CORE, 'prompts'));
const roomLib = require(path.join(CORE, 'room'));

const SIGNAL_KEYS = ['_openid', 'roomId', 'seq', 'state', 'round', 'kind', 'phase', 'deadline', 'serverNow', 'sent', 'active'];

async function world(F, opts) {
  const w = F.make(Object.assign({ imageMode: 'sync' }, opts));
  w.log = [];
  const call = (who) => async (name, data) => {
    const r = await w.call(name, data, who);
    w.log.push(r);
    return r;
  };
  for (const u of ['A', 'B', 'C', 'D', 'E', 'F']) {
    const id = 'openid-' + u;
    w[u] = { id, call: call(id) };
    assert.equal((await w[u].call('agreeRules', { version: 2 })).ok, true);
    w[u].ref = (await w[u].call('joinGroup', { cloudID: 'cid-3-group-1' })).groupRef;
  }
  w.Y = { id: 'openid-Y', call: call('openid-Y') };
  await w.Y.call('agreeRules', { version: 2 });
  w.Y.ref = (await w.Y.call('joinGroup', { cloudID: 'cid-3-group-2' })).groupRef;
  w.drawing = (k, h) => ({ v: 2, h: h || 1363, s: Array.from({ length: k || 3 }, (_, i) => [i % 6, 1, 100 + i * 10, 100, 20, 30, 15, -10]) });
  w.player2 = (u) => w.player('openid-' + u);

  // ---- 慢慢传 helpers (real server rolls)
  w.roll = async (u, reroll) => {
    const r = await w[u].call('rollPrompts', reroll ? { reroll: true } : {});
    assert.equal(r.ok, true, JSON.stringify(r));
    return r;
  };
  w.startChain = async (u, groupRef) => {
    const r = await w.roll(u);
    const c = await w[u].call('createChain', { rollId: r.rollId, promptId: r.prompts[0].id, groupRef: groupRef === undefined ? w[u].ref : groupRef });
    assert.equal(c.ok, true, JSON.stringify(c));
    return Object.assign({ promptText: r.prompts[0].text }, c);
  };
  w.take = (u, chainId) => w[u].call('claimStep', { chainId, groupRef: w[u].ref });
  w.sendDraw = async (u, chainId, k, extra) => {
    const c = await w.take(u, chainId);
    assert.equal(c.ok, true, JSON.stringify(c));
    return w[u].call('submitStep', Object.assign({ chainId, claimId: c.claimId, strokes: w.drawing(k || 3), auto: false, empty: false }, extra || {}));
  };
  w.sendText = async (u, chainId, text, extra) => {
    const c = await w.take(u, chainId);
    assert.equal(c.ok, true, JSON.stringify(c));
    return w[u].call('submitStep', Object.assign({ chainId, claimId: c.claimId, text: text || '一只猫在开出租车', auto: false, empty: false }, extra || {}));
  };

  // ---- room helpers
  w.view = async (id, u) => {
    const r = w.room(id);
    if (r && r.state === 'playing' && w.t < r.roundStartAt) w.t = r.roundStartAt + 1;
    return w[u].call('getRoom', { roomId: id });
  };
  w.lobby = async (names) => {
    const c = await w[names[0]].call('createRoom', { groupRef: w[names[0]].ref });
    assert.equal(c.ok, true, JSON.stringify(c));
    for (const nm of names.slice(1)) {
      const j = await w[nm].call('joinRoom', { roomId: c.roomId, groupRef: w[nm].ref });
      assert.equal(j.ok, true, nm + JSON.stringify(j));
    }
    return c.roomId;
  };
  w.game = async (names) => {
    const id = await w.lobby(names);
    const s = await w[names[0]].call('startRoom', { roomId: id });
    assert.equal(s.ok, true, JSON.stringify(s));
    return id;
  };
  w.pick = async (id, u, extra) => {
    const v = await w.view(id, u);
    assert.equal(v.round, 0, JSON.stringify(v));
    return w[u].call('submitRoomStep', Object.assign({ roomId: id, round: 0, rollId: v.assignment.roll.rollId, promptId: v.assignment.roll.prompts[0].id, auto: false, empty: false }, extra || {}));
  };
  w.pickAll = async (id, names) => {
    for (const nm of names) assert.equal((await w.pick(id, nm)).ok, true);
  };
  w.send = async (id, u, extra) => {
    const r = w.room(id);
    await w.view(id, u);
    const body = Object.assign({ roomId: id, round: r.round, auto: false, empty: false }, r.kind === 'draw' ? { strokes: w.drawing(3) } : { text: '一只猫在开出租车' }, extra || {});
    return w[u].call('submitRoomStep', body);
  };
  w.sendAll = async (id, names, extra) => {
    const out = {};
    for (const nm of names) out[nm] = await w.send(id, nm, extra);
    return out;
  };
  w.expire = (id) => {
    const r = w.room(id);
    w.t = r.deadline + r.timers.graceSec * 1000 + 1;
  };
  return w;
}

async function scenario(F, opts, fn) {
  const w = await world(F, opts);
  try {
    await fn(w);
  } finally {
    w.destroy();
  }
}

for (const F of FLAVORS) {
  describe(F.name, () => {
    const it = (name, opts, fn) => test(name, () => scenario(F, fn ? opts : undefined, fn || opts));

    // ================================================================================================================ rolls (F-2)
    it('AC 115/116/119: rollPrompts rolls 3 texts; the unused roll is handed out again; 换一批 gives 3 new ones from no earlier set; createChain takes only an id of the CURRENT roll', async (w) => {
      const r = await w.roll('A');
      assert.equal(r.prompts.length, 3);
      assert.equal(r.rerollLeft, 5);
      assert.equal(new Set(r.prompts.map((p) => p.id)).size, 3);
      for (const p of r.prompts) assert.equal(promptsLib.promptById(p.id).text, p.text);
      assert.equal(new Set(r.prompts.map((p) => promptsLib.promptById(p.id).cat)).size, 3, 'three categories');
      assert.equal((await w.roll('A')).rollId, r.rollId, 'a plain call returns the unused roll: no browsing');
      const again = await w.roll('A', true);
      assert.equal(again.rerollLeft, 4);
      assert.notEqual(again.rollId, r.rollId);
      for (const p of again.prompts) assert.ok(!r.prompts.some((q) => q.id === p.id), 'none from the first roll');
      assert.equal((await w.A.call('rollPrompts', { reroll: true, rollId: r.rollId })).code, 'BAD_REQUEST', 'a stale rollId (AC 116)');
      assert.equal((await w.roll('A')).rerollLeft, 4, 'a plain call shows the count as it is');
      assert.equal((await w.A.call('createChain', { rollId: r.rollId, promptId: r.prompts[0].id })).code, 'BAD_REQUEST', 'the first roll was replaced');
      assert.equal((await w.A.call('createChain', { rollId: again.rollId, promptId: r.prompts[0].id })).code, 'BAD_REQUEST', 'an id of another roll');
      assert.equal((await w.A.call('createChain', { rollId: 'nope', promptId: again.prompts[0].id })).code, 'BAD_REQUEST');
      assert.equal((await w.A.call('createChain', { rollId: null, promptId: again.prompts[0].id })).code, 'BAD_REQUEST', 'no rollId');
      const ok = await w.A.call('createChain', { rollId: again.rollId, promptId: again.prompts[1].id, groupRef: w.A.ref });
      assert.equal(ok.ok, true, JSON.stringify(ok));
      assert.equal(ok.claim.sourceText, again.prompts[1].text);
      assert.equal((await w.A.call('createChain', { rollId: again.rollId, promptId: again.prompts[1].id })).code, 'BAD_REQUEST', 'the roll is spent by the start');
      const fresh = await w.roll('A');
      assert.notEqual(fresh.rollId, again.rollId, 'a new start rolls anew');
      assert.equal(fresh.rerollLeft, 5, 'a new pick has its 5 again');
    });

    it('AC 117: over many rolls with rerolls a player never sees a prompt of their last 300 again (through the function)', async (w) => {
      const shown = [];
      for (let i = 0; i < 60; i++) {
        const a = await w.roll('B');
        const b = await w.roll('B', true);
        for (const p of a.prompts.concat(b.prompts)) {
          assert.ok(!shown.slice(-300).includes(p.id), 'repeat of ' + p.id);
          shown.push(p.id);
        }
        const c = await w.B.call('createChain', { rollId: b.rollId, promptId: b.prompts[0].id });
        assert.equal(c.ok, true);
        await w.B.call('releaseClaim', { chainId: c.chainId, claimId: c.claim.claimId });
        w.t += 1000;
      }
      assert.equal(shown.length, 360);
      assert.ok(w.player2('B').seenPrompts.length <= 300);
    });

    it('AC 121: getHome has no daily prompts, no launch key, no national counts', async (w) => {
      const h = await w.A.call('getHome');
      assert.equal(h.ok, true);
      for (const k of ['daily', 'launchKey', 'counts', 'countText']) assert.equal(k in h, false, k);
      assert.deepEqual(h.features.liveRooms, true);
      assert.deepEqual([h.me.roomsLeft, h.me.joinsLeft, h.me.turnsLeft], [10, 30, 80]);
      assert.equal(h.group, undefined);
      const g = await w.A.call('getHome', { groupRef: w.A.ref });
      assert.deepEqual(g.group, { openRoom: null, waitingChains: 0 });
    });

    // ================================================================================================================ sync chain (PO-44)
    it('AC 152/153: 慢慢传 drawings are checked synchronously: a pass is delivered in the same call (no pending), the chain reveals on the 6th', async (w) => {
      const c = await w.startChain('A');
      const s1 = await w.A.call('submitStep', { chainId: c.chainId, claimId: c.claim.claimId, strokes: w.drawing(2), auto: false, empty: false });
      assert.deepEqual([s1.state, s1.chainState, s1.revealed], ['passed', 'open', false], JSON.stringify(s1));
      assert.equal((await w.A.call('getHome')).me.startsLeft, 2);
      assert.equal((await w.sendText('B', c.chainId, '一个大饼在天上')).state, 'passed');
      assert.equal((await w.sendDraw('A', c.chainId)).state, 'passed');
      assert.equal((await w.sendText('B', c.chainId, '外星人在吃披萨')).state, 'passed');
      assert.equal((await w.sendDraw('A', c.chainId)).state, 'passed');
      const last = await w.sendText('B', c.chainId, '企鹅在沙漠晒太阳');
      assert.deepEqual([last.state, last.chainState, last.revealed], ['passed', 'revealed', true]);
      const rv = await w.A.call('getReveal', { chainId: c.chainId });
      assert.equal(rv.mode, 'chain');
      assert.equal(rv.prompt.text, c.promptText);
      assert.deepEqual(rv.steps.map((s) => s.kind), ['draw', 'describe', 'draw', 'describe', 'draw', 'describe']);
      assert.equal(rv.steps[0].strokes.v, 2);
      assert.equal(w.steps().filter((s) => s.state === 'pending').length, 0, 'nothing is ever pending in sync mode');
      assert.equal((await w.A.call('getHome')).me.turnsLeft, 77, 'three of A\'s turns counted');
      if (w.plat && w.plat.syncCalls && w.name.includes('live')) {
        const imgs = w.plat.syncCalls.filter((x) => x.api === 'image');
        assert.equal(imgs.length, 3);
        assert.deepEqual([imgs[0].p.version, imgs[0].p.scene, imgs[0].p.media_type, imgs[0].p.openid], [2, 3, 2, 'openid-A']);
        assert.match(imgs[0].p.media_url, /^https:\/\/tmp\.test\//);
        assert.ok(w.plat.syncCalls.filter((x) => x.api === 'text').every((x) => x.p.version === 2 && x.p.scene === 3));
      }
    });

    it('AC 37/38/39/153/133: sync verdicts in 慢慢传: risky blocks + strike and the author keeps the claim; timeout/error is MODERATION_BUSY and stores nothing; resend works', async (w) => {
      const c = await w.startChain('A');
      const claim = c.claim;
      const blocked = await w.A.call('submitStep', { chainId: c.chainId, claimId: claim.claimId, strokes: w.drawing(13), auto: false, empty: false });
      assert.equal(blocked.code, 'IMAGE_BLOCKED', JSON.stringify(blocked));
      assert.equal(w.player2('A').strikes.length, 1);
      assert.equal(w.steps().filter((s) => s.chainId === c.chainId && s.state === 'passed').length, 0);
      const busy = await w.A.call('submitStep', { chainId: c.chainId, claimId: claim.claimId, strokes: w.drawing(15), auto: false, empty: false });
      assert.equal(busy.code, 'MODERATION_BUSY');
      assert.equal(w.player2('A').strikes.length, 1, 'a timeout is no strike');
      assert.equal(w.chain(c.chainId).claim.claimId, claim.claimId, 'the claim is kept');
      assert.equal((await w.A.call('getHome')).me.startsLeft, 3, 'nothing consumed');
      const fixed = await w.A.call('submitStep', { chainId: c.chainId, claimId: claim.claimId, strokes: w.drawing(4), auto: false, empty: false });
      assert.equal(fixed.state, 'passed');
      // text: risky blocks with a strike; the game API has no `review` (an unknown verdict = busy); 测试繁忙 = busy
      const k = await w.take('B', c.chainId);
      assert.equal((await w.B.call('submitStep', { chainId: c.chainId, claimId: k.claimId, text: '测试违规', auto: false, empty: false })).code, 'TEXT_BLOCKED');
      assert.equal(w.player2('B').strikes.length, 1);
      assert.equal((await w.B.call('submitStep', { chainId: c.chainId, claimId: k.claimId, text: '测试复审', auto: false, empty: false })).code, 'MODERATION_BUSY');
      assert.equal((await w.B.call('submitStep', { chainId: c.chainId, claimId: k.claimId, text: '测试繁忙', auto: false, empty: false })).code, 'MODERATION_BUSY');
      assert.equal((await w.B.call('submitStep', { chainId: c.chainId, claimId: k.claimId, text: '加我微信123456', auto: false, empty: false })).code, 'TEXT_REJECTED');
      assert.equal(w.player2('B').strikes.length, 1);
      assert.equal((await w.B.call('submitStep', { chainId: c.chainId, claimId: k.claimId, text: '一只猫在开出租车', auto: false, empty: false })).state, 'passed');
      const blockedLog = w.modLog().filter((m) => m.suggest === 'risky');
      assert.ok(blockedLog.length >= 2, 'blocked texts and images are logged for the admin');
    });

    // ================================================================================================================ forced send (F-4)
    it('AC 128-134 (慢慢传): an empty forced send is a marker that passes the 棒 on; the next player sees it with the free-play line; markers are not turns, not streak, not reportable', async (w) => {
      const c = await w.startChain('A');
      const m = await w.A.call('submitStep', { chainId: c.chainId, claimId: c.claim.claimId, auto: true, empty: true });
      assert.deepEqual([m.ok, m.state, m.marker, m.chainState], [true, 'marker', 'emptyDraw', 'open'], JSON.stringify(m));
      const home = await w.A.call('getHome');
      assert.equal(home.me.startsLeft, 2, 'the start counts even for a marker (3.2)');
      assert.equal(home.me.turnsLeft, 80, 'a marker is no turn');
      assert.equal(home.me.streak, 0, 'a marker does not count for the streak');
      const ch = w.chain(c.chainId);
      assert.deepEqual([ch.passed, ch.nextStep, ch.perPersonCount['openid-A']], [1, 2, 1]);
      const k = await w.take('B', c.chainId);
      assert.deepEqual([k.prev.kind, k.prev.marker, k.prev.text, k.prev.canReport], ['marker', 'emptyDraw', copy.MARKERS.emptyDraw.text, false]);
      assert.equal(k.prev.hint, copy.MARKERS.emptyDraw.hint.describe);
      // B runs out of time with one character: emptyText
      const m2 = await w.B.call('submitStep', { chainId: c.chainId, claimId: k.claimId, text: '猫', auto: true, empty: false });
      assert.deepEqual([m2.state, m2.marker], ['marker', 'emptyText']);
      const k3 = await w.take('A', c.chainId);
      assert.deepEqual([k3.prev.kind, k3.prev.marker], ['marker', 'emptyText']);
      assert.equal(k3.prev.hint, copy.MARKERS.emptyText.hint.draw);
      assert.equal((await w.A.call('submitStep', { chainId: c.chainId, claimId: k3.claimId, strokes: w.drawing(2), auto: false, empty: false })).state, 'passed', 'the chain continues normally');
      // manual sends keep their rules; `empty` only rides on a forced send
      const k4 = await w.take('B', c.chainId);
      assert.equal((await w.B.call('submitStep', { chainId: c.chainId, claimId: k4.claimId, auto: false, empty: true })).code, 'BAD_REQUEST');
      assert.equal((await w.B.call('submitStep', { chainId: c.chainId, claimId: k4.claimId, text: '猫', auto: false, empty: false })).code, 'TEXT_REJECTED');
      // finish and look at the reveal: markers carry no report / 笑 / delete
      assert.equal((await w.B.call('submitStep', { chainId: c.chainId, claimId: k4.claimId, text: '外星人在吃披萨', auto: false, empty: false })).state, 'passed');
      assert.equal((await w.sendDraw('A', c.chainId)).state, 'passed');
      const last = await w.sendText('B', c.chainId, '企鹅在沙漠晒太阳');
      assert.equal(last.revealed, true);
      const rv = await w.A.call('getReveal', { chainId: c.chainId });
      assert.deepEqual(rv.steps.map((s) => s.marker || null), ['emptyDraw', 'emptyText', null, null, null, null]);
      assert.deepEqual([rv.steps[0].canReport, rv.steps[0].canLaugh, rv.steps[0].text], [false, false, '（没来得及画）']);
      assert.equal((await w.B.call('report', { chainId: c.chainId, step: 1, reason: 'porn' })).code, 'BAD_REQUEST');
      assert.equal((await w.B.call('laugh', { chainId: c.chainId, step: 1 })).code, 'BAD_REQUEST');
      assert.equal((await w.A.call('deleteMyStep', { chainId: c.chainId, step: 1 })).code, 'BAD_REQUEST');
      assert.equal((await w.A.call('deleteMyStep', { all: true })).count, 2, 'delete-all skips markers (A has 2 real drawings)');
      const t = await w.D.call('getReveal', { chainId: c.chainId });
      assert.equal(t.teaser.finalText, '企鹅在沙漠晒太阳');
    });

    it('AC 132 (慢慢传): a forced send that is blocked / rejected / busy releases the claim and REOPENS the 棒; the author sees a blocked 棒; no strike for busy', async (w) => {
      const c = await w.startChain('A');
      await w.A.call('submitStep', { chainId: c.chainId, claimId: c.claim.claimId, strokes: w.drawing(2), auto: false, empty: false });
      const k2 = await w.take('B', c.chainId);
      const bad = await w.B.call('submitStep', { chainId: c.chainId, claimId: k2.claimId, text: '测试违规', auto: true, empty: false });
      assert.deepEqual([bad.ok, bad.code, bad.reopened], [false, 'TEXT_BLOCKED', true], JSON.stringify(bad));
      assert.equal(w.chain(c.chainId).claim, null);
      assert.deepEqual([w.chain(c.chainId).state, w.chain(c.chainId).nextStep, w.chain(c.chainId).passed], ['open', 2, 1]);
      assert.equal(w.player2('B').strikes.length, 1);
      const mine = await w.B.call('getMyChains', { chainId: c.chainId });
      assert.deepEqual(mine.mine.map((m) => m.modState), ['blocked']);
      assert.equal(mine.item.status, 'blocked');
      assert.equal(mine.mine[0].text, undefined, 'the blocked text is not kept');
      // someone else takes the reopened 棒; the author can take it again too
      const k2b = await w.take('C', c.chainId);
      assert.equal(k2b.ok, true);
      assert.equal((await w.C.call('submitStep', { chainId: c.chainId, claimId: k2b.claimId, text: '一个大饼在天上', auto: false, empty: false })).state, 'passed');
      // busy at a forced send also reopens (5.8 table); the drawing was not delivered
      const k3 = await w.take('A', c.chainId);
      const busy = await w.A.call('submitStep', { chainId: c.chainId, claimId: k3.claimId, strokes: w.drawing(15), auto: true, empty: false });
      assert.deepEqual([busy.code, busy.reopened], ['MODERATION_BUSY', true]);
      assert.equal(w.player2('A').strikes.length, 0);
      assert.equal(w.chain(c.chainId).nextStep, 3);
      const inv = await w.A.call('submitStep', { chainId: c.chainId, claimId: (await w.take('A', c.chainId)).claimId, strokes: { v: 2, h: 5000, s: [[0, 0, 1, 1]] }, auto: true, empty: false });
      assert.deepEqual([inv.code, inv.reopened], ['INVALID_STROKES', true]);
      assert.equal(w.chain(c.chainId).nextStep, 3);
    });

    it('AC 130 (慢慢传, start): an abandoned vs a timed-out 棒 1: a forced empty send of the starter is a started chain; a manual 放弃 is not', async (w) => {
      const c1 = await w.startChain('A');
      await w.A.call('releaseClaim', { chainId: c1.chainId, claimId: c1.claim.claimId });
      assert.equal(w.chain(c1.chainId).state, 'abandoned');
      assert.equal((await w.A.call('getHome')).me.startsLeft, 3);
      const c2 = await w.startChain('A');
      await w.A.call('submitStep', { chainId: c2.chainId, claimId: c2.claim.claimId, auto: true, empty: true });
      assert.equal((await w.A.call('getHome')).me.startsLeft, 2);
    });

    // ================================================================================================================ rooms: lobby (F-5)
    it('AC 135-137/143: lobby: host = seat 1, joins (group gate), host handover, start needs the host and 3 players, IN_OTHER_ROOM, same lobby again', async (w) => {
      const c = await w.A.call('createRoom', { groupRef: w.A.ref });
      assert.equal(c.ok, true, JSON.stringify(c));
      assert.deepEqual([c.state, c.me.seat, c.me.isHost, c.joined, c.seats.length, c.round, c.kind, c.deadline], ['lobby', 0, true, 1, 10, null, null, null]);
      assert.equal((await w.A.call('createRoom', {})).roomId, c.roomId, 'tapping 开一局 again opens the same lobby');
      const b = await w.B.call('joinRoom', { roomId: c.roomId, groupRef: w.B.ref });
      assert.deepEqual([b.ok, b.me.seat, b.joined, b.me.isHost], [true, 1, 2, false]);
      assert.equal((await w.B.call('joinRoom', { roomId: c.roomId })).me.seat, 1, 'a rejoin returns the room');
      assert.equal((await w.A.call('startRoom', { roomId: c.roomId })).code, 'NOT_ENOUGH_PLAYERS');
      assert.equal((await w.B.call('startRoom', { roomId: c.roomId })).code, 'NOT_HOST');
      assert.equal((await w.D.call('startRoom', { roomId: c.roomId })).code, 'NOT_IN_ROOM');
      const other = await w.C.call('createRoom', { groupRef: w.C.ref });
      const j = await w.A.call('joinRoom', { roomId: other.roomId, groupRef: w.A.ref });
      assert.deepEqual([j.code, j.otherRoomId], ['IN_OTHER_ROOM', c.roomId]);
      assert.equal((await w.Y.call('joinRoom', { roomId: c.roomId, groupRef: w.Y.ref })).code, 'WRONG_GROUP');
      assert.equal((await w.D.call('joinRoom', { roomId: c.roomId })).ok, true, 'a fresh member of the room group needs no groupRef');
      const home = await w.A.call('getHome');
      assert.deepEqual(home.me.activeRoom, { roomId: c.roomId, state: 'lobby', round: null, rounds: 0 });
      // host leaves: handover to the earliest-joined member, seats renumber
      await w.A.call('leaveRoom', { roomId: c.roomId });
      const vb = await w.B.call('getRoom', { roomId: c.roomId });
      assert.deepEqual([vb.me.seat, vb.me.isHost, vb.joined], [0, true, 2]);
      assert.equal((await w.A.call('getHome')).me.activeRoom, null);
      assert.equal((await w.B.call('startRoom', { roomId: c.roomId })).code, 'NOT_ENOUGH_PLAYERS');
      // an entry for a stranger of the same group: joinable
      const ent = await w.E.call('getRoom', { roomId: c.roomId, groupRef: w.E.ref });
      assert.deepEqual([ent.member, ent.entryState, ent.joined, ent.state], [false, 'joinable', 2, 'lobby']);
      const wg = await w.Y.call('getRoom', { roomId: c.roomId, groupRef: w.Y.ref });
      assert.deepEqual([wg.entryState, wg.state, wg.joined], ['wrongGroup', null, null]);
    });

    it('AC 136: an unbound room is bound by the first join from a group card; later joins need that group; no group context is NEED_GROUP', async (w) => {
      const c = await w.A.call('createRoom', {});
      assert.equal(c.ok, true);
      assert.equal(w.room(c.roomId).openGId, null);
      assert.equal(w.room(c.roomId).groupRef, null);
      assert.equal((await w.B.call('joinRoom', { roomId: c.roomId })).code, 'NEED_GROUP', 'an unbound room needs the joiner group context');
      await w.call('agreeRules', { version: 2 }, 'openid-Z');
      assert.equal((await w.call('joinRoom', { roomId: c.roomId }, 'openid-Z')).code, 'NEED_GROUP');
      const j = await w.B.call('joinRoom', { roomId: c.roomId, groupRef: w.B.ref });
      assert.equal(j.ok, true, JSON.stringify(j));
      assert.ok(w.room(c.roomId).openGId, 'bound to the joiner group');
      assert.equal((await w.Y.call('joinRoom', { roomId: c.roomId, groupRef: w.Y.ref })).code, 'WRONG_GROUP');
      assert.equal((await w.call('joinRoom', { roomId: c.roomId }, 'openid-Z')).code, 'NEED_GROUP', 'a bound room: no membership, no context');
      assert.equal((await w.C.call('joinRoom', { roomId: c.roomId })).ok, true, 'a fresh member of the room group');
    });

    it('AC 138/139/140: a full 4-player game: rounds and kinds, rotation, each player sees ONLY the previous step of their chain, the reveal is the same for all', async (w) => {
      const names = ['A', 'B', 'C', 'D'];
      const id = await w.game(names);
      const r0 = w.room(id);
      assert.deepEqual([r0.n, r0.R, r0.round, r0.kind, r0.state], [4, 3, 0, 'prompt', 'playing']);
      assert.equal(r0.deadline - r0.roundStartAt, 30000);
      // round 0
      const seen = new Set();
      for (const nm of names) {
        const v = await w.view(id, nm);
        assert.equal(v.assignment.roll.prompts.length, 3);
        for (const p of v.assignment.roll.prompts) {
          assert.ok(!seen.has(p.id), 'room-unique prompts (AC 118)');
          seen.add(p.id);
        }
        assert.equal(JSON.stringify(v).match(/openid-[A-Z]/g), null, 'no openid in getRoom');
      }
      const prompts = {};
      for (const nm of names) prompts[nm] = (await w.view(id, nm)).assignment.roll.prompts[0];
      await w.pickAll(id, names);
      let r = w.room(id);
      assert.deepEqual([r.round, r.kind], [1, 'draw']);
      assert.equal(r.deadline - r.roundStartAt, 60000);
      // round 1: seat s sees the prompt of chain (s - 1)
      for (let s = 0; s < 4; s++) {
        const v = await w.view(id, names[s]);
        assert.equal(v.assignment.source.kind, 'prompt');
        assert.equal(v.assignment.source.text, prompts[names[(s + 3) % 4]].text, 'seat ' + s + ' gets the previous seat prompt');
        assert.equal(v.assignment.chainNo, ((s - 1 + 4) % 4) + 1);
      }
      const early = await w.view(id, 'A');
      assert.equal(early.phase, 'turn');
      const sent = await w.sendAll(id, names);
      assert.deepEqual(Object.values(sent).map((x) => x.state), ['sent', 'sent', 'sent', 'sent']);
      assert.equal(sent.D.advanced, true, 'the last send ends the round early');
      r = w.room(id);
      assert.deepEqual([r.round, r.kind], [2, 'describe']);
      const v2 = await w.view(id, 'C');
      assert.equal(v2.assignment.source.kind, 'draw');
      assert.equal(v2.assignment.source.strokes.v, 2);
      // the mine of a player who has sent
      const mine = await w.send(id, 'A');
      assert.equal(mine.ok, true);
      assert.equal((await w.A.call('getRoom', { roomId: id })).mine.kind, 'describe');
      assert.equal((await w.A.call('getRoom', { roomId: id })).assignment, undefined);
      assert.equal((await w.send(id, 'A')).code, 'ALREADY_SENT');
      for (const nm of ['B', 'C', 'D']) await w.send(id, nm);
      await w.sendAll(id, names);
      r = w.room(id);
      assert.deepEqual([r.state, r.endedBy], ['reveal', 'normal']);
      const versions = new Set();
      for (const nm of names) {
        const v = await w.A.call('getRoom', { roomId: id });
        versions.add(v.version);
        assert.equal((await w[nm].call('getRoom', { roomId: id })).state, 'reveal');
      }
      assert.equal(versions.size, 1);
      const rv = await w.C.call('getRoomReveal', { roomId: id });
      assert.equal(rv.ok, true, JSON.stringify(rv));
      assert.deepEqual(rv.cards.map((c) => c.chainNo), [1, 2, 3, 4]);
      assert.deepEqual(rv.cards.map((c) => c.mineStarted), [false, false, true, false]);
      assert.ok(rv.cards.every((c) => c.finalKind === 'draw' && !c.finalText && !c.placeholder));
      assert.equal(JSON.stringify(rv).includes('strokes'), false, 'the overview carries no drawing');
      const chain = await w.C.call('getReveal', { chainId: rv.cards[2].chainId });
      assert.deepEqual([chain.ok, chain.mode, chain.chainNo, chain.chainCount, chain.mineStarted, chain.steps.length], [true, 'live', 3, 4, true, 3]);
      assert.deepEqual(chain.steps.map((s) => s.kind), ['draw', 'describe', 'draw']);
      assert.equal(chain.prompt.text, prompts.C.text);
      assert.equal(chain.steps[0].mine, false);
      assert.equal(chain.steps.filter((s) => s.mine).length, 0, 'C started this chain and works none of its rounds');
      // 笑 on a live step, a non-member gets the room teaser, the group list shows the room
      assert.equal((await w.C.call('laugh', { chainId: rv.cards[2].chainId, step: 2 })).laughs, 1);
      const t = await w.E.call('getRoomReveal', { roomId: id });
      assert.equal(t.code, 'NOT_MEMBER');
      assert.equal(t.teaser.n, 4);
      assert.equal(t.teaser.lines.length, 4);
      assert.ok(t.teaser.lines.every((l) => l.to === null || typeof l.to === 'string'));
      assert.equal(JSON.stringify(t).includes('strokes'), false);
      const gl = await w.E.call('getGroupChains', { groupRef: w.E.ref });
      assert.deepEqual(gl.revealed.map((x) => [x.kind, x.n]), [['room', 4]]);
      assert.equal(gl.stats.rooms, 1);
      const mc = await w.A.call('getMyChains', {});
      assert.deepEqual(mc.items.map((i) => [i.kind, i.status]), [['room', 'revealed']]);
      assert.equal(mc.unseenReveals, 1);
      await w.A.call('getRoomReveal', { roomId: id });
      assert.equal((await w.A.call('getMyChains', {})).unseenReveals, 0);
    });

    it('AC 142 + 131: nobody sends: at deadline + 5 s every seat gets the empty marker and the game still reaches the reveal; roomTick before that does nothing', async (w) => {
      const id = await w.game(['A', 'B', 'C']);
      await w.pickAll(id, ['A', 'B', 'C']);
      let r = w.room(id);
      assert.equal(r.round, 1);
      w.t = r.deadline + 4000;
      assert.equal((await w.A.call('roomTick', { roomId: id })).round, 1);
      w.expire(id);
      const t = await w.A.call('roomTick', { roomId: id });
      assert.equal(t.round, 2);
      assert.deepEqual(w.room(id).slots['1'].map((s) => [s.state, s.marker]), [['marker', 'emptyDraw'], ['marker', 'emptyDraw'], ['marker', 'emptyDraw']]);
      const v = await w.view(id, 'B');
      assert.deepEqual([v.assignment.source.kind, v.assignment.source.text, v.assignment.source.hint], ['marker', '（没来得及画）', copy.MARKERS.emptyDraw.hint.describe]);
      // two ticks at once advance once
      w.expire(id);
      await Promise.all([w.A.call('roomTick', { roomId: id }), w.B.call('roomTick', { roomId: id }), w.C.call('roomTick', { roomId: id })]);
      r = w.room(id);
      assert.deepEqual([r.state, r.endedBy], ['reveal', 'normal']);
      const g = await w.A.call('getReveal', { chainId: r.chainIds[0] });
      assert.deepEqual(g.steps.map((s) => s.marker), ['emptyDraw', 'emptyText']);
      assert.equal((await w.A.call('getHome')).me.turnsLeft, 79, 'only the pick counted as a turn');
    });

    it('AC 128-134 (live): a forced empty send is a marker at once; a block BEFORE time-up reopens the slot for a resend; a failed FORCED send is 「（这一棒没传过来）」 for the next player', async (w) => {
      const id = await w.game(['A', 'B', 'C']);
      await w.pickAll(id, ['A', 'B', 'C']);
      const A = await w.view(id, 'A');
      assert.equal(A.assignment.source.kind, 'prompt');
      // A: forced send with nothing -> marker, round not over
      const ma = await w.A.call('submitRoomStep', { roomId: id, round: 1, auto: true, empty: true });
      assert.deepEqual([ma.ok, ma.state, ma.marker, ma.advanced], [true, 'marker', 'emptyDraw', false], JSON.stringify(ma));
      assert.equal((await w.A.call('submitRoomStep', { roomId: id, round: 1, strokes: w.drawing(2), auto: false, empty: false })).code, 'ALREADY_SENT');
      assert.equal((await w.A.call('getRoom', { roomId: id })).mine.marker, 'emptyDraw');
      // B: blocked before time-up: the slot reopens, the work can be fixed and resent
      await w.view(id, 'B');
      const bb = await w.B.call('submitRoomStep', { roomId: id, round: 1, strokes: w.drawing(13), auto: false, empty: false });
      assert.deepEqual([bb.code, bb.slot.state], ['IMAGE_BLOCKED', 'blocked'], JSON.stringify(bb));
      assert.equal(w.player2('B').strikes.length, 1);
      assert.equal((await w.B.call('getRoom', { roomId: id })).me.slot, 'blocked');
      assert.equal((await w.B.call('submitRoomStep', { roomId: id, round: 1, strokes: w.drawing(15), auto: false, empty: false })).code, 'MODERATION_BUSY');
      assert.equal((await w.B.call('submitRoomStep', { roomId: id, round: 1, strokes: w.drawing(3), auto: false, empty: false })).state, 'sent');
      // C: the forced send fails the check -> notDelivered
      await w.view(id, 'C');
      const mc = await w.C.call('submitRoomStep', { roomId: id, round: 1, strokes: w.drawing(13), auto: true, empty: false });
      assert.deepEqual([mc.state, mc.marker, mc.failed, mc.advanced], ['marker', 'notDelivered', 'blocked', true], JSON.stringify(mc));
      assert.equal(w.player2('C').strikes.length, 1, 'a risky forced send still strikes');
      assert.equal(w.room(id).round, 2);
      // round 2 sources: seat 0 <- seat 2 (notDelivered), seat 1 <- seat 0 (emptyDraw), seat 2 <- seat 1 (a drawing)
      const v0 = await w.view(id, 'A');
      const v1 = await w.view(id, 'B');
      const v2 = await w.view(id, 'C');
      assert.deepEqual([v0.assignment.source.kind, v0.assignment.source.marker, v0.assignment.source.text], ['marker', 'notDelivered', '（这一棒没传过来）']);
      assert.equal(v0.assignment.source.hint, copy.MARKERS.notDelivered.hint.describe);
      assert.deepEqual([v1.assignment.source.kind, v1.assignment.source.marker], ['marker', 'emptyDraw']);
      assert.equal(v2.assignment.source.kind, 'draw');
      // a describe forced send with one character is the empty text marker; a rejected text is notDelivered
      const m1 = await w.A.call('submitRoomStep', { roomId: id, round: 2, text: '猫', auto: true, empty: false });
      assert.equal(m1.marker, 'emptyText');
      const m2 = await w.B.call('submitRoomStep', { roomId: id, round: 2, text: '加我微信123456', auto: true, empty: false });
      assert.deepEqual([m2.marker, m2.failed], ['notDelivered', 'blocked']);
      const m3 = await w.C.call('submitRoomStep', { roomId: id, round: 2, text: '测试违规', auto: true, empty: false });
      assert.equal(m3.marker, 'notDelivered');
      assert.equal(w.room(id).state, 'reveal');
      // the reveal: markers everywhere, no strokes for the markers, nobody learns why
      const rv = await w.A.call('getRoomReveal', { roomId: id });
      assert.deepEqual(rv.cards.map((c) => c.finalMarker), ['notDelivered', 'emptyText', 'notDelivered'], 'chain c is finished by seat (c + 2) mod 3');
      assert.deepEqual(rv.cards.map((c) => c.finalText), ['（这一棒没传过来）', '（没来得及写）', '（这一棒没传过来）']);
      const chain1 = await w.A.call('getReveal', { chainId: rv.cards[1].chainId });
      assert.ok(chain1.steps.every((s) => s.canReport === false || !s.marker));
    });

    it('AC 164/165 (慢慢传): 5 rerolls succeed (rerollLeft 4..0, a new rollId each, 18 distinct prompts in 6 sets), the 6th is REROLL_LIMIT and writes nothing; the last set can be picked', async (w) => {
      const first = await w.roll('A');
      const sets = [first.prompts.map((p) => p.id)];
      let cur = first;
      const rollIds = new Set([first.rollId]);
      for (let n = 1; n <= 5; n++) {
        const r = await w.A.call('rollPrompts', { reroll: true, rollId: cur.rollId });
        assert.equal(r.ok, true, JSON.stringify(r));
        assert.equal(r.rerollLeft, 5 - n);
        assert.ok(!rollIds.has(r.rollId), 'a new rollId each time');
        rollIds.add(r.rollId);
        assert.equal(new Set(r.prompts.map((p) => promptsLib.promptById(p.id).cat)).size, 3, 'three categories');
        for (const p of r.prompts) assert.ok(!promptsLib.promptById(p.id).retired, 'never a retired prompt');
        sets.push(r.prompts.map((p) => p.id));
        cur = r;
      }
      assert.equal(new Set(sets.flat()).size, 18, '6 sets of 3, none repeated');
      const before = JSON.stringify(w.player2('A'));
      for (const body of [{ reroll: true, rollId: cur.rollId }, { reroll: true }]) {
        const six = await w.A.call('rollPrompts', body);
        assert.deepEqual([six.ok, six.code, six.rollId, six.rerollLeft], [false, 'REROLL_LIMIT', cur.rollId, 0], JSON.stringify(six));
      }
      assert.equal(JSON.stringify(w.player2('A')), before, 'nothing written by the refused rerolls (seenPrompts, roll)');
      const plain = await w.roll('A');
      assert.deepEqual([plain.rollId, plain.rerollLeft], [cur.rollId, 0], 'reopening shows the same set and 0 left');
      const ok = await w.A.call('createChain', { rollId: cur.rollId, promptId: cur.prompts[2].id, groupRef: w.A.ref });
      assert.equal(ok.ok, true, JSON.stringify(ok));
      assert.equal(ok.claim.sourceText, cur.prompts[2].text);
    });

    it('AC 164/165/168 (live room): up to 5 rerolls per seat, room-unique, the 6th is REROLL_LIMIT with nothing written; rerolls are accepted only until the deadline (no grace); a forced send may name any shown id', async (w) => {
      const id = await w.game(['A', 'B', 'C', 'D']);
      const views = {};
      for (const nm of ['A', 'B', 'C', 'D']) views[nm] = await w.view(id, nm);
      const roomShown = new Set(Object.values(views).flatMap((v) => v.assignment.roll.prompts.map((p) => p.id)));
      assert.equal(roomShown.size, 12);
      assert.equal(views.B.assignment.roll.rerollLeft, 5);
      let cur = views.B.assignment.roll;
      const bShown = cur.prompts.map((p) => p.id);
      for (let n = 1; n <= 5; n++) {
        for (const other of ['A', 'C']) {
          const o = await w[other].call('rollPrompts', { roomId: id, reroll: true, rollId: (await w.view(id, other)).assignment.roll.rollId });
          assert.equal(o.ok, true, JSON.stringify(o));
          for (const p of o.prompts) { assert.ok(!roomShown.has(p.id), 'room-unique for the other seats too'); roomShown.add(p.id); }
        }
        const r = await w.B.call('rollPrompts', { roomId: id, reroll: true, rollId: cur.rollId });
        assert.equal(r.ok, true, JSON.stringify(r));
        assert.equal(r.rerollLeft, 5 - n);
        assert.notEqual(r.rollId, cur.rollId);
        assert.equal(new Set(r.prompts.map((p) => promptsLib.promptById(p.id).cat)).size, 3);
        for (const p of r.prompts) {
          assert.ok(!roomShown.has(p.id), 'room-unique: not shown to any seat (reroll ' + n + ')');
          roomShown.add(p.id);
          bShown.push(p.id);
        }
        cur = r;
      }
      assert.equal(new Set(bShown).size, 18);
      const rec = w.room(id).rolls[1];
      assert.deepEqual([rec.rerolls, rec.shownIds.length, rec.rollId], [5, 18, cur.rollId]);
      const before = JSON.stringify(w.room(id));
      const seenBefore = JSON.stringify(w.player2('B').seenPrompts);
      const six = await w.B.call('rollPrompts', { roomId: id, reroll: true, rollId: cur.rollId });
      assert.deepEqual([six.ok, six.code, six.rollId, six.rerollLeft], [false, 'REROLL_LIMIT', cur.rollId, 0], JSON.stringify(six));
      assert.equal(JSON.stringify(w.room(id)), before, 'the room doc is untouched');
      assert.equal(JSON.stringify(w.player2('B').seenPrompts), seenBefore);
      assert.equal((await w.view(id, 'B')).assignment.roll.rerollLeft, 0, 'getRoom shows the count after a reopen');
      // a normal pick must use the newest set; a forced send may name any id of the pick, an unknown id falls back to the first of the current set
      const old = views.B.assignment.roll;
      assert.equal((await w.B.call('submitRoomStep', { roomId: id, round: 0, rollId: old.rollId, promptId: old.prompts[0].id, auto: false, empty: false })).code, 'BAD_REQUEST', 'an old set is not a normal pick');
      const forced = await w.B.call('submitRoomStep', { roomId: id, round: 0, rollId: old.rollId, promptId: old.prompts[1].id, auto: true, empty: false });
      assert.deepEqual([forced.ok, forced.state], [true, 'sent'], JSON.stringify(forced));
      assert.equal(w.room(id).slots['0'][1].promptId, old.prompts[1].id, 'the card on screen, from a set a reroll replaced');
      const odd = await w.C.call('submitRoomStep', { roomId: id, round: 0, rollId: 'rUNKNOWN', promptId: 'Z9999', auto: true, empty: false });
      assert.equal(odd.state, 'sent');
      assert.equal(w.room(id).slots['0'][2].promptId, w.room(id).rolls[2].ids[0], 'an id outside the pick falls back to the first of the current set');
      // the deadline: exactly at it is in time, 1 ms later is ROUND_OVER (a reroll gets no grace) and changes nothing
      const dl = w.room(id).deadline;
      const dRoll = (await w.view(id, 'D')).assignment.roll;
      w.t = dl;
      const atEdge = await w.D.call('rollPrompts', { roomId: id, reroll: true, rollId: dRoll.rollId });
      assert.equal(atEdge.ok, true, JSON.stringify(atEdge));
      w.t = dl + 1;
      const snap = JSON.stringify(w.room(id).rolls[3]);
      const late = await w.D.call('rollPrompts', { roomId: id, reroll: true, rollId: atEdge.rollId });
      assert.equal(late.code, 'ROUND_OVER', JSON.stringify(late));
      assert.equal(JSON.stringify(w.room(id).rolls[3]), snap);
      assert.equal(w.room(id).deadline, dl, 'a reroll never moves the deadline');
    });

    it('AC 131: a send after deadline + 5 s is ROUND_OVER; a send exactly inside the grace is accepted; the stale round advances by tick', async (w) => {
      const id = await w.game(['A', 'B', 'C']);
      await w.pickAll(id, ['A', 'B', 'C']);
      await w.view(id, 'A');
      const r = w.room(id);
      w.t = r.deadline + 4999;
      const ok = await w.A.call('submitRoomStep', { roomId: id, round: 1, strokes: w.drawing(3), auto: true, empty: false });
      assert.deepEqual([ok.ok, ok.state], [true, 'sent'], 'inside the grace window: ' + JSON.stringify(ok));
      w.t = r.deadline + 5001;
      const late = await w.B.call('submitRoomStep', { roomId: id, round: 1, strokes: w.drawing(3), auto: true, empty: false });
      assert.equal(late.code, 'ROUND_OVER');
      assert.equal(w.room(id).round, 1, 'the late send advanced nothing: tick does');
      await w.B.call('roomTick', { roomId: id });
      assert.equal(w.room(id).round, 2);
      assert.equal((await w.B.call('submitRoomStep', { roomId: id, round: 1, strokes: w.drawing(3), auto: true, empty: false })).code, 'ROUND_OVER', 'the round is over');
      assert.equal((await w.B.call('submitRoomStep', { roomId: id, round: 3, strokes: w.drawing(3), auto: true, empty: false })).code, 'BAD_REQUEST', 'a future round');
      assert.equal((await w.D.call('submitRoomStep', { roomId: id, round: 2, text: '一只猫在开出租车', auto: false, empty: false })).code, 'NOT_IN_ROOM');
    });

    it('AC 120/119/116: round 0: a forced send with an unsent / blocked custom text uses the selected rolled prompt (the first if none); a custom text that passes stands; reroll in a room', async (w) => {
      const id = await w.game(['A', 'B', 'C', 'D']);
      const va = await w.view(id, 'A');
      const vb = await w.view(id, 'B');
      const vc = await w.view(id, 'C');
      const vd = await w.view(id, 'D');
      // A: a blocked custom text at a forced send + the selected prompt (index 2)
      const a = await w.A.call('submitRoomStep', { roomId: id, round: 0, customText: '测试违规', rollId: va.assignment.roll.rollId, promptId: va.assignment.roll.prompts[2].id, auto: true, empty: false });
      assert.deepEqual([a.ok, a.state], [true, 'sent'], JSON.stringify(a));
      assert.equal(w.room(id).slots['0'][0].promptId, va.assignment.roll.prompts[2].id);
      assert.equal(w.player2('A').strikes.length, 1);
      // B: nothing at all at a forced send: the first rolled prompt
      const b = await w.B.call('submitRoomStep', { roomId: id, round: 0, auto: true, empty: true });
      assert.equal(b.state, 'sent');
      assert.equal(w.room(id).slots['0'][1].promptId, vb.assignment.roll.prompts[0].id);
      // C: a custom prompt that passes stands
      const c = await w.C.call('submitRoomStep', { roomId: id, round: 0, customText: '会飞的西瓜', auto: false, empty: false });
      assert.equal(c.state, 'sent', JSON.stringify(c));
      assert.deepEqual([w.room(id).slots['0'][2].custom, w.room(id).slots['0'][2].text], [true, '会飞的西瓜']);
      // D: strict input: an id of another roll, both fields, neither
      const bad = (extra) => w.D.call('submitRoomStep', Object.assign({ roomId: id, round: 0, auto: false, empty: false }, extra));
      assert.equal((await bad({ rollId: vd.assignment.roll.rollId, promptId: va.assignment.roll.prompts[0].id })).code, 'BAD_REQUEST');
      assert.equal((await bad({ rollId: 'rWRONG', promptId: vd.assignment.roll.prompts[0].id })).code, 'BAD_REQUEST');
      assert.equal((await bad({ rollId: vd.assignment.roll.rollId, promptId: vd.assignment.roll.prompts[0].id, customText: '会飞的西瓜' })).code, 'BAD_REQUEST');
      assert.equal((await bad({})).code, 'BAD_REQUEST');
      assert.equal((await bad({ customText: '测试繁忙' })).code, 'MODERATION_BUSY');
      assert.equal((await bad({ customText: '加我微信123456' })).code, 'TEXT_REJECTED');
      assert.equal(w.room(id).slots['0'][3].state, 'blocked');
      // reroll in the room: once, disjoint from the whole room, then the pick must use the NEW roll
      const rr = await w.D.call('rollPrompts', { roomId: id, reroll: true });
      assert.equal(rr.ok, true, JSON.stringify(rr));
      assert.equal(rr.rerollLeft, 4);
      const shown = new Set([va, vb, vc, vd].flatMap((v) => v.assignment.roll.prompts.map((p) => p.id)));
      for (const p of rr.prompts) assert.ok(!shown.has(p.id), 'room-unique even for a reroll');
      assert.equal((await w.D.call('rollPrompts', { roomId: id, reroll: true, rollId: vd.assignment.roll.rollId })).code, 'BAD_REQUEST', 'a stale rollId');
      assert.equal((await bad({ rollId: vd.assignment.roll.rollId, promptId: vd.assignment.roll.prompts[0].id })).code, 'BAD_REQUEST', 'the old roll is gone');
      const ok = await bad({ rollId: rr.rollId, promptId: rr.prompts[1].id });
      assert.equal(ok.advanced, true);
      assert.equal(w.room(id).round, 1);
      assert.equal((await w.E.call('rollPrompts', { roomId: id, reroll: true })).code, 'NOT_IN_ROOM');
      // the chains got their prompts
      assert.deepEqual(w.chains().filter((x) => x.mode === 'live').map((x) => x.promptText).sort(), [va.assignment.roll.prompts[2].text, vb.assignment.roll.prompts[0].text, '会飞的西瓜', rr.prompts[1].text].sort());
    });

    it('AC 142: leaving mid-game: the seat is skipped at once, the round can end early, the leaver can still open the reveal; everybody gone finishes the game', async (w) => {
      const id = await w.game(['A', 'B', 'C', 'D']);
      await w.pickAll(id, ['A', 'B', 'C', 'D']);
      assert.equal((await w.C.call('leaveRoom', { roomId: id })).ok, true);
      const r = w.room(id);
      assert.equal(r.seats[2].status, 'left');
      assert.deepEqual([1, 2, 3].map((k) => r.slots[String(k)][2].marker), ['emptyDraw', 'emptyText', 'emptyDraw']);
      assert.equal((await w.C.call('getHome')).me.activeRoom, null);
      const v = await w.C.call('getRoom', { roomId: id });
      assert.equal(v.me.status, 'left');
      assert.equal((await w.C.call('leaveRoom', { roomId: id })).ok, true, 'idempotent');
      // the other three send: the round ends without waiting for C
      const sent = await w.sendAll(id, ['A', 'B', 'D']);
      assert.equal(sent.D.advanced, true);
      assert.equal(w.room(id).round, 2);
      // the left seat's chain neighbour sees the marker
      const nxt = await w.view(id, 'D'); // seat 3 <- seat 2 (C, left)
      assert.deepEqual([nxt.assignment.source.kind, nxt.assignment.source.marker], ['marker', 'emptyDraw']);
      // everybody else leaves: the game finishes into the reveal at once
      for (const u of ['A', 'B', 'D']) await w[u].call('leaveRoom', { roomId: id });
      const done = w.room(id);
      assert.deepEqual([done.state, done.endedBy], ['reveal', 'empty']);
      assert.equal((await w.C.call('getRoomReveal', { roomId: id })).ok, true, 'a leaver was seated at the start: the reveal opens');
      assert.equal((await w.C.call('getRoom', { roomId: id })).state, 'reveal');
      assert.equal((await w.E.call('getRoomReveal', { roomId: id })).code, 'NOT_MEMBER');
    });

    it('AC 144/53/154: roomSweeper: advances an unwatched round, closes an idle lobby (and gives the create back), finishes at 20 min, on the kill switch and on imageMode async', async (w) => {
      // idle lobby
      const lob = await w.A.call('createRoom', { groupRef: w.A.ref });
      await w.B.call('joinRoom', { roomId: lob.roomId, groupRef: w.B.ref });
      assert.equal(w.player2('A').day.roomsCreated, 1);
      w.t += 29 * 60e3;
      await w.roomSweepNow();
      assert.equal(w.room(lob.roomId).state, 'lobby');
      w.t += 2 * 60e3;
      await w.roomSweepNow();
      assert.equal(w.room(lob.roomId).state, 'closed');
      assert.equal(w.player2('A').day.roomsCreated, 0);
      assert.equal((await w.C.call('joinRoom', { roomId: lob.roomId, groupRef: w.C.ref })).code, 'ROOM_CLOSED');
      // an unwatched game: the sweeper advances rounds overdue by more than 10 s
      const id = await w.game(['A', 'B', 'C']);
      const r0 = w.room(id);
      w.t = r0.deadline + 5000 + 5000;
      await w.roomSweepNow();
      assert.equal(w.room(id).round, 0, 'not overdue enough yet');
      w.t = r0.deadline + 5000 + 10001;
      await w.roomSweepNow();
      assert.equal(w.room(id).round, 1);
      assert.ok(w.room(id).slots['0'].every((s) => s.promptId), 'round 0 filled with the first rolled prompts');
      // the 20 minute cap
      w.t = r0.startedAt + 20 * 60e3;
      await w.roomSweepNow();
      assert.deepEqual([w.room(id).state, w.room(id).endedBy], ['reveal', 'cap']);
      assert.equal((await w.A.call('getRoomReveal', { roomId: id })).ok, true);
      // kill switch: games in play are finished, lobbies closed, no new rooms
      const g2 = await w.game(['D', 'E', 'F']);
      const lob2 = await w.A.call('createRoom', { groupRef: w.A.ref });
      w.setConfig({ ugc: { createEnabled: false, viewEnabled: true } });
      w.t += 11e3; // the 10 s config cache
      await w.roomSweepNow();
      assert.deepEqual([w.room(g2).state, w.room(g2).endedBy], ['reveal', 'switch']);
      assert.equal(w.room(lob2.roomId).state, 'closed');
      assert.equal((await w.B.call('createRoom', { groupRef: w.B.ref })).code, 'UGC_PAUSED');
      assert.equal((await w.D.call('joinRoom', { roomId: g2 })).ok, true, 'a member can still open the finished room');
      assert.equal((await w.D.call('getRoomReveal', { roomId: g2 })).ok, true, 'viewing revealed content still works');
      // async fallback: live rooms off for everybody
      w.setConfig({ moderation: { imageMode: 'async', textApi: 'general' } });
      w.t += 11e3;
      const h = await w.A.call('getHome');
      assert.equal(h.features.liveRooms, false);
      assert.equal((await w.A.call('createRoom', {})).code, 'LIVE_OFF');
      assert.equal((await w.A.call('startRoom', { roomId: lob2.roomId })).code, 'LIVE_OFF');
      assert.equal((await w.E.call('joinRoom', { roomId: lob.roomId, groupRef: w.E.ref })).code, 'LIVE_OFF');
    });

    it('AC 135/136/151: caps: 10 rooms a day, 30 joins a day, the turn cap applies at create/join but never mid-game; rematch returns ONE room', async (w) => {
      w.patchPlayer('openid-A', (p) => { p.day.roomsCreated = 10; });
      assert.equal((await w.A.call('createRoom', {})).code, 'ROOM_LIMIT');
      w.patchPlayer('openid-A', (p) => { p.day.roomsCreated = 0; p.day.steps = 80; });
      assert.equal((await w.A.call('createRoom', {})).code, 'STEP_LIMIT');
      w.patchPlayer('openid-B', (p) => { p.day.roomsJoined = 30; });
      const lob = await w.C.call('createRoom', { groupRef: w.C.ref });
      assert.equal((await w.B.call('joinRoom', { roomId: lob.roomId, groupRef: w.B.ref })).code, 'JOIN_LIMIT');
      assert.equal((await w.D.call('joinRoom', { roomId: lob.roomId, groupRef: w.D.ref })).ok, true);
      w.patchPlayer('openid-A', (p) => { p.day.steps = 0; });
      assert.equal((await w.A.call('joinRoom', { roomId: lob.roomId, groupRef: w.A.ref })).ok, true);
      await w.C.call('startRoom', { roomId: lob.roomId });
      // a player who hits the turn cap in the middle of a live game finishes that game
      w.patchPlayer('openid-A', (p) => { p.day.steps = 80; });
      await w.pickAll(lob.roomId, ['C', 'D', 'A']);
      const s = await w.send(lob.roomId, 'A');
      assert.equal(s.ok, true, 'never refused for the daily cap mid-game: ' + JSON.stringify(s));
      await w.sendAll(lob.roomId, ['C', 'D']);
      await w.sendAll(lob.roomId, ['C', 'D', 'A']);
      assert.equal(w.room(lob.roomId).state, 'reveal');
      // rematch: the first presser creates, the others join the same room, bound to the same group
      w.patchPlayer('openid-A', (p) => { p.day.steps = 0; });
      const [r1, r2, r3] = [await w.C.call('rematch', { roomId: lob.roomId }), await w.D.call('rematch', { roomId: lob.roomId }), await w.A.call('rematch', { roomId: lob.roomId })];
      assert.equal(r1.ok, true, JSON.stringify(r1));
      assert.deepEqual([r1.created, r2.created, r3.created], [true, false, false]);
      assert.equal(new Set([r1.roomId, r2.roomId, r3.roomId]).size, 1);
      assert.notEqual(r1.roomId, lob.roomId);
      assert.equal(w.room(r1.roomId).openGId, w.room(lob.roomId).openGId);
      assert.equal(w.room(r1.roomId).seats.length, 3);
      assert.equal(w.room(lob.roomId).rematchRoomId, r1.roomId);
      assert.equal((await w.C.call('getRoomReveal', { roomId: lob.roomId })).rematchRoomId, r1.roomId);
      assert.equal((await w.D.call('getRoom', { roomId: lob.roomId })).rematchRoomId, r1.roomId);
      assert.equal((await w.E.call('rematch', { roomId: lob.roomId })).code, 'NOT_IN_ROOM');
      assert.equal(w.rooms().filter((r) => r.state === 'lobby').length, 1, 'a single new room');
    });

    it('AC 58/60/61/134 (live): the seat working on a chain may report its source during the round: the step hides for everyone, the reporter keeps the turn; markers and rolled prompts cannot be reported', async (w) => {
      const id = await w.game(['A', 'B', 'C']);
      const v0 = await w.view(id, 'A');
      const vb = await w.view(id, 'B');
      // A picks a custom prompt; the worker of A's chain in round 1 is seat 1 (B)
      assert.equal((await w.A.call('submitRoomStep', { roomId: id, round: 0, customText: '会飞的西瓜', auto: false, empty: false })).state, 'sent');
      await w.B.call('submitRoomStep', { roomId: id, round: 0, rollId: vb.assignment.roll.rollId, promptId: vb.assignment.roll.prompts[0].id, auto: false, empty: false });
      await w.pick(id, 'C');
      void v0;
      const chainA = w.room(id).chainIds[0];
      const chainB = w.room(id).chainIds[1];
      const vB = await w.view(id, 'B');
      assert.deepEqual([vB.assignment.source.kind, vB.assignment.source.text, vB.assignment.source.canReport], ['prompt', '会飞的西瓜', true]);
      const vC = await w.view(id, 'C');
      assert.equal(vC.assignment.source.canReport, false, 'a rolled prompt');
      assert.equal((await w.C.call('report', { chainId: chainB, step: 0, reason: 'porn' })).code, 'BAD_REQUEST', 'a rolled prompt is not reportable');
      assert.equal((await w.C.call('report', { chainId: chainA, step: 0, reason: 'porn' })).code, 'NOT_PARTICIPANT', 'not the worker of that chain');
      assert.equal((await w.B.call('report', { chainId: chainA, step: 1, reason: 'porn' })).code, 'NOT_PARTICIPANT', 'step 1 is not the source yet');
      const rep = await w.B.call('report', { chainId: chainA, step: 0, reason: 'porn' });
      assert.deepEqual([rep.ok, rep.hidden], [true, true], JSON.stringify(rep));
      assert.equal((await w.B.call('report', { chainId: chainA, step: 0, reason: 'porn' })).code, 'DUP_REPORT');
      const after = await w.B.call('getRoom', { roomId: id });
      assert.equal(after.assignment.source.kind, 'hidden');
      assert.match(after.assignment.source.hint, /该内容已被举报隐藏/);
      assert.equal(after.me.slot, 'none', 'the reporter keeps the turn and the timer');
      assert.equal((await w.B.call('submitRoomStep', { roomId: id, round: 1, strokes: w.drawing(3), auto: false, empty: false })).state, 'sent');
      await w.send(id, 'A');
      await w.send(id, 'C');
      assert.equal(w.room(id).round, 2);
      // round 2: the describe worker reports the drawing they were handed (A <- C)
      const vA = await w.view(id, 'A');
      assert.equal(vA.assignment.source.kind, 'draw');
      const stepOfC = w.room(id).slots['1'][2].stepId;
      assert.equal(w.step(stepOfC).state, 'passed');
      const chainOfC = w.room(id).chainIds[roomLib.chainOfSeat(2, 1, 3)];
      const rep2 = await w.A.call('report', { chainId: chainOfC, step: 1, reason: 'abuse' });
      assert.equal(rep2.ok, true, JSON.stringify(rep2));
      assert.equal(w.step(stepOfC).state, 'hidden');
      assert.equal((await w.A.call('getRoom', { roomId: id })).assignment.source.kind, 'hidden');
      assert.equal((await w.C.call('report', { chainId: chainOfC, step: 1, reason: 'abuse' })).ok, false, 'C is not the worker who holds that source');
      // deleting a step of a room still playing is not offered
      assert.equal((await w.B.call('deleteMyStep', { all: true })).count, 0);
      await w.sendAll(id, ['A', 'B', 'C']);
      assert.equal(w.room(id).state, 'reveal');
      // the reveal: the hidden prompt chain is a placeholder on the overview
      const rv = await w.B.call('getRoomReveal', { roomId: id });
      assert.equal(rv.cards[0].placeholder, 'reported');
      const g = await w.B.call('getReveal', { chainId: chainOfC });
      assert.equal(g.steps[0].placeholder, 'reported');
      assert.ok((await w.B.call('deleteMyStep', { all: true })).count >= 1, 'after the reveal deletion works');
    });

    it('AC 146/73: room_signals hold only the allowed fields, one per seat, with a monotonic seq equal to the room version; markers and deletion never leak content', async (w) => {
      const names = ['A', 'B', 'C'];
      const id = await w.game(names);
      const check = () => {
        const sigs = w.signals().filter((s) => s.roomId === id);
        const room = w.room(id);
        assert.equal(sigs.length, room.seats.length);
        for (const s of sigs) {
          const keys = Object.keys(s).filter((k) => k !== '_id').sort();
          const allowed = SIGNAL_KEYS.concat(s.rematchRoomId ? ['rematchRoomId'] : []).sort();
          assert.deepEqual(keys, allowed);
          assert.ok(/^openid-[A-F]$/.test(s._openid));
          assert.equal(s.seq, room.version);
          assert.equal(s.roomId, id);
        }
        assert.deepEqual(sigs.map((s) => s._openid).sort(), room.seats.map((x) => x.openid).sort());
        return sigs;
      };
      let sigs = check();
      assert.ok(sigs.every((s) => s.state === 'playing' && s.round === 0 && s.kind === 'prompt'));
      await w.pickAll(id, names);
      sigs = check();
      assert.ok(sigs.every((s) => s.round === 1 && s.kind === 'draw'));
      const seq1 = sigs[0].seq;
      await w.send(id, 'A');
      sigs = check();
      assert.ok(sigs[0].seq > seq1);
      assert.equal(sigs.find((s) => s._openid === 'openid-A').sent, 1);
      assert.equal(sigs[0].active, 3);
      w.expire(id);
      await w.A.call('roomTick', { roomId: id });
      await w.A.call('leaveRoom', { roomId: id });
      sigs = check();
      assert.equal(sigs[0].active, 2);
      const text = JSON.stringify(w.signals());
      assert.doesNotMatch(text, /strokes|promptText|text":/, 'a signal carries no content');
      // signals disappear one day after the end (roomSweeper)
      w.expire(id);
      await w.B.call('roomTick', { roomId: id });
      assert.equal(w.room(id).state, 'reveal');
      w.t += 25 * 3600e3;
      await w.roomSweepNow();
      assert.equal(w.signals().filter((s) => s.roomId === id).length, 0);
      assert.equal((await w.A.call('getRoomReveal', { roomId: id })).ok, true, 'the content stays 180 days');
    });

    it('AC 53/163: policy gates on rooms: RULES_REQUIRED, RESTRICTED (a game in progress finishes), UGC_PAUSED, SERVER_CONFIG in prod+mock is in the hardening suite', async (w) => {
      assert.equal((await w.call('createRoom', {}, 'openid-newbie')).code, 'RULES_REQUIRED');
      const id = await w.lobby(['A', 'B', 'C']);
      w.patchPlayer('openid-D', (p) => { p.restrictedUntil = w.t + 86400e3; p.restrictedAt = w.t - 1; });
      assert.equal((await w.D.call('joinRoom', { roomId: id, groupRef: w.D.ref })).code, 'RESTRICTED');
      assert.equal((await w.D.call('createRoom', {})).code, 'RESTRICTED');
      await w.A.call('startRoom', { roomId: id });
      // a restriction that starts during a game takes effect after it
      w.patchPlayer('openid-B', (p) => { p.restrictedUntil = w.t + 86400e3; p.restrictedAt = w.t; });
      await w.pickAll(id, ['A', 'B', 'C']);
      assert.equal((await w.send(id, 'B')).ok, true, 'B finishes the game');
      assert.equal((await w.B.call('createRoom', {})).code, 'RESTRICTED');
      assert.equal((await w.B.call('getRoom', { roomId: id })).state, 'playing', 'but may still look at the room');
    });
  });
}

test('the rev. 2 suite covered every room / roll function of CONTRACT.md', () => {
  const schema = require(path.join(CORE, 'schema'));
  for (const f of ['rollPrompts', 'createRoom', 'joinRoom', 'leaveRoom', 'startRoom', 'getRoom', 'submitRoomStep', 'roomTick', 'getRoomReveal', 'rematch', 'roomSweeper']) assert.ok(schema.FUNCTIONS[f], f);
  assert.ok(T0 > 0);
});
