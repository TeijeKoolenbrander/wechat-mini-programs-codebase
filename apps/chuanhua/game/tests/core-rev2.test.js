'use strict';
// Rev. 2 core pieces that are not rooms or strokes: allowances (80 turns, room caps), the analytics allowlist, the sync-moderation decisions,
// markers and copy, remote config clamping, the removals (daily, 同题再传), the server-only bank in the schema.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const A = require('../core/allowance');
const analytics = require('../core/analytics');
const mod = require('../core/moderation');
const copy = require('../core/copy');
const chainLib = require('../core/chain');
const views = require('../core/views');
const schema = require('../core/schema');
const { CONFIG, applyRemote, ugcCreateAllowed } = require('../core/config');

const T0 = Date.UTC(2026, 10, 3, 4, 0, 0);
const D1 = '20261103';
const D2 = '20261104';

test('AC 18 (rev. 2): 80 sent turns a day; 10 rooms created, 30 joined (first join of a room only); the cap applies at create and join, never mid-game', () => {
  assert.equal(CONFIG.allowances.stepsPerDay, 80);
  let p = A.newPlayer('u', T0);
  assert.equal(A.checkRoomCreate(p, D1), null);
  for (let i = 0; i < 10; i++) {
    assert.equal(A.checkRoomCreate(p, D1), null);
    p = A.consumeRoomCreate(p, D1);
  }
  assert.equal(A.checkRoomCreate(p, D1).code, 'ROOM_LIMIT');
  assert.equal(A.checkRoomCreate(p, D2), null, 'resets at 00:00 BJT');
  p = A.refundRoomCreate(p, D1);
  assert.equal(A.checkRoomCreate(p, D1), null, 'a lobby closed before the start gives the creation back');
  assert.equal(A.refundRoomCreate(p, D2), p, 'only inside the same Beijing day');
  let q = A.newPlayer('v', T0);
  for (let i = 0; i < 30; i++) q = A.consumeRoomJoin(q, D1, 'R' + i);
  assert.equal(A.checkRoomJoin(q, D1, 'NEW').code, 'JOIN_LIMIT');
  assert.equal(A.checkRoomJoin(q, D1, 'R3'), null, 'a rejoin of a room already counted');
  assert.equal(A.consumeRoomJoin(q, D1, 'R3').day.roomsJoined, 30, 'counted once');
  for (let i = 0; i < 80; i++) q = A.consumeStep(q, D2);
  assert.equal(A.checkRoomCreate(q, D2).code, 'STEP_LIMIT');
  assert.equal(A.checkRoomJoin(q, D2, 'X').code, 'STEP_LIMIT');
  assert.deepEqual(A.roomsLeft(A.newPlayer('w', T0), D1), { created: 10, joined: 30, turns: 80 });
  const np = A.newPlayer('x', T0);
  assert.deepEqual([np.seenPrompts, np.roll, np.activeRoomId], [[], null, null]);
});

test('AC 90 (rev. 2): the streak counts a day with a sent non-marker turn; same-day sends do not change it', () => {
  let p = A.newPlayer('u', T0);
  p = A.advanceStreak(p, D1);
  p = A.advanceStreak(p, D1);
  assert.equal(p.curStreak, 1);
  p = A.advanceStreak(p, D2);
  assert.equal(A.currentStreak(p, D2), 2);
  assert.equal(A.streakText(2), '连续接龙 2 天');
  assert.equal(A.streakText(1), null);
});

