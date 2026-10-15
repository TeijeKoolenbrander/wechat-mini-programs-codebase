/**
 * Client contract: the SAME scripted flows run against the real cloud functions (in-process, real game core,
 * fake database and openapi) and against the client's in-memory mock server. For every call both must return
 * the same error code and the same response shape (field names and types; null/absent is "optional"), so the
 * game that was developed against the mock behaves the same against the backend. Also pins the contract
 * decisions of docs/chuanhua: ackWarning, promptId everywhere the client needs it, getMyChains({chainId}),
 * and that nothing an author must not see leaves either server.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { createMockServer } = require('../js/mock-server');
const { createHarness } = require(path.join('..', '..', 'cloudfunctions', 'tests', 'helpers', 'harness'));

const [A, B, C, D, E, F] = ['oAlice0000000000000001', 'oBob00000000000000000002', 'oCara0000000000000000003', 'oDan00000000000000000004', 'oEve00000000000000000005', 'oFay00000000000000000006'];
const GROUP_G1 = 'gOpenGroupAAAAAAAAAAAAAAAA';
const GROUP_G2 = 'gOpenGroupBBBBBBBBBBBBBBBB';

const strokes = (n) => {
  const s = [];
  for (let i = 0; i < n; i++) s.push([i % 6, 1, 100 + i * 40, 100 + i * 20, 10, 5, 12, 8, -4, 20]);
  return { v: 1, s };
};

/** Two servers behind one async interface, on one shared clock. */
function makeServers() {
  const h = createHarness({ realCore: true });
  const mock = createMockServer({ now: () => h.now(), rasterize: false });
  const cloud = {
    name: 'backend',
    call: (fn, data, who) => h.call(fn, data || {}, { openid: who }),
    advance: async (ms) => {
      h.advance(ms);
      await h.call('modSweeper', {});
    },
    h,
  };
  const mocked = {
    name: 'mock',
    call: async (fn, data, who) => JSON.parse(JSON.stringify(mock.call(fn, data || {}, who))),
    advance: async (ms) => {
      // the clock is shared; advancing it once through the backend is enough, the mock only sweeps
      mock.sweep();
    },
    srv: mock,
  };
  return { cloud, mocked, h, mock };
}

/** path -> Set(types) of a JSON value; arrays merge their elements under path[] */
function shapeOf(v, p, out) {
  out = out || new Map();
  const add = (t) => (out.has(p) ? out.get(p).add(t) : out.set(p, new Set([t])));
  if (v === null || v === undefined) add('null');
  else if (Array.isArray(v)) {
    add('array');
    v.forEach((x) => shapeOf(x, p + '[]', out));
  } else if (typeof v === 'object') {
    add('object');
    for (const k of Object.keys(v)) if (v[k] !== undefined) shapeOf(v[k], p + '.' + k, out);
  } else add(typeof v);
  return out;
}

/** differences between two shapes; a path that is null on one side and absent/typed on the other is fine */
function diffShapes(a, b) {
  const bad = [];
  const paths = new Set([...a.keys(), ...b.keys()]);
  for (const p of paths) {
    const x = a.get(p);
    const y = b.get(p);
    if (!x || !y) {
      const have = x || y;
      if (!(have.size === 1 && have.has('null'))) bad.push(`${p}: only on ${x ? 'backend' : 'mock'} (${[...have].join('|')})`);
      continue;
    }
    if (x.has('null') || y.has('null')) continue;
    if (![...x].some((t) => y.has(t))) bad.push(`${p}: backend ${[...x].join('|')} vs mock ${[...y].join('|')}`);
  }
  return bad;
}

