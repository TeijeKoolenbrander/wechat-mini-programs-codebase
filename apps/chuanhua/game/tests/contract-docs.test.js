'use strict';
// Keeps the two CONTRACT.md files, the samples, the schema and the error codes in sync, and checks the samples and copy.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const schema = require('../core/schema');
const codes = require('../core/codes');
const copy = require('../core/copy');
const strokes = require('../core/strokes');
const { sample, SAMPLES, SCREENS } = require('../js/render/samples');
const renderStrokes = require('../js/render/strokes');

const APP = path.join(__dirname, '..', '..');
const render = fs.readFileSync(path.join(__dirname, '..', 'js', 'render', 'CONTRACT.md'), 'utf8');
const cloud = fs.readFileSync(path.join(APP, 'cloudfunctions', 'CONTRACT.md'), 'utf8');

/** { screen: [states] } from the "## screen ... **States:** a | b" sections */
function contractStates() {
  const out = {};
  let cur = null;
  for (const line of render.split(/\r?\n/)) {
    const h = /^## (\w+)\s/.exec(line);
    if (h) cur = h[1];
    const s = /^\*\*States:\*\*\s*(.+)$/.exec(line);
    if (s && cur) out[cur] = s[1].split('|').map((x) => x.trim());
  }
  return out;
}

test('render contract: every screen section and every listed state has a sample, and vice versa', () => {
  const doc = contractStates();
  assert.ok(Object.keys(doc).length >= 24, Object.keys(doc).join(','));
  for (const [screen, states] of Object.entries(doc)) {
    assert.ok(SCREENS.includes(screen), 'no samples for screen ' + screen);
    for (const st of states) assert.ok(SAMPLES[screen].includes(st), `no sample for ${screen}/${st}`);
  }
  for (const screen of SCREENS) assert.ok(doc[screen], 'screen without a contract section: ' + screen);
});

test('render contract: ownership, display modes, canvas input contract and hit-id rules are written down', () => {
  for (const must of ['frontend-ui', 'minigame-dev', 'largeText', 'highContrast', 'draw:canvas', 'strokesRev', 'round caps', 'REPLAY_MS', 'Single-finger', 'k=<chainId>', 'r=<chainId>', 'capsule']) {
    assert.ok(render.includes(must), 'missing: ' + must);
  }
});

test('render contract: every hit id the samples imply is documented (spot list of the spec 8 actions)', () => {
  for (const id of ['home:primary', 'home:slow', 'pick:start', 'pick:reroll', 'draw:submit', 'draw:undo', 'draw:clear', 'draw:size', 'describe:submit', 'roundWait:back', 'lobby:start', 'lobby:invite', 'roomEntry:join', 'entry:claim', 'entry:reveal', 'overview:chain:', 'overview:rematch', 'stepthrough:prevHalf', 'stepthrough:nextHalf', 'stepthrough:replay', 'stepthrough:laugh', 'stepthrough:dot:', 'stepthrough:nextChain', 'report:submit', 'rules:agree', 'sent:share', 'group:room:', 'album:room:', 'album:chain:', 'settings:deleteAll', 'settings:palette', 'dialog:confirm']) {
    assert.ok(render.includes('`' + id), 'hit id not documented: ' + id);
  }
});

