'use strict';
// The view models the controller builds are EXACTLY the contract's (js/render/CONTRACT.md, spec 12, js/render/samples.js): the live
// app is driven on the real renderer through every screen and state a player can reach; each view model is compared with the sample
// (same keys, same types), the renderer's reads are watched (a property it reads that the vm builder did not set fails, optional ones
// excepted), the states the tour cannot reach live are built by the vm builders and compared the same way, and every hit id of
// CONTRACT.md is routed by the controller (and vice versa).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { world } = require('./harness');
const { runTour, compare } = require('./tour');
const { sample, SAMPLES } = require('../js/render/samples');
const V = require('../js/vm');
const { normalizeFeatures } = require('../js/features');
const strokesLib = require('../core/strokes');

const G = { group: 'g1' };
const ROOT = path.join(__dirname, '..');

let touring = null;
const tour = () => (touring = touring || runTour());

/** renderer reads of fields that are optional in the contract (absent = the default the renderer states) */
const OPTIONAL_READS = /\.(mine\.(strokes|text|marker)|keyboardH|skeleton|roomId|round|rounds|marker|heading|important|otherRoomId|newRoomId|chainId|claimId|step|text|strokes|hint|placeholder|timer)$|^mine\.mine\[\]\.marker$/;

test('contract: every view model the controller builds has the contract keys (CONTRACT.md / samples.js), nothing missing, nothing invented', async () => {
  const { seen } = await tour();
  const problems = [];
  let n = 0;
  for (const k of Object.keys(seen)) {
    const [screen, state] = k.split('/');
    if (!SAMPLES[screen] || !SAMPLES[screen].includes(state)) {
      problems.push('no sample for live ' + k);
      continue;
    }
    const live = JSON.parse(JSON.stringify(seen[k]));
    if (screen === 'startLimit') delete live.chainStart.sheet; // the home vm's chainStart also says which sheet is open
    compare(live, sample(screen, state), k, problems);
    n++;
  }
  assert.deepEqual(problems, []);
  assert.ok(n >= 75, 'compared ' + n + ' live view models');
});

test('contract: the live tour reached the states players can reach (the rest are built by the builders below)', async () => {
  const { seen } = await tour();
  const reached = Object.keys(seen).sort();
  const mustHave = [
    'home/loading', 'home/ready', 'home/offline', 'home/error', 'rules/open', 'warning/open', 'howto/open', 'settings/idle', 'startLimit/ad', 'startLimit/none', 'terms/ready',
    'pick/loading', 'pick/ready', 'pick/sending', 'pick/error', 'pick/timeUp', 'draw/drawing', 'draw/sending', 'draw/blocked', 'draw/error',
    'describe/typing', 'describe/sending', 'describe/blocked', 'describe/busy', 'describe/error', 'describe/timeUp',
    'roundWait/ready', 'roundWait/passing', 'roundWait/offline', 'lobby/ready', 'lobby/starting', 'lobby/closed', 'lobby/removed', 'lobby/offline',
    'roomEntry/loading', 'roomEntry/joinable', 'roomEntry/full', 'roomEntry/started', 'roomEntry/wrongGroup', 'roomEntry/notFound', 'roomEntry/inOtherRoom', 'roomEntry/offline',
    'sent/passed', 'sent/marker', 'entry/loading', 'entry/claimable', 'entry/taken', 'entry/prevMine', 'entry/revealedParticipant', 'entry/revealedTeaser', 'entry/notFound',
    'entry/offline', 'entry/error', 'entry/wrongGroup', 'entry/restricted', 'entry/rulesRequired', 'entry/ugcPaused', 'entry/dailyLimit', 'entry/removed', 'entry/expired',
    'overview/loading', 'overview/ready', 'overview/offline', 'overview/error', 'stepthrough/ready', 'stepthrough/paused', 'stepthrough/offline', 'stepthrough/error',
    'teaser/ready', 'teaser/removed', 'teaser/notFound', 'group/ready', 'group/noGroup', 'group/error', 'album/ready', 'album/offline', 'mine/ready', 'report/idle',
    'overlay/dialog', 'overlay/toast', 'overlay/adStub',
  ];
  const lost = mustHave.filter((k) => !reached.includes(k));
  assert.deepEqual(lost, []);
});