/** the recorded results of a flow: label -> response */
async function runFlow(S, label) {
  const out = {};
  const rec = async (name, fn, data, who) => {
    const r = await S.call(fn, data, who);
    out[name] = r;
    return r;
  };
  const joinData = (gid) => ({ groupData: { cloudID: 'x', data: { opengid: gid, chat_type: 3 } } });

  // ---- onboarding
  await rec('getHome.new', 'getHome', {}, A);
  await rec('claim.rulesRequired', 'createChain', { promptId: 'A01' }, A);
  await rec('agreeRules.badVersion', 'agreeRules', { version: 99 }, A);
  for (const who of [A, B, C, D, E]) await rec('agreeRules.' + (who === A ? 'ok' : who), 'agreeRules', { version: 1 }, who);
  await rec('getHome.agreed', 'getHome', {}, A);
  const refA = (await rec('joinGroup.ok', 'joinGroup', joinData(GROUP_G1), A)).groupRef;
  await rec('joinGroup.notGroup', 'joinGroup', { groupData: { cloudID: 'x', data: { opengid: 'x', chat_type: 1 } } }, B);
  const refB = (await S.call('joinGroup', joinData(GROUP_G1), B)).groupRef;
  const refC = (await S.call('joinGroup', joinData(GROUP_G1), C)).groupRef;
  const refD = (await S.call('joinGroup', joinData(GROUP_G1), D)).groupRef;
  await S.call('joinGroup', joinData(GROUP_G2), E);

  // ---- create + first drawing
  await rec('createChain.badPrompt', 'createChain', { promptId: 'ZZZ' }, A);
  await rec('createChain.customRejected', 'createChain', { customText: '加我微信' }, A);
  const cr = await rec('createChain.ok', 'createChain', { promptId: 'A01', groupRef: refA }, A);
  const chainId = cr.chainId;
  await rec('getChain.starting.other', 'getChain', { chainId, groupRef: refB }, B);
  await rec('submitStep.invalidStrokes', 'submitStep', { chainId, claimId: cr.claim.claimId, strokes: { v: 1, s: [[99, 1, 5, 5]] } }, A);
  await rec('submitStep.badKind', 'submitStep', { chainId, claimId: cr.claim.claimId, text: '文字' }, A);
  await rec('submitStep.drawing', 'submitStep', { chainId, claimId: cr.claim.claimId, strokes: strokes(3) }, A);
  await rec('getChain.pending.author', 'getChain', { chainId, groupRef: refA }, A);
  await rec('getChain.pending.other', 'getChain', { chainId, groupRef: refB }, B);
  await rec('claimStep.pending', 'claimStep', { chainId, groupRef: refB }, B);
  await rec('getMyChains.detail.pending', 'getMyChains', { chainId }, A);
  await rec('getMyChains.list.pending', 'getMyChains', {}, A);
  await S.advance(61e3);
  await S.advance(1e3);

  // ---- the lock
  await rec('getChain.claimable', 'getChain', { chainId, groupRef: refB }, B);
  await rec('getChain.prevMine', 'getChain', { chainId, groupRef: refA }, A);
  await rec('claimStep.prevMine', 'claimStep', { chainId, groupRef: refA }, A);
  await rec('claimStep.noGroup', 'claimStep', { chainId }, B);
  const clB = await rec('claimStep.ok.draw->describe', 'claimStep', { chainId, groupRef: refB }, B);
  await rec('claimStep.taken', 'claimStep', { chainId, groupRef: refC }, C);
  await rec('getChain.taken', 'getChain', { chainId, groupRef: refC }, C);
  await rec('claimStep.resume', 'claimStep', { chainId, groupRef: refB }, B);
  await rec('releaseClaim.ok', 'releaseClaim', { chainId, claimId: clB.claimId }, B);
  await rec('releaseClaim.stale', 'releaseClaim', { chainId, claimId: clB.claimId }, B);
  const clB2 = await S.call('claimStep', { chainId, groupRef: refB }, B);
  await rec('submitStep.textBlocked', 'submitStep', { chainId, claimId: clB2.claimId, text: '测试复审' }, B);
  await rec('submitStep.textBusy', 'submitStep', { chainId, claimId: clB2.claimId, text: '测试繁忙' }, B);
  await rec('submitStep.textLocal', 'submitStep', { chainId, claimId: clB2.claimId, text: '加我微信吧' }, B);
  await rec('submitStep.claimLost', 'submitStep', { chainId, claimId: 'AAAAAAAAAAAA', text: '一只猫' }, B);
  await rec('submitStep.text', 'submitStep', { chainId, claimId: clB2.claimId, text: '一只小猫在吃面' }, B);

  // ---- steps 3..6
  const clC = await rec('claimStep.ok.describe->draw', 'claimStep', { chainId, groupRef: refC }, C);
  await rec('submitStep.drawing2', 'submitStep', { chainId, claimId: clC.claimId, strokes: strokes(4) }, C);
  await S.advance(61e3);
  await S.advance(1e3);
  await rec('revealNow.tooEarly', 'revealNow', { chainId }, A);
  const clD = await S.call('claimStep', { chainId, groupRef: refD }, D);
  await S.call('submitStep', { chainId, claimId: clD.claimId, text: '外星人吃披萨' }, D);
  await rec('getChain.beforeReveal.starter', 'getChain', { chainId, groupRef: refA }, A);
  const clA = await S.call('claimStep', { chainId, groupRef: refA }, A);
  await S.call('submitStep', { chainId, claimId: clA.claimId, strokes: strokes(2) }, A);
  await S.advance(61e3);
  await S.advance(1e3);
  const cl6 = await rec('claimStep.ok.last', 'claimStep', { chainId, groupRef: refB }, B);
  const sub6 = await rec('submitStep.revealed', 'submitStep', { chainId, claimId: cl6.claimId, text: '最后一句话' }, B);
  out.final = sub6;

  // ---- reveal, teaser, laugh, report
  await rec('getChain.revealedParticipant', 'getChain', { chainId, groupRef: refA }, A);
  await rec('getChain.revealedTeaser', 'getChain', { chainId, groupRef: refD }, E);
  await rec('getReveal.participant', 'getReveal', { chainId }, A);
  await rec('getReveal.notMember', 'getReveal', { chainId }, F);
  await S.call('agreeRules', { version: 1 }, F);
  const refF = (await S.call('joinGroup', joinData(GROUP_G1), F)).groupRef;
  void refF;
  await rec('getReveal.teaser', 'getReveal', { chainId }, F);
  await rec('getReveal.notRevealed', 'getReveal', { chainId: 'AAAAAAAAAA' }, A);
  await rec('laugh.on', 'laugh', { chainId, step: 2 }, A);
  await rec('laugh.off', 'laugh', { chainId, step: 2 }, A);
  await rec('report.ok', 'report', { chainId, step: 3, reason: 'ad' }, A);
  await rec('report.dup', 'report', { chainId, step: 3, reason: 'ad' }, A);
  await rec('report.own', 'report', { chainId, step: 1, reason: 'ad' }, A);
  await rec('getReveal.afterReport', 'getReveal', { chainId }, B);

  // ---- album, group, detail, misc
  await rec('getMyChains.list', 'getMyChains', {}, A);
  await rec('getMyChains.detail.revealed', 'getMyChains', { chainId }, A);
  await rec('getMyChains.detail.notInvolved', 'getMyChains', { chainId }, E);
  await rec('getGroupChains', 'getGroupChains', { groupRef: refA }, A);
  await rec('getGroupChains.notMember', 'getGroupChains', { groupRef: refA }, E);

  // a second chain: expiry, same-again data, delete
  const cr2 = await S.call('createChain', { promptId: 'B02', groupRef: refA }, A);
  await S.call('submitStep', { chainId: cr2.chainId, claimId: cr2.claim.claimId, strokes: strokes(2) }, A);
  await S.advance(61e3);
  await S.advance(1e3);
  await rec('getChain.open', 'getChain', { chainId: cr2.chainId, groupRef: refA }, A);
  await rec('subscribeReveal.noTemplate', 'subscribeReveal', { chainId: cr2.chainId }, A);
  await S.advance(49 * 3600e3);
  await rec('getChain.expired.starter', 'getChain', { chainId: cr2.chainId, groupRef: refA }, A);
  await rec('getChain.expired.other', 'getChain', { chainId: cr2.chainId, groupRef: refB }, B);
  await rec('getMyChains.list.expired', 'getMyChains', {}, A);
  await rec('getMyChains.detail.expired', 'getMyChains', { chainId: cr2.chainId }, A);
  await rec('deleteMyStep.one', 'deleteMyStep', { chainId: cr2.chainId, step: 1 }, A);
  await rec('deleteMyStep.bad', 'deleteMyStep', { chainId: cr2.chainId, step: 5 }, A);
  await rec('getChain.notFound', 'getChain', { chainId: 'AAAAAAAAAA', groupRef: refA }, A);

  // rewards, analytics, warning
  await rec('grantReward.start', 'grantReward', { kind: 'start', noFill: false }, A);
  await rec('grantReward.palette', 'grantReward', { kind: 'palette', noFill: false }, A);
  await rec('grantReward.paletteAgain', 'grantReward', { kind: 'palette', noFill: false }, A);
  await rec('grantReward.badKind', 'grantReward', { kind: 'gold' }, A);
  await rec('track', 'track', { sessionId: 'sess-1', events: [{ name: 'session_start', props: {}, clientTs: 1 }] }, A);
  await rec('ackWarning', 'ackWarning', {}, B);

  out.__label = label;
  return out;
}