test('AC 75 (rev. 2): the analytics allowlist knows every spec 14 event, drops unknown keys and text, and keeps counts', () => {
  const must = ['session_start', 'card_open', 'group_join', 'rules_view', 'rules_agree', 'prompt_roll', 'prompt_pick', 'custom_prompt_result', 'room_create', 'room_join', 'room_leave',
    'room_start', 'room_round', 'room_end', 'room_close', 'rt_mode', 'chain_create', 'claim_attempt', 'step_view', 'step_submit', 'step_result', 'mod_verdict', 'chain_reveal',
    'reveal_open', 'reveal_step', 'reveal_done', 'rematch', 'laugh', 'report_submit', 'share_tap', 'share_update', 'subscribe_offer', 'subscribe_result', 'group_list_view', 'album_view',
    'delete_step', 'restriction_shown', 'ad_request', 'ad_load', 'ad_show', 'ad_close', 'ad_reward', 'ad_error', 'interstitial_show', 'ugc_pause', 'strike', 'restrict', 'error'];
  for (const e of must) assert.ok(analytics.EVENT_NAMES.includes(e), e);
  for (const gone of ['same_again', 'reveal_view']) assert.ok(!analytics.EVENT_NAMES.includes(gone), gone + ' is removed');
  const clean = analytics.sanitizeEvents([
    { name: 'step_submit', props: { mode: 'live', kind: 'draw', durationMs: 42000, auto: true, empty: false, strokes: 12, points: 340, canvasH: 1363, text: 'hello', openid: 'openid-A' } },
    { name: 'prompt_pick', props: { mode: 'live', source: 'reroll', promptId: 'A1001', rerolled: true, rerolls: 5, pickMs: 4100, customText: '月亮' } },
    { name: 'prompt_pick', props: { mode: 'chain', source: 'daily', promptId: 'A01' } },
    { name: 'rt_mode', props: { mode: 'poll', reason: 'error', latencyMs: 900, junk: 1 } },
    { name: 'room_join', props: { result: 'wrongGroup', seat: 3, roomId: 'ABCDEFGHIJ' } },
    { name: 'reveal_step', props: { mode: 'live', chainNo: 2, index: 3, of: 4, via: 'swipe' } },
    { name: 'room_start', props: { n: 4 } },
    { name: 'prompt_roll', props: { mode: 'live', reroll: true, rerollNo: 5, cats: 'ABC', text: 'x' } },
    { name: 'prompt_roll', props: { mode: 'live', reroll: true, rerollNo: 6 } },
  ]);
  assert.deepEqual(clean[0].props, { mode: 'live', kind: 'draw', durationMs: 42000, auto: true, empty: false, strokes: 12, points: 340, canvasH: 1363 });
  assert.deepEqual(clean[1].props, { mode: 'live', source: 'reroll', promptId: 'A1001', rerolled: true, rerolls: 5, pickMs: 4100 });
  assert.deepEqual(clean[2].props, { mode: 'chain', promptId: 'A01' }, 'the removed source daily is dropped');
  assert.deepEqual(clean[3].props, { mode: 'poll', reason: 'error', latencyMs: 900 });
  assert.deepEqual(clean[4].props, { result: 'wrongGroup', seat: 3 });
  assert.equal(clean[5].props.via, 'swipe');
  assert.deepEqual(clean[6].props, {}, 'server events accept no client props');
  assert.deepEqual(clean[7].props, { mode: 'live', reroll: true, rerollNo: 5, cats: 'ABC' }, 'rerollNo 0..5 is allowed (AC 164-168)');
  assert.deepEqual(clean[8].props, { mode: 'live', reroll: true }, 'rerollNo 6 is out of range and dropped');
  assert.equal(analytics.sanitizeEvents([{ name: 'daily_view', props: {} }]).length, 0);
});