test('samples: every sample is plain JSON, has no undefined/NaN text, and drawings are valid wire-format strokes', () => {
  for (const screen of SCREENS) {
    for (const state of SAMPLES[screen]) {
      const vm = sample(screen, state);
      const json = JSON.stringify(vm);
      assert.doesNotMatch(json, /undefined|NaN/, `${screen}/${state}`);
      assert.deepEqual(JSON.parse(json), vm);
      (function walk(o, p) {
        if (!o || typeof o !== 'object') return;
        if (o.v === 1 && Array.isArray(o.s)) assert.equal(strokes.validate(o, { requireStroke: false }).ok, true, `${screen}/${state} ${p}`);
        if (o.v === 2 && Array.isArray(o.s)) {
          // strokes v2 (spec 5.3): h 768-2048, <= 200 strokes, x 0-1023, y 0-(h-1), colour 0-11, size 0-2, integers, deltas
          assert.ok(Number.isInteger(o.h) && o.h >= 768 && o.h <= 2048, `${screen}/${state} ${p} h`);
          assert.ok(o.s.length <= 200);
          for (const st of o.s) {
            assert.ok(st.length >= 4 && st.every(Number.isInteger) && st[0] >= 0 && st[0] <= 11 && st[1] >= 0 && st[1] <= 2, `${screen}/${state} ${p} stroke header`);
            let x = st[2];
            let y = st[3];
            for (let i = 4; i <= st.length; i += 2) {
              assert.ok(x >= 0 && x <= 1023 && y >= 0 && y <= o.h - 1, `${screen}/${state} ${p} point in range`);
              if (i < st.length) { x += st[i]; y += st[i + 1]; }
            }
          }
          // and the core codec, when it already understands v2
          const core = strokes.validate(o, { requireStroke: false });
          if (core.ok === false && core.reason !== 'version' && core.reason !== 'shape') assert.fail(`${screen}/${state} ${p}: core rejects v2: ${core.reason}`);
          assert.equal(renderStrokes.gridHOf(o), o.h);
        }
        for (const k of Object.keys(o)) walk(o[k], p + '.' + k);
      })(vm, '');
    }
  }
  assert.throws(() => sample('draw', 'nope'), /no sample/);
  assert.equal(sample('entry', 'taken', { passed: 5 }).passed, 5);
});

test('samples: the entry states carry no prompt or 棒 content; no sample shows an identity (AC 10, 74)', () => {
  for (const state of SAMPLES.entry) {
    const json = JSON.stringify(sample('entry', state));
    assert.doesNotMatch(json, /月亮吃月饼|strokes|"text"/, state);
  }
  for (const screen of SCREENS) {
    for (const state of SAMPLES[screen]) assert.doesNotMatch(JSON.stringify(sample(screen, state)), /openid|nickName|avatar|openGId/i, `${screen}/${state}`);
  }
  assert.equal(sample('draw', 'drawing').palette.length, 12);
  assert.equal(sample('draw', 'drawing').palette.filter((p) => p.locked).length, 6);
  assert.equal(sample('draw', 'drawing').strokes.v, 2);
});

test('samples: share card vms contain no user drawings', () => {
  for (const kind of SAMPLES.shareCard) assert.doesNotMatch(JSON.stringify(sample('shareCard', kind)), /strokes/);
});

test('cloud contract: every cloud function, collection (physical name), admin op and error code is documented', () => {
  for (const fn of Object.keys(schema.FUNCTIONS)) assert.ok(cloud.includes('### ' + fn + '  ('), 'function section missing: ' + fn);
  for (const c of Object.keys(schema.COLLECTIONS)) assert.ok(cloud.includes('`' + c + '`'), 'collection missing: ' + c);
  for (const op of schema.ADMIN_OPS) assert.ok(cloud.includes(op), 'admin op missing: ' + op);
  for (const code of codes.SERVER_CODES) assert.ok(cloud.includes(code), 'error code missing: ' + code);
  for (const v of schema.ENV_VARS) assert.ok(cloud.includes(v), 'env var missing: ' + v);
  for (const must of ['wxcd03c1b62d7eb0e0', 'chuanhua_chains', 'build-config.js', 'cloudEnv', 'msgSecCheck', 'mediaCheckAsync', 'media_type: 2', 'scene: 3', 'wxa_media_check', 'fail closed', 'FORBIDDEN', 'SERVER_CONFIG', 'deny', 'circuit', 'planVerdict', 'storage.rules.json']) {
    assert.ok(cloud.toLowerCase().includes(must.toLowerCase()), 'missing: ' + must);
  }
});