test('every client-callable function exists on both servers', async () => {
  const { h, mock } = makeServers();
  try {
    const api = require('../js/api');
    void api;
    const clientCalls = ['getHome', 'agreeRules', 'ackWarning', 'joinGroup', 'createChain', 'getChain', 'claimStep', 'releaseClaim', 'submitStep', 'getReveal', 'revealNow', 'laugh', 'report', 'getMyChains', 'getGroupChains', 'deleteMyStep', 'subscribeReveal', 'grantReward', 'track'];
    for (const fn of clientCalls) {
      assert.ok(mock.names.includes(fn), 'mock has ' + fn);
      assert.ok(require('node:fs').existsSync(path.join(__dirname, '..', '..', 'cloudfunctions', fn, 'index.js')), 'backend has ' + fn);
    }
  } finally {
    h.teardown();
  }
});

const results = {};
test('the same flow runs against the backend and the mock', async () => {
  const { cloud, mocked, h, mock } = makeServers();
  try {
    // one flow per server on one shared clock: run them sequentially from the same start time
    const t0 = h.now();
    results.backend = await runFlow(
      { call: cloud.call, advance: cloud.advance },
      'backend'
    );
    const tEnd = h.now();
    h.setNow(t0);
    // the mock follows the harness clock; its sweeper is driven explicitly
    const S = {
      call: mocked.call,
      advance: async (ms) => {
        h.advance(ms);
        mock.sweep();
      },
    };
    results.mock = await runFlow(S, 'mock');
    assert.ok(h.now() >= t0 && tEnd >= t0);
  } finally {
    h.teardown();
  }
  assert.ok(results.backend['createChain.ok'].ok, 'backend flow ran: ' + JSON.stringify(results.backend['createChain.ok']));
  assert.ok(results.mock['createChain.ok'].ok, 'mock flow ran');
});