test('6.1/6.6: sync moderation helpers: parameters, mock verdicts by stroke count, 750031 / quota codes, budgets, imageMode', () => {
  assert.deepEqual(mod.syncImageParams('https://t/x.png', 'oid'), { openid: 'oid', version: 2, scene: 3, media_url: 'https://t/x.png', media_type: 2 });
  assert.deepEqual(mod.gameTextParams('你好', 'oid'), { openid: 'oid', version: 2, scene: 3, content: '你好' });
  const strokes = (n) => ({ s: Array.from({ length: n }, () => [0, 0, 1, 1]) });
  assert.deepEqual(mod.mockImageSync(strokes(13)), { suggest: 'risky' });
  assert.deepEqual(mod.mockImageSync(strokes(15)), { timeout: true });
  for (const n of [1, 12, 14, 16]) assert.deepEqual(mod.mockImageSync(strokes(n)), { suggest: 'pass' });
  assert.equal(mod.isNotSupported(750031), true);
  assert.equal(mod.isNotSupported('750031'), true);
  assert.equal(mod.isNotSupported(750032), false);
  assert.equal(mod.isQuotaCode(750032) && mod.isQuotaCode(750033), true);
  assert.equal(mod.isQuotaCode(750031), false);
  assert.equal(mod.imageBudgetAllows({ envKind: 'dev', mode: 'live' }, 199), true);
  assert.equal(mod.imageBudgetAllows({ envKind: 'dev', mode: 'live' }, 200), false);
  assert.equal(mod.imageBudgetAllows({ envKind: 'prod', mode: 'live' }, 99999), true);
  assert.equal(mod.imageBudgetAllows({ envKind: 'dev', mode: 'mock' }, 99999), true);
  assert.equal(mod.imageModeOf({ imageMode: 'async' }), 'async');
  assert.equal(mod.imageModeOf({ imageMode: 'weird' }), 'sync');
  assert.equal(mod.imageModeOf(undefined), 'sync');
  assert.equal(CONFIG.moderation.imageSyncTimeoutMs, 5000);
  assert.equal(CONFIG.moderation.textGameTimeoutMs, 2000);
  assert.equal(CONFIG.moderation.scene, 3);
});

test('AC 154: imageMode async forces features.liveRooms false; the remote config is clamped; unreadable config means the defaults', () => {
  assert.equal(applyRemote(null).features.liveRooms, true);
  assert.equal(applyRemote({}).config.moderation.imageMode, 'sync');
  const a = applyRemote({ moderation: { imageMode: 'async', textApi: 'general' }, features: { liveRooms: true } });
  assert.deepEqual([a.config.moderation.imageMode, a.config.moderation.textApi, a.features.liveRooms], ['async', 'general', false]);
  assert.equal(applyRemote({ features: { liveRooms: false } }).features.liveRooms, false);
  assert.equal(applyRemote({ moderation: { imageMode: 'bogus', textApi: 5 } }).config.moderation.imageMode, 'sync');
  const c = applyRemote({ room: { maxRounds: 99, promptSec: 1, drawSec: 9999, graceSec: -3, maxPlayers: 99, minPlayers: 1, lobbyIdleMin: 0, gameMaxMin: 1 }, rt: { watch: false, pollSec: 0, safetyPollSec: 1 } }).config;
  assert.deepEqual([c.room.maxRounds, c.room.promptSec, c.room.drawSec, c.room.graceSec, c.room.maxPlayers, c.room.minPlayers, c.room.lobbyIdleMin, c.room.gameMaxMin], [6, 10, 180, 0, 10, 3, 1, 5]);
  assert.deepEqual([c.rt.watch, c.rt.pollSec, c.rt.safetyPollSec], [false, 1, 5]);
  assert.equal(CONFIG.rulesVersion, 2, 'rev. 2 is a material change to the agreement (8.2)');
  assert.equal(ugcCreateAllowed({ createEnabled: false }, T0).ok, false);
});

test('5.8 markers: fixed copy, hints by what the next player makes, only known keys', () => {
  assert.equal(copy.MARKERS.emptyDraw.text, '（没来得及画）');
  assert.equal(copy.MARKERS.emptyText.text, '（没来得及写）');
  assert.equal(copy.MARKERS.notDelivered.text, '（这一棒没传过来）');
  assert.equal(copy.markerHint('emptyDraw', 'describe'), '上一棒没来得及画，你随便写一句吧');
  assert.equal(copy.markerHint('emptyText', 'draw'), '上一棒没来得及写，你自由画一幅吧');
  assert.match(copy.markerHint('notDelivered', 'draw'), /自由画一幅/);
  assert.equal(copy.hiddenHint('draw'), '（该内容已被举报隐藏）你自由画一幅吧');
  assert.equal(copy.emptyMarkerFor('draw'), 'emptyDraw');
  assert.equal(copy.emptyMarkerFor('describe'), 'emptyText');
  assert.equal(copy.isMarker('toString'), false);
  assert.equal(copy.markerText('nope'), '');
  assert.equal(copy.joinedText(4), '4 人已加入（3–10 人）');
  assert.equal(copy.homeCountText, undefined, 'national counts are removed (F-2)');
  assert.equal(copy.nationalText, undefined);
});

