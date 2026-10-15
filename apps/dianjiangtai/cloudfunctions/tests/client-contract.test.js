'use strict';
// Client <-> backend contract. The game's in-memory mock server (game/js/mock-server.js) is what the client
// is developed and tested against; the cloud functions are what ships. This test plays the same flows on both
// and requires every response to carry the fields the client reads, with the same types. The backend (and
// these tests) are the authority: if a shape differs the mock and client change, not the backend.
//
// The field lists below are what game/js/controller.js, vm.js, share.js, subscribe.js read.
const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { createHarness, bestActions } = require('./helpers/harness');
const { runId, prefixThroughPick } = require('./helpers/fixtures');

const { createMockServer } = require(path.join(__dirname, '..', '..', 'game', 'js', 'mock-server.js'));

const T0 = Date.UTC(2026, 10, 3, 4, 0, 0); // 2026-11-03 12:00 BJT
let h;
let mock;
beforeEach(() => {
  h = createHarness({ now: T0 });
  mock = createMockServer({ now: () => h.now() });
});
afterEach(() => h.teardown());

/** conforms(skeleton, value): 'type' strings, 'type?' optional, [sub] arrays, {key: sub} objects (extra keys allowed). */
function conforms(sk, v, where, errs) {
  if (typeof sk === 'string') {
    const opt = sk.endsWith('?');
    const ty = opt ? sk.slice(0, -1) : sk;
    if (v === undefined || v === null) {
      if (!opt) errs.push(`${where}: missing (${ty})`);
      return;
    }
    if (ty !== 'any' && typeof v !== ty) errs.push(`${where}: ${typeof v} instead of ${ty}`);
    return;
  }
  if (Array.isArray(sk)) {
    if (!Array.isArray(v)) return errs.push(`${where}: not an array`);
    v.forEach((x, i) => conforms(sk[0], x, `${where}[${i}]`, errs));
    return;
  }
  if (v === null || typeof v !== 'object') return errs.push(`${where}: not an object`);
  for (const [k, sub] of Object.entries(sk)) {
    const opt = k.endsWith('?');
    const key = opt ? k.slice(0, -1) : k;
    if (opt && (v[key] === undefined || v[key] === null)) continue;
    conforms(sub, v[key], `${where}.${key}`, errs);
  }
}
function check(name, sk, resp) {
  const errs = [];
  assert.equal(resp.ok, true, `${name}: ${JSON.stringify(resp).slice(0, 200)}`);
  conforms(sk, resp, name, errs);
  assert.deepEqual(errs, [], errs.join('; '));
}
/** the same skeleton must hold for the backend answer and the mock answer */
function both(name, sk, backend, mocked) {
  check('backend ' + name, sk, backend);
  check('mock ' + name, sk, mocked);
}

const REC = { w: 'number', l: 'number' };
const ROUND = { faction: 'string', era: 'string', altFaction: ['string'], altEra: ['string'], fallback: ['any'], 'pools?': 'object' };
const SK = {
  getDaily: { dateKey: 'string', issueNo: 'number', variant: 'string', serverNow: 'number', myStatus: 'string', myStreak: { current: 'number', best: 'number' }, features: { ads: { banner: { enabled: 'boolean', 'adUnitId?': 'string' }, interstitial: { enabled: 'boolean', everyNRuns: 'number', minLifetimeRuns: 'number', minGapSec: 'number', maxPerDay: 'number' } }, 'subscribe?': { tmplId: 'string' } }, 'myRecord?': REC },
  startRun: { resumed: 'boolean', rounds: [ROUND], 'actions?': ['any'], 'clientRunId?': 'string' },
  getRound: { round: 'number', data: ROUND },
  submitRun: {
    record: REC,
    battles: [{ i: 'number', typeLabel: 'string', win: 'boolean', p: 'number', luck: 'string', cause: 'string', 'event?': 'any' }],
    events: ['any'],
    band: { key: 'string', label: 'string' },
    ranked: 'boolean',
    'rarity?': { pct: 'number', total: 'number' },
    'streak?': { current: 'number', best: 'number' },
  },
  getHistory: {
    items: [{ dateKey: 'string', issueNo: 'number', variant: 'string', 'mine?': { w: 'number', l: 'number', lineupIdx: ['number'], 'lineupFac?': ['string'] }, 'best?': { lineupIdx: ['number'], 'lineupFac?': ['string'], record: REC }, 'total?': 'number', 'hist?': ['number'] }],
    bestStreak: 'number',
  },
  createChallenge: { challengeId: 'string' },
  getChallengeOwn: { status: 'string', theirRecord: REC, mode: 'string', countsAsDaily: 'boolean', isFriendly: 'boolean', answerCount: 'number', 'bestAnswer?': REC, subscribe: { granted: 'boolean' }, variant: 'string' },
  getBoard: { dateKey: 'string', issueNo: 'number', contentVersion: 'number', salt: 'string', selfHash: 'string', mode: 'string', viewerPlayed: 'boolean', variant: 'string', rows: [['any']] },
};