/** moderation, limits, strikes, kill switches: a second flow on fresh servers */
async function runFlow2(S, setUgc) {
  const out = {};
  const rec = async (name, fn, data, who) => (out[name] = await S.call(fn, data, who));
  const joinData = (gid) => ({ groupData: { cloudID: 'x', data: { opengid: gid, chat_type: 3 } } });
  for (const who of [A, B, C]) await S.call('agreeRules', { version: 1 }, who);
  const refA = (await S.call('joinGroup', joinData(GROUP_G1), A)).groupRef;
  const refB = (await S.call('joinGroup', joinData(GROUP_G1), B)).groupRef;
  const refC = (await S.call('joinGroup', joinData(GROUP_G2), C)).groupRef;

  // custom prompts: contact words, review, risky (a strike), busy
  await rec('create.custom.rejected', 'createChain', { customText: '加我微信吧' }, B);
  await rec('create.custom.review', 'createChain', { customText: '测试复审的题目' }, B);
  await rec('getHome.noStrike', 'getHome', {}, B);
  await rec('create.custom.risky', 'createChain', { customText: '测试违规的题目' }, B);
  await rec('getHome.strike', 'getHome', {}, B);
  await rec('create.custom.busy', 'createChain', { customText: '测试繁忙的题目' }, B);
  await rec('create.custom.ok', 'createChain', { customText: '会飞的西瓜', groupRef: refB }, B);

  // a blocked drawing (13 strokes): pending, then blocked; the author sees it, the 棒 reopens
  const cr = await rec('create.ok', 'createChain', { promptId: 'C03', groupRef: refA }, A);
  await rec('submit.risky', 'submitStep', { chainId: cr.chainId, claimId: cr.claim.claimId, strokes: strokes(13) }, A);
  await S.advance(61e3);
  await S.advance(1e3);
  await rec('myChains.detail.blocked', 'getMyChains', { chainId: cr.chainId }, A);
  await rec('myChains.list.blocked', 'getMyChains', {}, A);
  await rec('getChain.afterBlock.author', 'getChain', { chainId: cr.chainId, groupRef: refA }, A);
  await rec('getHome.afterBlock', 'getHome', {}, A);
  // the starter claims 第 1 棒 again and passes
  const cl = await rec('claim.again', 'claimStep', { chainId: cr.chainId, groupRef: refA }, A);
  await rec('submit.ok', 'submitStep', { chainId: cr.chainId, claimId: cl.claimId, strokes: strokes(2) }, A);
  await S.advance(61e3);
  await S.advance(1e3);

  // the daily start allowance: 3 free starts, the 4th is refused
  for (let i = 0; i < 1; i++) {
    const c = await S.call('createChain', { promptId: 'A0' + (i + 1), groupRef: refA }, A);
    await S.call('submitStep', { chainId: c.chainId, claimId: c.claim.claimId, strokes: strokes(2) }, A);
    await S.advance(61e3);
    await S.advance(1e3);
  }
  await rec('create.startLimit', 'createChain', { promptId: 'A05', groupRef: refA }, A);

  // wrong group, no group, caps
  await rec('getChain.wrongGroup', 'getChain', { chainId: cr.chainId, groupRef: refC }, C);
  await rec('claim.wrongGroup', 'claimStep', { chainId: cr.chainId, groupRef: refC }, C);
  await rec('claim.needGroup', 'claimStep', { chainId: cr.chainId }, C);
  await rec('getGroupChains.waiting', 'getGroupChains', { groupRef: refB }, B);
  const clB = await S.call('claimStep', { chainId: cr.chainId, groupRef: refB }, B);
  await rec('getGroupChains.inProgress', 'getGroupChains', { groupRef: refA }, A);
  await S.call('releaseClaim', { chainId: cr.chainId, claimId: clB.claimId }, B);

  // kill switches: viewing off -> placeholders, no lock; creating off -> UGC_PAUSED
  await setUgc({ viewEnabled: false });
  await rec('claim.viewOff', 'claimStep', { chainId: cr.chainId, groupRef: refB }, B);
  await setUgc({ viewEnabled: true, createEnabled: false });
  await rec('create.createOff', 'createChain', { promptId: 'A01', groupRef: refB }, B);
  await rec('claim.createOff', 'claimStep', { chainId: cr.chainId, groupRef: refB }, B);
  await rec('getChain.createOff', 'getChain', { chainId: cr.chainId, groupRef: refB }, B);
  await rec('getHome.createOff', 'getHome', {}, B);
  await setUgc({ createEnabled: true });

  // rewards
  await rec('reward.start1', 'grantReward', { kind: 'start', noFill: true }, B);
  await rec('reward.start1again', 'grantReward', { kind: 'start', noFill: true }, B);
  await rec('reward.start2', 'grantReward', { kind: 'start', noFill: false }, B);
  await rec('reward.start3', 'grantReward', { kind: 'start', noFill: false }, B);
  return out;
}