test('schema: prefix, physical names, deny-all rules for every collection, function table is consistent', () => {
  assert.equal(schema.COLLECTION_PREFIX, 'chuanhua_');
  assert.equal(schema.collectionName('chains'), 'chuanhua_chains');
  assert.ok(schema.PHYSICAL_COLLECTIONS.every((c) => c.startsWith('chuanhua_')));
  const rules = schema.denyAllRules();
  assert.deepEqual(Object.keys(rules).sort(), schema.PHYSICAL_COLLECTIONS.slice().sort());
  for (const [name, r] of Object.entries(rules)) {
    // the ONE exception (spec 13.4): a player reads only their own content-free signal documents
    assert.deepEqual(r, name === 'chuanhua_room_signals' ? { read: 'doc._openid == auth.openid', write: false } : { read: false, write: false });
  }
  for (const [name, f] of Object.entries(schema.FUNCTIONS)) {
    assert.ok(['client', 'server', 'console'].includes(f.caller), name);
    assert.ok(f.timeoutSec > 0, name);
    if (f.caller === 'client') assert.ok(f.clientMs > f.timeoutSec * 1000, name + ': the client waits longer than the function');
  }
  assert.equal(schema.FUNCTIONS.submitStep.timeoutSec, 15);
  assert.equal(schema.FUNCTIONS.submitRoomStep.timeoutSec, 15);
  assert.equal(schema.FUNCTIONS.roomSweeper.timer, '0 */1 * * * * *');
  assert.equal(schema.FUNCTIONS.modSweeper.timer, '0 */5 * * * * *');
  assert.equal(schema.FUNCTIONS.cleanup.timer, '0 0 4 * * * *');
  for (const p of ['wxa.game.contentSpam.mediaCheckSync', 'wxa.game.contentSpam.msgSecCheck', 'security.msgSecCheck']) {
    assert.ok(schema.FUNCTIONS.submitStep.openapi.includes(p), p);
    assert.ok(schema.FUNCTIONS.submitRoomStep.openapi.includes(p), p);
  }
  assert.ok(schema.FUNCTIONS.submitStep.openapi.includes('security.mediaCheckAsync'), 'the async fallback keeps its permission');
  for (const u of schema.UGC_FUNCTIONS) assert.ok(schema.FUNCTIONS[u], u);
});

test('error codes: every code has player-facing text; unknown codes fall back; no code is both server and client', () => {
  for (const [c, v] of Object.entries(codes.CODES)) assert.ok(v.text && v.text.length > 1, c);
  assert.equal(codes.textFor('NOPE'), codes.textFor('INTERNAL'));
  assert.equal(codes.textFor('TAKEN'), '被群友抢先一步');
  assert.equal(codes.textFor('CLAIM_LOST'), '超时了，这一棒已被群友接走');
  assert.equal(codes.textFor('TEXT_REJECTED'), '换个说法吧');
  // every spec 13.2 code is present
  for (const c of ['UNAUTHENTICATED', 'FORBIDDEN', 'RATE_LIMITED', 'NOT_MEMBER', 'NOT_GROUP', 'BAD_CLOUDID', 'SERVER_CONFIG', 'INTERNAL', 'RULES_REQUIRED', 'RESTRICTED', 'UGC_PAUSED', 'UGC_BUSY', 'START_LIMIT', 'STEP_LIMIT', 'CLAIM_LIMIT', 'REPORT_LIMIT', 'CHAIN_NOT_FOUND', 'CHAIN_CLOSED', 'TAKEN', 'PENDING', 'PREV_MINE', 'CAP_REACHED', 'NEED_GROUP', 'WRONG_GROUP', 'CLAIM_LOST', 'INVALID_STROKES', 'TEXT_REJECTED', 'TEXT_BLOCKED', 'MODERATION_BUSY', 'NOT_PARTICIPANT', 'NOT_STARTER', 'TOO_EARLY', 'DUP_REPORT', 'OWN_STEP', 'NO_TEMPLATE']) {
    assert.ok(codes.CODES[c], c);
  }
});