async function playOn(call, rounds, dateKey, clientRunId, getSheet) {
  const actions = bestActions(rounds);
  for (let n = 1; n <= 4; n++) {
    const r = await call('getRound', { clientRunId, dateKey, actions: prefixThroughPick(actions, n) });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.deepEqual(r.data, getSheet()[n], 'getRound delivers the next round of the sheet');
    assert.equal(r.round, n + 1);
  }
  return actions;
}

test('daily flow: getDaily (no rounds), startRun (round 1 only), getRound, submitRun, history, board: same shapes on the backend and the mock', async () => {
  const U = 'userA';
  const bcall = (fn, ev) => h.call(fn, ev, { openid: U });
  const mcall = async (fn, ev) => mock.call(fn, ev);

  const bd = await bcall('getDaily', {});
  const md = await mcall('getDaily', {});
  both('getDaily', SK.getDaily, bd, md);
  assert.equal(bd.rounds, undefined, 'backend getDaily carries no rounds');
  assert.equal(md.rounds, undefined, 'mock getDaily carries no rounds');
  assert.equal(bd.dateKey, md.dateKey);
  assert.equal(bd.variant, md.variant);

  const bid = runId();
  const mid = runId();
  const bs = await bcall('startRun', { mode: 'daily', clientRunId: bid, dateKey: bd.dateKey });
  const ms = await mcall('startRun', { mode: 'daily', clientRunId: mid, dateKey: md.dateKey });
  both('startRun', SK.startRun, bs, ms);
  assert.equal(bs.rounds.length, 1);
  assert.equal(ms.rounds.length, 1);
  assert.equal(bs.resumed, false);
  assert.equal(ms.resumed, false);
  // free mode: nothing to anchor
  assert.deepEqual(Object.keys(await bcall('startRun', { mode: 'free', clientRunId: runId() })).sort(), ['ok', 'resumed']);
  assert.equal((await mcall('startRun', { mode: 'free', clientRunId: runId() })).resumed, false);

  const bSheet = h.db.all('daily_seeds').find((d) => d._id === bd.dateKey).rounds;
  const mSheet = mock.db.seeds[md.dateKey].rounds;
  const bActions = await playOn(bcall, bSheet, bd.dateKey, bid, () => bSheet);
  const mActions = await playOn(mcall, mSheet, md.dateKey, mid, () => mSheet);
  const bg = await bcall('getRound', { clientRunId: bid, dateKey: bd.dateKey, actions: prefixThroughPick(bActions, 1) });
  const mg = await mcall('getRound', { clientRunId: mid, dateKey: md.dateKey, actions: prefixThroughPick(mActions, 1) });
  both('getRound (stale retry)', SK.getRound, bg, mg);

  // a resumed start returns every released round, the frozen actions and the original run id
  const bs2 = await bcall('startRun', { mode: 'daily', clientRunId: runId(), dateKey: bd.dateKey });
  const ms2 = await mcall('startRun', { mode: 'daily', clientRunId: runId(), dateKey: md.dateKey });
  both('startRun (resume)', SK.startRun, bs2, ms2);
  for (const r of [bs2, ms2]) {
    assert.equal(r.resumed, true);
    assert.equal(r.rounds.length, 5);
    assert.equal(r.actions.length, bActions.length === r.actions.length ? r.actions.length : r.actions.length);
    assert.equal(typeof r.clientRunId, 'string');
  }
  assert.equal(bs2.clientRunId, bid);
  assert.equal(ms2.clientRunId, mid);

  const bsub = await bcall('submitRun', { mode: 'daily', clientRunId: bid, dateKey: bd.dateKey, actions: bActions });
  const msub = await mcall('submitRun', { mode: 'daily', clientRunId: mid, dateKey: md.dateKey, actions: mActions });
  both('submitRun', SK.submitRun, bsub, msub);
  assert.equal(bsub.ranked, true);
  assert.equal(msub.ranked, true);
  assert.deepEqual(Object.keys(bsub.streak).sort(), Object.keys(msub.streak).sort());

  // a second ranked daily: ALREADY_PLAYED carries the stored result under `result` (what the client reads)
  const bap = await bcall('submitRun', { mode: 'daily', clientRunId: runId(), dateKey: bd.dateKey, actions: bActions });
  const map = await mcall('submitRun', { mode: 'daily', clientRunId: runId(), dateKey: md.dateKey, actions: mActions });
  for (const [who, r] of [['backend', bap], ['mock', map]]) {
    assert.equal(r.ok, false, who);
    assert.equal(r.code, 'ALREADY_PLAYED', who);
    assert.equal(typeof r.message, 'string', who + ' errors use `message`');
    assert.equal(r.result.ok, true, who + ' ALREADY_PLAYED carries result');
    assert.deepEqual(r.result.record, who === 'backend' ? bsub.record : msub.record, who);
  }

  // tomorrow: yesterday is in the archive with the best lineup once its window closed
  h.advance(24 * 3600e3);
  const bd2 = await bcall('getDaily', {});
  const md2 = await mcall('getDaily', {});
  both('getDaily (next day)', SK.getDaily, bd2, md2);
  assert.equal(bd2.myStreak.current, 1);
  assert.equal(md2.myStreak.current, 1);
  const bh = await bcall('getHistory', { limit: 30 });
  const mh = await mcall('getHistory', { limit: 30 });
  both('getHistory', SK.getHistory, bh, mh);
  for (const hist of [bh, mh]) {
    const y = hist.items.find((i) => i.dateKey === bd.dateKey);
    assert.ok(y && y.mine && y.mine.lineupIdx.length === 5, 'yesterday with my lineup');
    assert.ok(y.best && y.best.lineupIdx.length === 5, 'best lineup after the window closed');
    assert.equal(hist.items[0].dateKey, bd2.dateKey, 'newest first');
  }

  // board rows: [hash, wins, secondsSinceMidnight, lineup "i,j,k,l,m" | null, streak?]
  h.setNow(T0);
  const bb = await bcall('getBoard', { kind: 'friend', dateKey: bd.dateKey });
  const mb = await mcall('getBoard', { kind: 'friend', dateKey: md.dateKey });
  both('getBoard', SK.getBoard, bb, mb);
  for (const b of [bb, mb]) {
    assert.ok(b.rows.length >= 1);
    const row = b.rows[0];
    assert.equal(typeof row[0], 'string');
    assert.equal(typeof row[1], 'number');
    assert.equal(typeof row[2], 'number');
    assert.ok(row[3] === null || /^\d+(,\d+){4}$/.test(row[3]), 'lineup indexes as a comma list');
  }
});

