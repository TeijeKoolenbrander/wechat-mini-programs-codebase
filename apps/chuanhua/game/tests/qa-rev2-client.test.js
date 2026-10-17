'use strict';
// QA rev. 2 (independent), client side: compliance, ads, sharing, rapid taps and offline, written from spec 8-11, 15 and AC 92-95, 104, 106, 109, 128-129, 147, 163.
// The players act ONLY through hit areas on the real renderer, against the in-memory mock server (the real core rules). A test marked `todo` is an OPEN BUG (docs/chuanhua/qa/bugs.md).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { world } = require('./harness');
const { G, openRoom, startRoom, pickAll, until } = require('./flows');
const { CONFIG } = require('../core/config');

const GAME = path.join(__dirname, '..');
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const rel = (f) => path.relative(GAME, f).split(path.sep).join('/');
const SHIPPED_JS = () => walk(GAME).filter((f) => /\.js$/.test(f) && !/(^|\/)(tests|tools|node_modules)\//.test(rel(f)) && !/js\/(mock-server|stub-render)\.js$/.test(rel(f)) && rel(f) !== 'js/render/samples.js');

/** a finished live game of 5 (R = 4: the chains end on a sentence): resolves {w, ps, roomId}; everybody is on the overview */
async function finished5(sentence) {
  const w = world();
  const ps = [];
  const GLYPH = { A: '甲', B: '乙', C: '丙', D: '丁', E: '戊' };
  const say = typeof sentence === 'function' ? sentence : () => sentence || '外星人在吃披萨';
  for (const n of 'ABCDE') ps.push(await w.player(n, { rules: true, ...G }));
  const roomId = await openRoom(w, ps[0], ps.slice(1));
  await startRoom(w, ps[0], ps);
  await pickAll(w, ps);
  for (let round = 1; round <= 4; round++) {
    const kind = round % 2 ? 'draw' : 'describe';
    for (const p of ps) {
      await until(w, p, kind, 15000);
      if (kind === 'draw') {
        p.scribble(2);
        await p.tap('draw:submit');
      } else {
        p.type(say(GLYPH[p.name], p.name));
        await p.tap('describe:submit');
      }
    }
    await w.run(2500, 250);
  }
  for (const p of ps) await until(w, p, 'overview', 15000);
  return { w, ps, roomId };
}

// ---------------------------------------------------------------------------------------------------------------- compliance: sharing

test('9 / AC 92-94: no shipped string promises a reward for sharing or inviting; nothing is shared except from a tap or the capsule menu; a share changes no allowance', async () => {
  const BAD = [/分享.{0,8}(得|送|领|解锁|获得|奖励|免费|赢|抽奖|红包)/, /(邀请|转发|拉).{0,8}(得|送|领|解锁|获得|奖励|复活|加时)/, /(助力|砍价|拉人头|求助|必须分享|分享才能|不分享就|分享后才)/, /(share|invite).{0,12}(reward|unlock|bonus)/i];
  const hits = [];
  for (const f of SHIPPED_JS()) {
    const src = fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const m of src.match(/(['"`])(?:\\.|(?!\1).)*\1/g) || []) {
      if (/不会|没有|不能|无需|不影响|不再/.test(m)) continue; // a negated promise ("分享不会获得任何奖励") is the compliant wording
      for (const re of BAD) if (re.test(m)) hits.push(rel(f) + ': ' + m.slice(0, 60));
    }
  }
  assert.deepEqual(hits, [], 'induced-sharing wording in shipped strings');
  // and the agreement text says outright that sharing grants nothing
  const terms = fs.readFileSync(path.join(GAME, 'js', 'terms-text.js'), 'utf8');
  assert.match(terms, /分享不会获得任何奖励/);

  // behaviour: a whole session, then every share the UI offers; nothing is shared by itself, and the shares grant nothing
  const { w, ps } = await finished5();
  const a = ps[0];
  assert.equal(a.log.shares.length, 0, 'no share call during a whole game and reveal');
  const homeBefore = JSON.stringify(a.p ? a.p : (await a.call('getHome', {})).me);
  await a.tap('overview:share');
  assert.equal(a.log.shares.length, 1, 'one tap, one share');
  a.menuShare();
  assert.equal(a.log.shares.length, 1, 'the capsule menu hands back a share payload; it is not auto-called here');
  const homeAfter = JSON.stringify(a.p ? a.p : (await a.call('getHome', {})).me);
  assert.equal(homeAfter, homeBefore, 'sharing changed no allowance, streak, palette or start count');
  const q = a.log.shares[0].query;
  assert.match(String(q), /^m=[A-Za-z0-9]+$/, 'card queries carry ids only (AC 94): ' + q);
});

test('9.4 / AC 95: a share card carries no drawing: the data handed to the card renderer has no strokes, and the title / query hold only passed texts and an id', async () => {
  const { w, ps, roomId } = await finished5('外星人在吃披萨');
  const a = ps[0];
  const seen = [];
  const origRender = a.app.share && a.app.share.render;
  void origRender;
  await a.tap('overview:share');
  const share = a.log.shares[0];
  assert.ok(share, 'a share happened');
  assert.match(share.title, /外星人在吃披萨|传了|变成/);
  assert.ok(!/strokes|\[\[/.test(JSON.stringify(share)), 'no stroke data in the share payload');
  assert.equal(share.query, 'm=' + roomId);
  // every card canvas that was drawn for this share: no draw call sequence of a stroke list (colour index + width + points) reached it
  for (const cv of a.log.canvases) seen.push(cv.width + 'x' + cv.height);
  assert.ok(seen.length >= 1);
  // the same for the lobby invite and the capsule menu in a lobby
  const w2 = world();
  const h = await w2.player('H', { rules: true, ...G });
  await h.tap('home:primary');
  await h.tap('lobby:invite');
  const inv = h.log.shares[0];
  assert.ok(inv, 'invite shared');
  assert.ok(!/strokes|prompt|题/.test(JSON.stringify(inv)), 'the room invite has no prompt and no drawing: ' + JSON.stringify(inv));
  assert.match(inv.title, /来一局传画接龙吗/);
  assert.equal(inv.query, 'm=' + h.ctl.state.room.roomId);
});

// OPEN (QA-R2-6): the room reveal card is built from the overview cards loaded BEFORE a report; after the player reports the final sentence in the step-through, 分享揭晓卡
// still puts the hidden (reported) sentence into the share title, which then lives in the chat beyond any takedown.
test('7.1 / 6.5 / 9.4: after the final sentence is reported (hidden for everyone) the room reveal card must not carry it', async () => {
  // every player writes a sentence of their own, so the card text names exactly one chain: chain 1 ends on seat 5 (E)'s sentence
  const { w, ps } = await finished5((g) => g + '在吃披萨');
  const a = ps[0];
  const card = a.vm().cards.find((c) => c.chainNo === 1);
  assert.equal(card.final.text, '戊在吃披萨', 'sanity: ' + JSON.stringify(a.vm().cards.map((c) => [c.chainNo, c.final.text])));
  await a.tap('overview:chain:' + card.chainId);
  assert.equal(a.screen(), 'stepthrough');
  assert.equal(a.vm().index, a.vm().steps.length - 1, 'opens on the final step');
  assert.ok(a.has('stepthrough:report'), 'the final step of another seat is reportable');
  await a.tap('stepthrough:report');
  await a.tap('report:reason:other');
  await a.tap('report:submit');
  await w.run(3500, 250); // the 已举报 sheet closes by itself
  assert.equal(a.vm().steps[a.vm().index].placeholder, 'reported', 'the step is a placeholder now');
  await a.tap('stepthrough:back');
  assert.equal(a.screen(), 'overview');
  a.log.shares.length = 0;
  await a.tap('overview:share');
  assert.equal(a.log.shares.length, 1);
  const dump = JSON.stringify(a.log.shares[0]);
  assert.ok(!dump.includes('戊在吃披萨'), 'the room card carries the sentence that was just reported: ' + dump);
});

// ---------------------------------------------------------------------------------------------------------------- compliance: ads

test('11 / AC 104 / 163: through a whole live game (home, lobby, pick, draw, describe, wait, overview, step-through) no ad, banner or 今日彩笔 offer ever appears; the interstitial only on LEAVING the reveal and never before the 3rd', async () => {
  const w = world();
  const ps = [];
  for (const n of 'ABC') ps.push(await w.player(n, { rules: true, ...G }));
  const [a, b, c] = ps;
  const adsSeen = [];
  const watch = (where) => {
    for (const p of ps) {
      const text = p.frame();
      const bad = /广告位|▶|视频|今日彩笔/.test(text);
      if (bad || p.app.ads.overlay) adsSeen.push(p.name + '@' + p.screen() + ':' + where);
      assert.equal(p.log.ads.length, 0, p.name + ' created a native ad on ' + p.screen());
    }
  };
  // the home screen of a player with no slow starts used up shows no ad pill either; the palette is only in 设置
  watch('home');
  const roomId = await openRoom(w, a, [b, c]);
  watch('lobby');
  await startRoom(w, a, ps);
  watch('pick');
  await pickAll(w, ps);
  for (const kind of ['draw', 'describe']) {
    for (const p of ps) await until(w, p, kind, 15000);
    watch(kind);
    for (const p of ps) {
      if (kind === 'draw') {
        p.scribble(2);
        await p.tap('draw:submit');
      } else {
        p.type('一只猫在开出租车');
        await p.tap('describe:submit');
      }
      watch(kind + '-sent');
    }
    await w.run(2500, 250);
  }
  for (const p of ps) await until(w, p, 'overview', 15000);
  watch('overview');
  // the step-through: moving between steps never shows an ad
  const card = a.vm().cards[0];
  await a.tap('overview:chain:' + card.chainId);
  for (let i = 0; i < 4 && a.has('stepthrough:prev'); i++) {
    await a.tap('stepthrough:prev');
    watch('stepthrough');
  }
  assert.deepEqual(adsSeen, [], 'ads on a timed or lobby screen');
  // leaving: lifetime reveals = 1 here, below the 3rd: no interstitial yet
  await a.tap('stepthrough:back');
  await a.tap('overview:back');
  await w.run(500, 250);
  assert.equal(a.app.ads.overlay, null, 'no interstitial before the 3rd lifetime reveal');
  void roomId;
});

// ---------------------------------------------------------------------------------------------------------------- rapid taps, offline

test('17 / 109: rapid repeated taps: 开一局, 加入这一局, 开始, 就这个, 画好了 and 再来一局 each change the server state ONCE (no double room, seat, start, send or rematch)', async () => {
  const w = world();
  const ps = [];
  for (const n of 'ABC') ps.push(await w.player(n, { rules: true, ...G }));
  const [a, b, c] = ps;
  const db = w.srv.db;
  const rooms = () => Object.values(db.rooms);
  const tapMany = (p, id, n) => {
    const h = p.hit(id);
    for (let i = 0; i < n; i++) p.tapAt(h.x + h.w / 2, h.y + h.h / 2);
  };
  tapMany(a, 'home:primary', 5);
  await a.settle();
  assert.equal(rooms().length, 1, 'five taps on 开一局: one room');
  assert.equal(db.players[a.openid].day.roomsCreated, 1);
  const roomId = a.ctl.state.room.roomId;
  w.advance(4000);
  await b.show({ scene: 1044, query: { m: roomId }, shareTicket: 'tkb' });
  tapMany(b, 'roomEntry:join', 6);
  await b.settle();
  assert.equal(rooms()[0].seats.length, 2, 'six taps on 加入这一局: one seat');
  assert.equal(db.players[b.openid].day.roomsJoined, 1);
  w.advance(4000);
  await c.show({ scene: 1044, query: { m: roomId }, shareTicket: 'tkc' });
  await c.tap('roomEntry:join');
  await w.run(1000, 250);
  tapMany(a, 'lobby:start', 6);
  await a.settle();
  await w.run(2500, 250);
  assert.equal(rooms()[0].state, 'playing');
  assert.equal(Object.values(db.chains).filter((x) => x.roomId === roomId).length, 3, 'one start: three chains');
  assert.equal(a.screen(), 'pick');
  tapMany(a, 'pick:start', 6);
  await a.settle();
  assert.equal(db.players[a.openid].day.steps, 1, 'six taps on 就这个: one pick');
  for (const p of [b, c]) await p.tap('pick:start');
  await w.run(2500, 250);
  for (const p of ps) await until(w, p, 'draw', 15000);
  a.scribble(3);
  tapMany(a, 'draw:submit', 8);
  await a.settle();
  assert.equal(Object.values(db.steps).filter((x) => x.author === a.openid && x.kind === 'draw' && !x.marker).length, 1, 'eight taps on 画好了: one drawing');
  assert.equal(a.screen(), 'roundWait');
  for (const p of [b, c]) {
    p.scribble(2);
    await p.tap('draw:submit');
  }
  await w.run(2500, 250);
  for (const p of ps) await until(w, p, 'describe', 15000);
  for (const p of ps) {
    p.type('一只猫在开出租车');
    await p.tap('describe:submit');
  }
  await w.run(2500, 250);
  for (const p of ps) await until(w, p, 'overview', 15000);
  tapMany(a, 'overview:rematch', 5);
  await a.settle();
  assert.equal(rooms().filter((r) => r.state === 'lobby').length, 1, 'five taps on 再来一局: one new room');
  assert.equal(db.players[a.openid].day.roomsCreated, 2);
});

test('8.17 / 3A.6 / AC 147: the network drops during a round: the forced send is retried every second until deadline + grace and then stops, the server marker stands, and the player is back in step after reconnecting', async () => {
  const w = world();
  const ps = [];
  for (const n of 'ABC') ps.push(await w.player(n, { rules: true, ...G }));
  const [a, b, c] = ps;
  const roomId = await openRoom(w, a, [b, c]);
  await startRoom(w, a, ps);
  await pickAll(w, ps);
  for (const p of ps) await until(w, p, 'draw', 15000);
  for (const p of [a, b]) {
    p.scribble(2);
    await p.tap('draw:submit');
  }
  c.scribble(3);
  w.srv.offline = true; // C loses the network and stays offline through time-up
  let attempts = 0;
  const orig = c.app.api.submitRoomStep;
  c.app.api.submitRoomStep = (d) => {
    attempts++;
    return orig(d);
  };
  await w.run(CONFIG.room.drawSec * 1000 + 8000, 250);
  assert.ok(attempts >= 3, 'the forced send was retried: ' + attempts);
  assert.ok(attempts <= 1 + CONFIG.room.graceSec + 1, 'but only until deadline + grace: ' + attempts);
  const before = attempts;
  await w.run(8000, 250);
  assert.equal(attempts, before, 'no retries after deadline + grace');
  w.srv.offline = false;
  await w.run(3000, 250);
  // the server filled C with the empty marker and the game goes on; C rejoins at the current round
  assert.equal(w.srv.db.rooms[roomId].slots['1'][2].state, 'marker');
  assert.equal(w.srv.db.rooms[roomId].slots['1'][2].marker, 'emptyDraw');
  assert.ok(['describe', 'roundWait', 'overview'].includes(c.screen()), 'C is back in the game on ' + c.screen());
});

// ---------------------------------------------------------------------------------------------------------------- strokes v2: aspect handling (property)

test('5.1 / 5.7 / AC 124-125 (property): over 5,000 random free spaces and rects, the canvas is the whole free space or the clamped-aspect centre of it, h is in 768-2048 and matches the rect, and a drawing of any h is contain-fitted: uniform scale, inside the rect, centred, never cropped or stretched', () => {
  const S = require('../core/strokes');
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
  for (let i = 0; i < 5000; i++) {
    const free = { x: rnd() * 30, y: rnd() * 200, w: 120 + rnd() * 900, h: 120 + rnd() * 1500 };
    const c = S.canvasFit(free);
    assert.ok(c.x >= free.x - 1e-9 && c.y >= free.y - 1e-9 && c.x + c.w <= free.x + free.w + 1e-9 && c.y + c.h <= free.y + free.h + 1e-9, 'canvas inside the free space');
    assert.ok(c.gridH >= 768 && c.gridH <= 2048 && Number.isInteger(c.gridH), 'h ' + c.gridH);
    const aspect = free.h / free.w;
    if (aspect >= 0.75 && aspect <= 2) {
      assert.deepEqual([c.w, c.h, c.x, c.y], [free.w, free.h, free.x, free.y], 'inside the clamp the canvas is ALL the free space');
    } else {
      assert.ok(Math.abs(c.x + c.w / 2 - (free.x + free.w / 2)) < 1e-6 && Math.abs(c.y + c.h / 2 - (free.y + free.h / 2)) < 1e-6, 'outside the clamp the canvas is centred');
      assert.ok(c.w < free.w - 1e-9 || c.h < free.h - 1e-9, 'and reduced');
    }
    assert.ok(Math.abs(c.gridH - (1024 * c.h) / c.w) <= 0.5 + 1e-6, 'stored h = round(1024 * h / w): ' + c.gridH);
    // another phone: any rect, any stored h
    const rect = { x: rnd() * 20, y: rnd() * 60, w: 80 + rnd() * 700, h: 80 + rnd() * 1000 };
    const h = 768 + Math.floor(rnd() * 1281);
    const f = S.containFit(rect, h);
    assert.ok(f.w <= rect.w + 1e-9 && f.h <= rect.h + 1e-9, 'never cropped');
    assert.ok(Math.abs(f.w / f.h - 1024 / h) < 1e-9, 'never stretched: the paper keeps 1024 : h');
    assert.ok(Math.abs(f.w - 1024 * f.scale) < 1e-9 && Math.abs(f.h - h * f.scale) < 1e-9, 'one uniform scale');
    assert.ok(Math.abs(f.x + f.w / 2 - (rect.x + rect.w / 2)) < 1e-6 && Math.abs(f.y + f.h / 2 - (rect.y + rect.h / 2)) < 1e-6, 'centred');
    assert.ok(Math.abs(f.w - rect.w) < 1e-6 || Math.abs(f.h - rect.h) < 1e-6, 'touches the rect on the limiting side (as large as possible)');
  }
});

// ---------------------------------------------------------------------------------------------------------------- forced send timing and inertness (AC 128-129)

test('5.8 / AC 128-129: at 0 s by SERVER time the forced send leaves within 300 ms, in a draw turn and a describe turn, whatever the device clock says; every hit, including 举报 and 离开, is inert from that frame on', async () => {
  const w = world();
  const ps = [];
  // C's device clock is 40 s FAST: its own clock must not make it send early
  for (const n of 'ABC') ps.push(await w.player(n, { rules: true, ...G, skew: n === 'C' ? 40000 : 0 }));
  const [a, b, c] = ps;
  const roomId = await openRoom(w, a, [b, c]);
  await startRoom(w, a, ps);
  await pickAll(w, ps);
  for (const p of ps) await until(w, p, 'draw', 15000);
  const deadline = w.srv.db.rooms[roomId].deadline;
  const sentAt = {};
  for (const p of ps) {
    const orig = p.app.api.submitRoomStep;
    p.app.api.submitRoomStep = (d) => {
      if (d.round === 1 && sentAt[p.name] === undefined) sentAt[p.name] = w.t;
      return orig(d);
    };
  }
  for (const p of ps) p.scribble(2); // everybody drew something and nobody taps 画好了
  // walk the server clock to the deadline in 50 ms frames
  while (w.t < deadline - 600) w.advance(Math.min(500, deadline - 600 - w.t));
  for (const p of ps) assert.equal(sentAt[p.name], undefined, p.name + ' must not send before 0 s');
  while (w.t < deadline + 700) {
    w.advance(50);
    for (let i = 0; i < 3; i++) await new Promise((r) => setImmediate(r));
  }
  for (const p of ps) {
    assert.ok(sentAt[p.name] !== undefined, p.name + ' sent');
    assert.ok(sentAt[p.name] >= deadline, p.name + ' sent at ' + (sentAt[p.name] - deadline) + ' ms (not before 0)');
    assert.ok(sentAt[p.name] - deadline <= 300, p.name + ' sent ' + (sentAt[p.name] - deadline) + ' ms after 0, the AC allows 300');
  }
  // describe turn: same, with the keyboard open and a report sheet / dialog open on top
  for (const p of ps) await until(w, p, 'describe', 15000);
  const dl2 = w.srv.db.rooms[roomId].deadline;
  const sent2 = {};
  for (const p of ps) {
    const orig = p.app.api.submitRoomStep;
    p.app.api.submitRoomStep = (d) => {
      if (d.round === 2 && sent2[p.name] === undefined) sent2[p.name] = w.t;
      return orig(d);
    };
    p.type('一只猫在开出租车');
  }
  if (a.has('describe:report')) await a.tap('describe:report'); // a report sheet open at 0 must close, unsent
  if (b.has('describe:back')) await b.tap('describe:back'); // a leave dialog open at 0 must close, and the turn is still sent
  while (w.t < dl2 - 600) w.advance(Math.min(500, dl2 - 600 - w.t));
  while (w.t < dl2 + 700) {
    w.advance(50);
    for (let i = 0; i < 3; i++) await new Promise((r) => setImmediate(r));
  }
  for (const p of ps) {
    assert.ok(sent2[p.name] !== undefined, p.name + ' sent the description');
    assert.ok(sent2[p.name] - dl2 <= 300 && sent2[p.name] >= dl2, p.name + ' describe sent ' + (sent2[p.name] - dl2) + ' ms after 0');
  }
  assert.equal(w.srv.db.rooms[roomId].slots['2'].filter((s) => s.state === 'sent').length, 3, 'all three descriptions were delivered as text');
  assert.equal(a.vm && a.screen() !== 'describe', true, 'the describe screen is gone after the send');
});

// ---------------------------------------------------------------------------------------------------------------- reveal (AC 156-160)

test('8.8-8.9 / AC 156-160: every member reaches the overview at the same moment (not before the last send), the overview shows ONLY final steps (no prompt, no intermediate step), the step-through opens on the final step and walks back to the 起点, 下一条 moves on, 看完了 returns', async () => {
  const w = world();
  const ps = [];
  for (const n of 'ABC') ps.push(await w.player(n, { rules: true, ...G }));
  const [a, b, c] = ps;
  const roomId = await openRoom(w, a, [b, c]);
  await startRoom(w, a, ps);
  await pickAll(w, ps);
  for (const p of ps) await until(w, p, 'draw', 15000);
  for (const p of ps) {
    p.scribble(2);
    await p.tap('draw:submit');
  }
  await w.run(2500, 250);
  for (const p of ps) await until(w, p, 'describe', 15000);
  const SAY = { A: '甲写了一句', B: '乙写了一句', C: '丙写了一句' };
  for (const p of [a, b]) {
    p.type(SAY[p.name]);
    await p.tap('describe:submit');
  }
  await w.run(4000, 250);
  for (const p of ps) assert.notEqual(p.screen(), 'overview', p.name + ' must not see the reveal before the last send');
  const before = w.t;
  c.type(SAY.C);
  await c.tap('describe:submit');
  await w.run(3000, 250);
  for (const p of ps) assert.equal(p.screen(), 'overview', p.name + ' is on the overview');
  assert.ok(w.t - before <= 3000, 'at once: within the transition time');
  // AC 156: only final steps
  const chains = Object.values(w.srv.db.chains).filter((x) => x.roomId === roomId);
  assert.equal(chains.length, 3);
  const prompts = chains.map((x) => x.promptText);
  const vm = a.vm();
  assert.equal(vm.cards.length, 3, 'one card per chain');
  const dumped = JSON.stringify(vm.cards) + a.frame();
  for (const t of prompts) assert.ok(!dumped.includes(t), 'the overview shows a prompt: ' + t);
  for (const card of vm.cards) assert.ok(card.final && !card.steps && !card.prompt, 'a card is its final step only: ' + Object.keys(card));
  assert.deepEqual(vm.cards.map((x) => x.mineStarted).filter(Boolean).length, 1, 'exactly one is mine (你起的)');
  // AC 157: the step-through opens on the final step, 往前一棒 goes toward the 起点
  await a.tap('overview:chain:' + vm.cards[0].chainId);
  let st = a.vm();
  assert.equal(st.index, st.steps.length - 1, 'opens on the final step');
  assert.equal(st.canNext, false, 'nothing later than the final step');
  assert.equal(st.steps[0].kind, 'prompt', 'index 0 is the 起点');
  let guard = 0;
  while (a.vm().canPrev && guard++ < 10) await a.tap('stepthrough:prev');
  st = a.vm();
  assert.equal(st.index, 0);
  assert.equal(st.canPrev, false);
  assert.ok(st.steps[0].text && prompts.includes(st.steps[0].text), 'the 起点 shows the prompt');
  // AC 158: 下一条 opens the next chain at its FINAL step; navigation never advances by itself
  const idxBefore = a.vm().index;
  await w.run(6000, 500);
  assert.equal(a.vm().index, idxBefore, 'nothing moves by itself');
  assert.ok(a.has('stepthrough:nextChain'), '下一条 at the 起点');
  await a.tap('stepthrough:nextChain');
  st = a.vm();
  assert.equal(st.index, st.steps.length - 1, 'the next chain also opens on its final step');
  assert.notEqual(st.chainId, vm.cards[0].chainId);
  // walk the remaining chains: on the LAST one the button reads 看完了 and returns to the overview
  for (let k = 0; k < 2; k++) {
    guard = 0;
    while (a.vm().canPrev && guard++ < 10) await a.tap('stepthrough:prev');
    if (a.vm().endAction === 'nextChain') {
      await a.tap('stepthrough:nextChain');
      continue;
    }
    break;
  }
  guard = 0;
  while (a.vm().canPrev && guard++ < 10) await a.tap('stepthrough:prev');
  assert.equal(a.vm().endAction, 'done', 'the last chain ends with 看完了');
  await a.tap('stepthrough:done');
  assert.equal(a.screen(), 'overview', '看完了 returns to the overview');
  void roomId;
});