test('chain markers (5.8, AC 130, 132, 134): a marker passes the 棒 and counts in the cap; a forced failure reopens the same 棒 keeping the attempt number', () => {
  const mk = () => chainLib.newChain({ chainId: 'C1', starter: 'A', claimId: 'c1', now: T0, dateKey: D1, prompt: { id: 'A01', text: '小猫吃面条', custom: false } });
  const c0 = mk();
  const r = chainLib.passMarker(c0, { stepId: 'C1_1_1', openid: 'A', attempt: 1, now: T0 + 5, marker: 'emptyDraw' });
  assert.deepEqual([r.chain.passed, r.chain.state, r.chain.nextStep, r.chain.perPersonCount.A], [1, 'open', 2, 1]);
  assert.deepEqual(r.chain.markers, [1]);
  assert.equal(chainLib.canClaim(r.chain, { openid: 'A', now: T0 + 6, rulesOk: true, ugcOk: true, memberOfChainGroup: false, groupOpenGId: null }).code, 'NEED_GROUP');
  // checkSubmit: an empty send carries nothing
  const claimed = chainLib.applyClaim(r.chain, { openid: 'B', claimId: 'cb', now: T0 + 10 });
  assert.equal(chainLib.checkSubmit(claimed, { openid: 'B', claimId: 'cb', now: T0 + 11, hasText: false, hasStrokes: false, empty: true }).ok, true);
  assert.equal(chainLib.checkSubmit(claimed, { openid: 'B', claimId: 'cb', now: T0 + 11, hasText: true, hasStrokes: false, empty: true }).code, 'BAD_REQUEST');
  assert.equal(chainLib.checkSubmit(claimed, { openid: 'B', claimId: 'cb', now: T0 + 11, hasText: false, hasStrokes: false, empty: false }).code, 'BAD_REQUEST');
  const re = chainLib.reopenAfterForced(claimed, { attempt: 1, now: T0 + 12 });
  assert.deepEqual([re.claim, re.nextStep, re.state, re.attempts[2], re.perPersonCount.B], [null, 2, 'open', 1, undefined]);
  // a chain of a live room is never claimable and never swept
  const live = chainLib.newLiveChain({ chainId: 'L1', roomId: 'R', seat: 0, starter: 'A', participants: ['A', 'B', 'C'], rounds: 2, now: T0, dateKey: D1 });
  assert.equal(chainLib.canClaim(live, { openid: 'B', now: T0, rulesOk: true, ugcOk: true, memberOfChainGroup: true }).code, 'CHAIN_CLOSED');
  assert.deepEqual(chainLib.sweepChain(live, live.expiresAt + 1).event, null);
  assert.equal(chainLib.isParticipant(live, 'C'), true);
  // seated in a playing room: IN_ROOM after the group gate
  const open = chainLib.passText(chainLib.applyClaim(mk(), { openid: 'A', claimId: 'c1', now: T0 }), { stepId: 'C1_1_1', openid: 'A', attempt: 1, now: T0 + 1 }).chain;
  const base = { openid: 'B', now: T0 + 2, rulesOk: true, ugcOk: true, memberOfChainGroup: false, groupOpenGId: 'g' };
  assert.equal(chainLib.canClaim(Object.assign({}, open, { openGId: 'g' }), Object.assign({}, base, { memberOfChainGroup: true, inRoom: true })).code, 'IN_ROOM');
});