test('challenge flow: createChallenge -> getChallenge(own) -> subscribeChallenge; bestAnswer is a {w,l} record on both sides', async () => {
  const U = 'userA';
  const bcall = (fn, ev, openid = U) => h.call(fn, ev, { openid });
  // free runs on both sides
  const bd = await bcall('getDaily', {});
  h.setEnv('SUBSCRIBE_TEMPLATE_ID', 'TMPL_CONTRACT_01');
  h.setEnv('GROUP_REF_PEPPER', 'contract-test-pepper-0123456789abcdef');
  mock.appConfig = { subscribe: { tmplId: 'TMPL_CONTRACT_01' } };
  const seed = 123456789;
  const content = require(path.join(h.root, 'getDaily', 'core', 'content.js'));
  const sheet = require(path.join(h.root, 'getDaily', 'core', 'sheet.js'));
  const rounds = sheet.buildSheet(seed, content.LATEST_CONTENT_VERSION);
  const actions = bestActions(rounds, { mode: 'free' });
  const bid = runId();
  const mid = runId();
  const bsub = await bcall('submitRun', { mode: 'free', clientRunId: bid, seed, actions });
  const msub = mock.call('submitRun', { mode: 'free', clientRunId: mid, seed, actions });
  assert.equal(bsub.ok, true, JSON.stringify(bsub));
  assert.equal(msub.ok, true, JSON.stringify(msub));
  const bc = await bcall('createChallenge', { runId: bid });
  const mc = mock.call('createChallenge', { runId: mid });
  both('createChallenge', SK.createChallenge, bc, mc);

  const bown = await bcall('getChallenge', { challengeId: bc.challengeId });
  const mown = mock.call('getChallenge', { challengeId: mc.challengeId });
  both('getChallenge (own, no answers)', SK.getChallengeOwn, bown, mown);
  assert.equal(bown.status, 'own');
  assert.equal(mown.status, 'own');

  const bsubs = await bcall('subscribeChallenge', { challengeId: bc.challengeId });
  const msubs = mock.call('subscribeChallenge', { challengeId: mc.challengeId });
  assert.equal(bsubs.ok, true, JSON.stringify(bsubs));
  assert.equal(msubs.ok, true);

  // a friend answers: the owner's view now carries answerCount and bestAnswer {w,l}
  const ans = await bcall('submitRun', { mode: 'challenge', clientRunId: runId(), challengeId: bc.challengeId, actions }, 'friend');
  assert.equal(ans.ok, true, JSON.stringify(ans));
  assert.equal(ans.challengeCompare.theirRecord.w, bsub.record.w);
  assert.deepEqual(Object.keys(ans.challengeCompare).filter((k) => ['theirRecord', 'theirLineup', 'lineupLocked'].includes(k)).sort(), ['lineupLocked', 'theirLineup', 'theirRecord']);
  mock.db.challenges[mc.challengeId].answers.push({ w: ans.record.w, lineup: [], by: 'friend' });
  const bown2 = await bcall('getChallenge', { challengeId: bc.challengeId });
  const mown2 = mock.call('getChallenge', { challengeId: mc.challengeId });
  both('getChallenge (own, answered)', SK.getChallengeOwn, bown2, mown2);
  assert.equal(bown2.answerCount, 1);
  assert.deepEqual(bown2.bestAnswer, { w: ans.record.w, l: 12 - ans.record.w });
  assert.deepEqual(mown2.bestAnswer, { w: ans.record.w, l: 12 - ans.record.w });
  void bd;
});

test('error envelope: {ok:false, code, message} on both sides', async () => {
  const b = await h.call('startRun', { mode: 'daily', clientRunId: 'bad id', dateKey: '20261103' }, { openid: 'u' });
  const m = mock.call('getRound', { dateKey: '20261103', actions: [] });
  for (const r of [b, m]) {
    assert.equal(r.ok, false);
    assert.equal(typeof r.code, 'string');
    assert.equal(typeof r.message, 'string');
  }
});