test('contract: the real renderer reads nothing the view models do not carry (optional contract fields excepted)', async () => {
  const { missing } = await tour();
  const bad = [...missing].filter((m) => !/^overlay\./.test(m) && !OPTIONAL_READS.test(m));
  assert.deepEqual(bad, []);
});

test('contract: no drawn text contains undefined, NaN, null or [object', async () => {
  const { problems } = await tour();
  assert.deepEqual(problems, []);
});

test('contract: builder-level states the tour cannot reach live (dead or transient ones) still match their samples', () => {
  const cm = { display: { largeText: false, highContrast: false }, muted: false, features: normalizeFeatures(null, { adUnits: {} }), ugc: { createEnabled: true, viewEnabled: true }, t: 0 };
  const problems = [];
  const check = (screen, state, vm) => compare(JSON.parse(JSON.stringify(vm)), sample(screen, state), screen + '/' + state, problems);
  const prompts3 = [{ id: 'I1001', text: '月亮吃月饼' }, { id: 'A0003', text: '企鹅滑滑梯' }, { id: 'G0023', text: '熊猫开出租车' }];
  const pickIn = { state: 'offline', mode: 'live', secLeft: 24, warnSec: 10, rollId: 'ROLL000001', prompts: prompts3, selectedId: 'I1001', rerollLeft: 5, custom: { open: false, text: '', error: null, passed: false }, errorText: '需联网才能开始', drawSec: 60 };
  check('pick', 'offline', V.pickVm(pickIn, cm));
  check('pick', 'rerolling', V.pickVm(Object.assign({}, pickIn, { state: 'rerolling', rerollLeft: 4, errorText: null }), cm));
  const drawIn = {
    mode: 'live', roomId: 'ROOMAAAAAA', round: 1, rounds: 4, source: { kind: 'text', text: '恐龙在学跳舞' }, sourceLines: 1, canReport: true, secLeft: 0, warnSec: 10, canvas: { x: 8, y: 180, w: 359, h: 478 }, gridH: 1363,
    palette: V.paletteVm(false), colorIdx: 0, sizeIdx: 1, strokes: [{ c: 0, w: 1, p: [10, 10, 20, 20] }], strokesRev: 3, pointsUsed: 2, limited: false, canUndo: true, canSubmit: true, status: 'timeUp', coach: false,
  };
  check('draw', 'timeUp', V.drawVm(drawIn, cm));
  for (const st of ['teaser', 'closed', 'removed', 'notFound', 'inOtherRoom', 'restricted', 'rulesRequired', 'ugcPaused', 'capReached', 'error']) {
    check('roomEntry', st, V.roomEntryVm({ state: st, roomId: 'ROOMAAAAAA', joined: 4, otherRoomId: st === 'inOtherRoom' ? 'ROOMBBBBBB' : undefined, restrictedUntil: Date.UTC(2026, 10, 17, 6) }, cm));
  }
  const sentIn = (modState, mine) => ({ chainId: 'ABCDEFGHJK', step: 3, kind: 'draw', mine, modState, subscribe: 'offer', firstTimeExplainer: true, revealed: false, updatableCard: true });
  const art = strokesLib.empty(1363);
  check('sent', 'pending', V.sentVm(sentIn('pending', { strokes: art }), cm));
  check('sent', 'blocked', V.sentVm(Object.assign(sentIn('blocked', { strokes: art }), { subscribe: 'hidden' }), cm));
  check('sent', 'void', V.sentVm(Object.assign(sentIn('void', { strokes: art }), { subscribe: 'hidden' }), cm));
  check('sent', 'marker', V.sentVm(sentIn('marker', { marker: 'emptyDraw' }), cm));
  const resp = { passed: 3, length: 6, nextStep: 4, nextKind: 'describe', isParticipant: true, timeLeftMs: 3600e3, pendingStep: 3 };
  for (const st of ['pending', 'capReached', 'inRoom']) check('entry', st, V.entryVm({ state: st, resp, subscribe: 'hidden' }, cm));
  check('entry', 'claimable_starter', V.entryVm({ state: 'claimable', resp: Object.assign({}, resp, { passed: 4, nextStep: 5, nextKind: 'draw', isStarter: true, canRevealNow: true }), subscribe: 'hidden' }, cm));
  check('overview', 'notMember', V.overviewVm({ state: 'notMember', roomId: 'ROOMAAAAAA', cards: [] }, cm));
  const pausedCards = [1, 2].map((n) => ({ card: { chainNo: n, chainId: 'AAAAAAAAA' + n, mineStarted: false, finalKind: 'describe', placeholder: 'paused' }, loaded: null, unseen: false }));
  check('overview', 'paused', V.overviewVm({ state: 'paused', roomId: 'ROOMAAAAAA', n: 2, rounds: 4, cards: pausedCards }, cm));
  check('stepthrough', 'loading', V.stepthroughVm({ state: 'loading', mode: 'live', roomId: 'ROOMAAAAAA', chainId: 'ABCDEFGHJK', steps: [], index: 0 }, cm));
  check('stepthrough', 'notParticipant', V.stepthroughVm({ state: 'notParticipant', mode: 'live', roomId: 'ROOMAAAAAA', chainId: 'ABCDEFGHJK', steps: [], index: 0 }, cm));
  for (const st of ['loading', 'offline']) check('teaser', st, V.teaserVm({ state: st, kind: 'chain', teaser: st === 'offline' ? { promptText: '月亮吃月饼', finalText: '企鹅', passed: 6 } : null }, cm));
  for (const st of ['checkingGroup', 'loading']) check('group', st, V.groupVm({ state: st, resp: null, banner: null }, cm));
  check('group', 'empty', V.groupVm({ state: 'empty', resp: { rooms: [], waiting: [], inProgress: [], revealed: [], stats: {} }, banner: null }, cm));
  for (const st of ['loading', 'empty', 'error']) check('album', st, V.albumVm({ state: st, items: [], nowMs: 0 }, cm));
  for (const st of ['loading', 'error']) check('mine', st, V.mineVm({ state: st, chainId: 'A', rows: [] }, cm));
  for (const st of ['submitting', 'done', 'limit', 'dup', 'error']) check('report', st, V.reportVm({ open: true, target: { chainId: 'ABCDEFGHJK', step: 2, roomId: 'ROOMAAAAAA' }, state: st, selected: 'abuse' }, cm));
  assert.deepEqual(problems, []);
});