test('views (rev. 2): getChain entry has no promptId / canSameAgain; claimPrev serves markers; reveal rows mark markers un-reportable; teaser skips markers', () => {
  assert.ok(!views.ENTRY_KEYS.includes('canSameAgain') && !views.ENTRY_KEYS.includes('promptId'));
  const chain = Object.assign(chainLib.newChain({ chainId: 'C1', starter: 'A', claimId: 'c1', now: T0, dateKey: D1, prompt: { id: 'A01', text: '小猫吃面条', custom: false } }), { state: 'revealed', passed: 2, length: 2, participants: ['A', 'B'], authors: [null, 'A', 'B'], stepIds: [null, 'C1_1_1', 'C1_2_1'], revealedAt: T0 + 9, revealReason: 'complete' });
  const steps = {
    1: { _id: 'C1_1_1', n: 1, kind: 'draw', marker: 'emptyDraw', state: 'passed', author: 'A' },
    2: { _id: 'C1_2_1', n: 2, kind: 'describe', text: '一只猫', state: 'passed', author: 'B', laughs: 0 },
  };
  const rv = views.revealResponse(chain, steps, { openid: 'A', viewEnabled: true });
  assert.equal(rv.mode, 'chain');
  assert.deepEqual([rv.steps[0].marker, rv.steps[0].text, rv.steps[0].canReport, rv.steps[0].canLaugh], ['emptyDraw', '（没来得及画）', false, false]);
  assert.deepEqual([rv.steps[1].canReport, rv.steps[1].canLaugh], [true, true]);
  assert.equal('canSameAgain' in rv || 'nationalCount' in rv, false);
  assert.equal(views.teaserView(chain, steps, true).finalText, '一只猫');
  const only = { 1: steps[1], 2: { _id: 'C1_2_1', n: 2, kind: 'describe', marker: 'emptyText', state: 'passed', author: 'B' } };
  assert.equal(views.teaserView(chain, only, true).finalText, null, 'a marker is never a final sentence');
  const prev = views.claimPrev(chain, 2, steps[1], true);
  assert.deepEqual([prev.kind, prev.marker, prev.text, prev.canReport], ['marker', 'emptyDraw', '（没来得及画）', false]);
  assert.match(prev.hint, /随便写一句/);
});

test('schema (rev. 2): rooms + room_signals exist, meta is gone, the signal rule is the only non-deny rule, the bank is server-only and daily.js is gone', () => {
  assert.ok(schema.COLLECTIONS.rooms && schema.COLLECTIONS.room_signals);
  assert.ok(!schema.COLLECTIONS.meta, 'meta/launch is removed');
  const rules = schema.denyAllRules();
  assert.deepEqual(rules.chuanhua_room_signals, { read: 'doc._openid == auth.openid', write: false });
  assert.equal(Object.values(rules).filter((r) => r.read !== false).length, 1);
  for (const f of ['rollPrompts', 'createRoom', 'joinRoom', 'leaveRoom', 'startRoom', 'getRoom', 'submitRoomStep', 'roomTick', 'getRoomReveal', 'rematch', 'roomSweeper']) assert.ok(schema.FUNCTIONS[f], f);
  assert.equal(schema.FUNCTIONS.roomSweeper.caller, 'server');
  assert.deepEqual(schema.BANK_FILES, ['prompts.js', 'content/prompts.v1.js', 'content/prompts.v2.js']);
  assert.ok(!schema.FUNCTIONS.getHome.bank && !schema.FUNCTIONS.submitStep.bank && schema.FUNCTIONS.rollPrompts.bank);
  assert.ok(schema.ADMIN_OPS.includes('removeRoom') && schema.ADMIN_OPS.includes('setModeration'));
  assert.equal(schema.signalId('ROOM', 3), 'ROOM_3');
  assert.equal(fs.existsSync(path.join(__dirname, '..', 'core', 'daily.js')), false, 'core/daily.js is deleted (AC 121)');
  const src = fs.readdirSync(path.join(__dirname, '..', 'core')).filter((f) => f.endsWith('.js')).map((f) => fs.readFileSync(path.join(__dirname, '..', 'core', f), 'utf8')).join('\n');
  assert.doesNotMatch(src, /dailyPrompts|launchDateKey|canSameAgain|meta\/launch/);
});