const results2 = {};
test('moderation, limits, strikes and kill switches: the same codes and shapes on both servers', async () => {
  for (const which of ['backend', 'mock']) {
    const { cloud, mocked, h, mock } = makeServers();
    try {
      const S = which === 'backend'
        ? { call: cloud.call, advance: cloud.advance, setUgc: async (o) => { h.db.put('app_config', { _id: 'live', ugc: o }); h.advance(11e3); /* the 10 s config cache */ } }
        : { call: mocked.call, advance: async (ms) => { h.advance(ms); mock.sweep(); }, setUgc: async (o) => { mock.admin.setUgc(o); h.advance(11e3); } };
      results2[which] = await runFlow2(S, S.setUgc);
    } finally {
      h.teardown();
    }
  }
  const codes = [];
  const shapes = [];
  for (const k of Object.keys(results2.backend)) {
    const b = results2.backend[k];
    const m = results2.mock[k];
    if ((b && b.ok) !== (m && m.ok) || (b && b.code) !== (m && m.code)) codes.push(`${k}: backend ${b && (b.ok ? 'ok' : b.code)} vs mock ${m && (m.ok ? 'ok' : m.code)}`);
    for (const d of diffShapes(shapeOf(b, k), shapeOf(m, k))) if (!ALLOWED.some((re) => re.test(d))) shapes.push(d);
  }
  assert.deepEqual(codes, []);
  assert.deepEqual(shapes, []);
});