test('contract: every sample state is either reached live or built above (nothing in the contract is untested)', async () => {
  const { seen } = await tour();
  const covered = new Set(Object.keys(seen));
  const builder = ['pick/offline', 'pick/rerolling', 'draw/timeUp', 'sent/pending', 'sent/blocked', 'sent/void', 'entry/pending', 'entry/capReached', 'entry/inRoom', 'entry/claimable_starter', 'overview/notMember', 'overview/paused',
    'stepthrough/loading', 'stepthrough/notParticipant', 'teaser/loading', 'teaser/offline', 'group/checkingGroup', 'group/loading', 'group/empty', 'album/loading', 'album/empty', 'album/error', 'mine/loading',
    'mine/error', 'report/submitting', 'report/done', 'report/limit', 'report/dup', 'report/error'];
  for (const b of builder) covered.add(b);
  for (const k of ['roomEntry/teaser', 'roomEntry/closed', 'roomEntry/removed', 'roomEntry/restricted', 'roomEntry/rulesRequired', 'roomEntry/ugcPaused', 'roomEntry/capReached', 'roomEntry/error']) covered.add(k);
  const lacking = [];
  for (const screen of Object.keys(SAMPLES)) {
    if (screen === 'shareCard') continue; // not a view model: tests/render.rules.test.js draws every share card
    for (const state of SAMPLES[screen]) if (!covered.has(screen + '/' + state)) lacking.push(screen + '/' + state);
  }
  assert.deepEqual(lacking, []);
});

// ------------------------------------------------------------------------------------------------------- hit ids

const controllerSrc = ['controller.js', 'ctl-turn.js', 'ctl-pick.js', 'ctl-room.js', 'ctl-reveal.js', 'ctl-chain.js'].map((f) => fs.readFileSync(path.join(ROOT, 'js', f), 'utf8')).join('\n');
const contractSrc = fs.readFileSync(path.join(ROOT, 'js', 'render', 'CONTRACT.md'), 'utf8');