test('build config: cloudEnv is empty by default (mock server), prod never mocks', require('./mode').devOnly, () => {
  const b = require('../js/build-config');
  assert.equal(b.cloudEnv, '');
  assert.equal(b.envKind, 'dev');
});

test('copy: spec strings for the home, entry, reveal and album screens', () => {
  assert.equal(copy.stepTitle(3), '第 3 棒 · 画出来');
  assert.equal(copy.stepTitle(4), '第 4 棒 · 猜一猜');
  assert.equal(copy.revealHeader({ participantCount: 6, durationMs: 5 * 3600e3 }), '接龙揭晓 · 6 位群友 · 用时 5 小时');
  assert.equal(copy.summaryText('月亮吃月饼', '外星人在吃披萨', 6), '从「月亮吃月饼」传成了「外星人在吃披萨」');
  assert.equal(copy.summaryText('月亮吃月饼', null, 6), '传了 6 棒，看看变成了什么');
  assert.equal(copy.revealShareTitle('月亮吃月饼', '外星人在吃披萨', 6), '「月亮吃月饼」传了 6 棒，变成了「外星人在吃披萨」');
  assert.equal(copy.inviteShareTitle('describe', 4), '第 4 棒等你接，看看你能猜出什么？');
  assert.equal(copy.inviteShareTitle('draw', 3), '第 3 棒等你接，你来画画看？');
  assert.equal(copy.timeLeftText(31 * 3600e3 - 5), '还剩 31 小时');
  assert.equal(copy.timeLeftText(20 * 60e3), '还剩 20 分钟');
  assert.equal(copy.progressText(3, 6), '已传 3/6 棒');
  assert.equal(copy.dateText('20261015'), '10月15日');
  assert.deepEqual(copy.startCopy(2, 2), { label: '开一条接龙', sublabel: '今天还能开 2 条', enabled: true });
  assert.equal(copy.startCopy(0, 2).label, '今天的 3 条已开完');
  assert.equal(copy.startCopy(0, 0).sublabel, '明天再来开新的吧');
  assert.equal(copy.entryCopy({ state: 'claimable', nextStep: 4, nextKind: 'describe' }).headline, '第 4 棒等你接');
  assert.match(copy.entryCopy({ state: 'claimable', nextStep: 4, nextKind: 'describe' }).subline, /上一棒是一幅画，你来猜一句（限时 45 秒，时间到会自动交出）/);
  assert.match(copy.entryCopy({ state: 'claimable', nextStep: 3, nextKind: 'draw' }).subline, /限时 60 秒，时间到会自动交出/);
  assert.equal(copy.entryCopy({ state: 'wrongGroup' }).headline, '接龙只能在发起的群里接力');
  assert.equal(copy.entryCopy({ state: 'pending', pendingStep: 3 }).headline, '第 3 棒审核中，通常几分钟');
  assert.equal(copy.entryCopy({ state: 'removed', removedReason: 'reported' }).headline, '该接龙已被举报隐藏');
  assert.equal(copy.entryCopy({ state: 'expired' }).headline, '这条接龙没传完');
  assert.equal(copy.albumLine({ status: 'revealed', promptText: '月亮吃月饼', mine: [] }), '已揭晓「月亮吃月饼」');
  assert.equal(copy.albumLine({ status: 'open', passed: 3, length: 6, mine: [{ n: 1, kind: 'draw', modState: 'passed' }] }), '进行中 3/6 · 我画了第 1 棒');
  assert.equal(copy.groupStatsText({ rooms: 5, revealed: 7, drawings: 41 }), '本群一共玩了 12 局 · 画了 41 幅画');
  assert.equal(copy.groupWaitingLine({ nextStep: 4, nextKind: 'describe', passed: 3 }), '第 4 棒 · 猜一句 · 已传 3/6');
});