test('moderation: a blocked drawing is visible to its author only, with blockedStep; strikes raise warnPending on both', () => {
  for (const which of ['backend', 'mock']) {
    const r = results2[which];
    assert.equal(r['create.custom.risky'].code, 'TEXT_BLOCKED', which);
    assert.equal(r['getHome.noStrike'].me.warnPending, false, which);
    assert.equal(r['getHome.strike'].me.warnPending, true, which);
    const d = r['myChains.detail.blocked'].items[0];
    assert.equal(d.mine[0].modState, 'blocked', which);
    assert.equal(d.blockedStep, 1, which + ' detail blockedStep');
    const li = r['myChains.list.blocked'].items.find((i) => i.chainId === d.chainId);
    assert.equal(li.blockedStep, 1, which + ' list blockedStep');
    assert.equal(li.status, 'blocked', which);
    assert.equal(r['claim.viewOff'].prev.kind, 'paused', which);
    assert.equal(r['claim.viewOff'].claimId, null, which + ': no lock while viewing is off');
    assert.equal(r['create.startLimit'].code, 'START_LIMIT', which);
    assert.equal(r['reward.start3'].code, 'REWARD_LIMIT', which);
  }
});

test('error codes agree on every call', () => {
  if (process.env.DUMP_CONTRACT) fs.writeFileSync(process.env.DUMP_CONTRACT, JSON.stringify(results, null, 1));
  const diffs = [];
  for (const k of Object.keys(results.backend)) {
    if (k === '__label') continue;
    const b = results.backend[k];
    const m = results.mock[k];
    if ((b && b.ok) !== (m && m.ok) || (b && b.code) !== (m && m.code)) diffs.push(`${k}: backend ${b && (b.ok ? 'ok' : b.code)} vs mock ${m && (m.ok ? 'ok' : m.code)}`);
  }
  assert.deepEqual(diffs, []);
});

/** fields whose presence differs on purpose, with the reason */
const ALLOWED = [
  /\.serverNow$/, // the mock stamps it on more calls; the client only reads it where the spec says
  /^[^.]+\.message$/, // human-readable error messages differ in wording only
  /\.features\.(banner|interstitial)\./, // remote-config details of the ads placement
  /\.timers/, // optional remote overrides
];

test('response shapes agree on every call (field names and types)', () => {
  const diffs = [];
  for (const k of Object.keys(results.backend)) {
    if (k === '__label') continue;
    const bs = shapeOf(results.backend[k], k);
    const ms = shapeOf(results.mock[k], k);
    for (const d of diffBetween(bs, ms)) if (!ALLOWED.some((re) => re.test(d))) diffs.push(d);
  }
  assert.deepEqual(diffs, []);
});

function diffBetween(a, b) {
  return diffShapes(a, b);
}

// ---------------------------------------------------------------- contract decisions pinned