const SCREENS_RE = 'home|pick|draw|describe|roundWait|lobby|roomEntry|sent|entry|overview|stepthrough|teaser|group|album|mine|report|settings|rules|warning|startLimit|sheet|coach|dialog|adstub|howto|terms';
const ID_RE = /^[a-z][A-Za-z]*(?::[A-Za-z0-9<>*|-]+)+$/;
/** every hit id named in CONTRACT.md (`id`, with <param> placeholders stripped to a prefix) */
const contractIds = new Set(
  [...contractSrc.matchAll(/`([^`\s]+)`/g)]
    .map((m) => m[1])
    .filter((s) => ID_RE.test(s) && new RegExp('^(' + SCREENS_RE + '):').test(s))
    .map((s) => s.replace(/<[^>]*>.*$/, ''))
);

const routed = (() => {
  const set = new Set();
  for (const m of controllerSrc.matchAll(/'((?:[a-z][A-Za-z]*):[A-Za-z0-9:]*)'/g)) set.add(m[1]);
  return set;
})();

// draw:canvas is the touch router's (js/app.js), not a tap; the scroll areas are drags
const STRUCTURAL = /^(sheet:(body|scrim|list)|[a-zA-Z]+:(block|card|scrim|body)|dialog:block:card|coach:block|draw:canvas)$/;
const DRAG = /^([a-zA-Z]+:scroll|sheet:list)$/;

test('hit ids: every id in CONTRACT.md is routed by the controller (or is a drag/structural area)', () => {
  const dead = [];
  for (const id of contractIds) {
    if (STRUCTURAL.test(id) || DRAG.test(id)) continue;
    const prefixLike = id.endsWith(':');
    const ok = [...routed].some((r) => (prefixLike ? r.startsWith(id) : r === id));
    if (!ok) dead.push(id);
  }
  assert.deepEqual(dead, []);
  assert.ok(contractIds.size > 100, 'the contract names ' + contractIds.size + ' ids');
});

test('hit ids: every id the controller routes is documented in CONTRACT.md (no phantom ids)', () => {
  const phantom = [];
  for (const id of routed) {
    if (!new RegExp('^(' + SCREENS_RE + '):').test(id)) continue;
    if (STRUCTURAL.test(id) || DRAG.test(id)) continue;
    const documented = contractIds.has(id) || [...contractIds].some((c) => c.endsWith(':') && id.startsWith(c)) || [...contractIds].some((c) => id.endsWith(':') && c.startsWith(id));
    if (!documented) phantom.push(id);
  }
  assert.deepEqual(phantom, []);
});

test('hit ids: every id the real renderer returned during the tour is routed by the controller and documented', async () => {
  const { hitsSeen } = await tour();
  const unrouted = new Set();
  const undocumented = new Set();
  for (const hits of Object.values(hitsSeen)) {
    for (const h of hits) {
      if (STRUCTURAL.test(h.id) || DRAG.test(h.id)) continue;
      const generic = h.id.replace(/:[A-Za-z0-9]{10}$/, ':').replace(/:\d+$/, ':').replace(/^(pick:item:|draw:color:|stepthrough:dot:|mine:delete:|report:reason:).*/, '$1');
      const isRouted = routed.has(h.id) || [...routed].some((r) => r.endsWith(':') && h.id.startsWith(r)) || routed.has(generic) || [...routed].some((r) => generic.startsWith(r));
      if (!isRouted) unrouted.add(h.id);
      if (!contractIds.has(h.id) && !contractIds.has(generic) && ![...contractIds].some((c) => c.endsWith(':') && h.id.startsWith(c))) undocumented.add(h.id);
    }
  }
  assert.deepEqual([...unrouted], []);
  assert.deepEqual([...undocumented], []);
});

test('AC 108 (logic side): unknown hit ids are ignored, never thrown on, on every screen', async () => {
  const w = world();
  const a = await w.player('A', { rules: true, ...G });
  const junk = ['', 'nope', 'home:nope', 'draw:color:99', 'stepthrough:dot:x', 'album:chain:ZZ', 'album:room:ZZ', 'sheet:close', 'dialog:confirm', 'pick:item:nothing', 'overview:chain:ZZ', 'group:room:ZZ', 'mine:delete:x'];
  for (const id of junk) assert.doesNotThrow(() => a.ctl.onHit(id), id);
  await a.settle();
  assert.equal(a.screen(), 'home');
  await a.tap('home:primary');
  for (const id of junk) assert.doesNotThrow(() => a.ctl.onHit(id), id);
  await a.settle();
  assert.equal(a.screen(), 'lobby');
});