test('contract: promptId travels wherever the client needs it for 同题再传, only when the prompt is a preset and already visible', () => {
  for (const which of ['backend', 'mock']) {
    const r = results[which];
    assert.equal(r['getReveal.participant'].promptId, 'A01', which + ' getReveal promptId');
    assert.equal(r['getReveal.teaser'] === undefined, false);
    const teaser = r['getReveal.teaser'].teaser || r['getReveal.teaser'];
    assert.equal(teaser.promptId, 'A01', which + ' teaser promptId');
    const item = r['getMyChains.list'].items.find((i) => i.status === 'revealed');
    assert.equal(item.promptId, 'A01', which + ' getMyChains list promptId (revealed, participant)');
    assert.equal(item.promptText.length > 0, true);
    const detail = r['getMyChains.detail.revealed'].items[0];
    assert.equal(detail.promptId, 'A01', which + ' getMyChains({chainId}) promptId for a revealed chain');
    const exp = r['getMyChains.detail.expired'].items[0];
    assert.equal(exp.promptId, 'B02', which + ' expired chain: the starter gets the promptId');
    // not before the chain is revealed, and not to people who are not the starter
    const pending = r['getMyChains.detail.pending'].items[0];
    assert.ok(!pending.promptId && !pending.promptText, which + ' no prompt for an open chain');
  }
});

test('contract: getMyChains({chainId}) returns only the caller\'s own 棒 with modState; blocked steps have blockedStep in the list', () => {
  for (const which of ['backend', 'mock']) {
    const d = results[which]['getMyChains.detail.revealed'].items[0];
    assert.ok(d.mine.length >= 1 && d.mine.every((m) => typeof m.n === 'number' && typeof m.modState === 'string'), which);
    assert.equal(results[which]['getMyChains.detail.notInvolved'].ok, false);
  }
});

test('safety: no response before the reveal carries chain content to a non-author; teasers carry text only', () => {
  const contentKeys = ['strokes'];
  for (const which of ['backend', 'mock']) {
    const r = results[which];
    for (const k of ['getChain.starting.other', 'getChain.pending.other', 'getChain.claimable', 'getChain.taken', 'getChain.revealedTeaser', 'getChain.beforeReveal.starter', 'getChain.expired.other', 'getChain.open']) {
      const json = JSON.stringify(r[k]);
      for (const c of contentKeys) assert.ok(!json.includes('"' + c + '"'), `${which} ${k} carries ${c}`);
      assert.ok(!/promptText|"text"|finalText|promptId/.test(json), `${which} ${k} leaks content: ${json}`);
    }
    const teaser = JSON.stringify(r['getReveal.teaser']);
    assert.ok(!teaser.includes('"strokes"'), `${which} teaser has no drawing`);
    assert.equal(r['getReveal.notMember'].ok, false);
    assert.equal(r['claimStep.pending'].ok, false, which + ': a drawing in review cannot be claimed');
  }
});

test('safety: getReveal after a report hides the item for everyone (placeholder, no content)', () => {
  for (const which of ['backend', 'mock']) {
    const step3 = results[which]['getReveal.afterReport'].steps.find((s) => s.n === 3);
    assert.equal(step3.placeholder, 'reported', which);
    assert.ok(!step3.strokes && !step3.text, which + ' the hidden step carries no content');
  }
});

test('contract: ackWarning is idempotent and getHome keeps warnPending until it is called', async () => {
  for (const which of ['backend', 'mock']) {
    const { cloud, mocked, h, mock } = makeServers();
    try {
      const S = which === 'backend' ? { call: cloud.call, strike: async () => {
        h.db.patch('players', B, (p) => { p.warnPending = true; });
      } } : { call: mocked.call, strike: async () => { mock.admin.player(B).warnPending = true; } };
      await S.call('agreeRules', { version: 1 }, B);
      await S.strike();
      assert.equal((await S.call('getHome', {}, B)).me.warnPending, true);
      assert.equal((await S.call('getHome', {}, B)).me.warnPending, true, which + ': not read-once');
      assert.equal((await S.call('ackWarning', {}, B)).ok, true);
      assert.equal((await S.call('getHome', {}, B)).me.warnPending, false);
      assert.equal((await S.call('ackWarning', {}, B)).ok, true);
    } finally {
      h.teardown();
    }
  }
});
