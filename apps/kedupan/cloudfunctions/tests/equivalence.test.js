'use strict';
// Differential proof that the mock server and the real functions are the same contract: ONE scripted scenario is run
// against both and every response is compared after normalising what is random by design (salts, row hashes, group
// refs, round ids and the host's hidden target, 加一题's random pick). Error responses compare ok + code (+ the
// CARD_DONE reveal); the message text is not part of the contract.
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeBackend, playDay, disposeStages } = require('./helpers/backends');

const T1 = '20261105';
const T2 = '20261106';
const HEX12 = /^[0-9a-f]{12}$/;

function makeNormalizer() {
  const maps = { h: new Map(), id: new Map() };
  const tok = (m, v, p) => {
    if (!m.has(v)) m.set(v, p + (m.size + 1));
    return m.get(v);
  };
  const norm = (v, key) => {
    if (Array.isArray(v)) {
      const arr = v.map((x) => norm(x));
      if (key === 'rows') return arr.map((row) => (Array.isArray(row) && typeof row[0] === 'string' && HEX12.test(row[0]) ? [tok(maps.h, row[0], 'H'), ...row.slice(1)] : row));
      return arr;
    }
    if (v && typeof v === 'object') {
      const o = {};
      for (const k of Object.keys(v)) {
        if (k === 'message') continue;
        o[k] = norm(v[k], k);
      }
      return o;
    }
    if (typeof v === 'string') {
      if (key === 'salt') return 'SALT';
      if (key === 'selfHash' || key === 'closestH') return tok(maps.h, v, 'H');
      if (key === 'groupRef') return 'REF';
      if (key === 'roundId') return tok(maps.id, v, 'R');
    }
    return v;
  };
  return norm;
}

/** structure only: keys and primitive types */
function shape(v) {
  if (Array.isArray(v)) return v.map(shape);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).filter((k) => k !== 'message').sort().map((k) => [k, shape(v[k])]));
  return v === null ? 'null' : typeof v;
}

async function script(be) {
  const log = [];
  const norm = makeNormalizer();
  const rec = async (label, openid, name, data, mode) => {
    const r = await be.call(openid, name, data);
    log.push([label, mode === 'shape' ? shape(r) : norm(r)]);
    return r;
  };
  const recT = async (label, name) => {
    // the functions add ops diagnostics the mock lacks (finalizeDay.partial, sweepRounds.sent, cleanup.removed)
    const { partial, sent, removed, ...r } = await be.timer(name);
    log.push([label, norm(r)]);
    return r;
  };
  const G = (gid) => ({ cloudID: be.cloudID(gid, 3) });

  // ---- day 1: five players in a group, a sixth outside
  await rec('daily0', 'alice', 'getDaily', {});
  for (let i = 0; i < 5; i++) await be.seedCrowd(T1, i, 70);
  const refs = {};
  for (const u of ['alice', 'bob', 'cara', 'dave']) refs[u] = (await rec('join-' + u, u, 'joinGroup', G('GROUP-A'))).groupRef;
  await rec('join-bad', 'erin', 'joinGroup', { cloudID: be.cloudID('X', 1) });
  const plays = { alice: [10, 30, 50, 70, 90], bob: [13, 34, 49, 66, 88], cara: [60, 20, 40, 90, 10], dave: [50, 50, 52, 48, 50] };
  for (const [u, p] of Object.entries(plays)) {
    be.clock.add(11000);
    await rec('getDaily-' + u, u, 'getDaily', { groupRef: refs[u] });
    for (let k = 0; k < 5; k++) {
      be.clock.add(1700);
      await rec(`submit-${u}-${k}`, u, 'submitCard', { dateKey: T1, idx: k, pos: p[k], groupRef: refs[u] });
    }
  }
  be.clock.add(9000);
  await rec('partial-erin', 'erin', 'submitCard', { dateKey: T1, idx: 0, pos: 77 });
  await rec('again-alice', 'alice', 'submitCard', { dateKey: T1, idx: 0, pos: 1, groupRef: refs.alice });
  await rec('order-erin', 'erin', 'submitCard', { dateKey: T1, idx: 3, pos: 77 });
  await rec('badpos', 'erin', 'submitCard', { dateKey: T1, idx: 1, pos: 101 });
  await rec('future', 'erin', 'submitCard', { dateKey: T2, idx: 0, pos: 1 });
  await rec('daily-after-alice', 'alice', 'getDaily', { groupRef: refs.alice });
  await rec('daily-erin', 'erin', 'getDaily', {});
  await rec('daily-forged-ref', 'erin', 'getDaily', { groupRef: refs.alice });
  await rec('group-alice', 'alice', 'getGroupDay', { groupRef: refs.alice, dateKey: T1 });
  await rec('group-erin', 'erin', 'getGroupDay', { groupRef: refs.alice, dateKey: T1 });
  await rec('group-bad-day', 'alice', 'getGroupDay', { groupRef: refs.alice, dateKey: T2 });
  await rec('board-alice', 'alice', 'getFriendBoard', { dateKey: T1 });
  await rec('board-erin', 'erin', 'getFriendBoard', { dateKey: T1 });
  await rec('dist-alice', 'alice', 'unlockDistribution', { dateKey: T1 });
  await rec('dist-erin', 'erin', 'unlockDistribution', { dateKey: T1 });
  await rec('dist-future', 'erin', 'unlockDistribution', { dateKey: T2 });
  await rec('report', 'alice', 'reportCard', { itemId: be.schedule.days[4][0], reason: 'typo' });
  await rec('report-bad', 'alice', 'reportCard', { itemId: 'zz', reason: 'typo' });
  await rec('track', 'alice', 'track', { events: [{ name: 'session_start', props: { scene: 1, fromCard: 'none', hasShareTicket: false }, clientTs: 1 }] });
  await rec('track-empty', 'alice', 'track', { events: [] });

  // ---- rounds (target, ids and scores are random by design: structure only, plus the deterministic errors)
  const r = await rec('createRound', 'alice', 'createRound', { spectrumId: be.content.spectra[3].id }, 'shape');
  await rec('createRound-bad', 'alice', 'createRound', { spectrumId: 'nope' });
  await rec('draft-guest', 'bob', 'getRound', { roundId: r.roundId });
  await rec('setClue-notHost', 'bob', 'setClue', { roundId: r.roundId, clueMode: 'preset', clueItemId: be.content.spectra[3].items[0].id });
  await rec('setClue', 'alice', 'setClue', { roundId: r.roundId, clueMode: 'preset', clueItemId: be.content.spectra[3].items[2].id });
  await rec('setClue-twice-ok', 'alice', 'setClue', { roundId: r.roundId, clueMode: 'preset', clueItemId: be.content.spectra[3].items[3].id });
  await rec('setClue-chat-gone', 'alice', 'setClue', { roundId: r.roundId, clueMode: 'chat' });
  await rec('round-host-open', 'alice', 'getRound', { roundId: r.roundId }, 'shape');
  await rec('own-guess', 'alice', 'submitGuess', { roundId: r.roundId, pos: 5 });
  await rec('guess-bob', 'bob', 'submitGuess', { roundId: r.roundId, pos: 35, groupRef: refs.bob }, 'shape');
  await rec('guess-bob-again', 'bob', 'submitGuess', { roundId: r.roundId, pos: 36 });
  await rec('reveal-too-few', 'alice', 'revealRound', { roundId: r.roundId });
  await rec('guess-cara', 'cara', 'submitGuess', { roundId: r.roundId, pos: 60 }, 'shape');
  await rec('reveal-notHost', 'bob', 'revealRound', { roundId: r.roundId });
  await rec('reveal', 'alice', 'revealRound', { roundId: r.roundId }, 'shape');
  await rec('guess-late', 'dave', 'submitGuess', { roundId: r.roundId, pos: 5 }, 'shape');
  await rec('round-guest-revealed', 'cara', 'getRound', { roundId: r.roundId }, 'shape');
  await rec('group-with-round', 'alice', 'getGroupDay', { groupRef: refs.alice, dateKey: T1 }, 'shape');
  await rec('sub-no-template', 'bob', 'subscribeRound', { roundId: r.roundId });

  // ---- closing, 定分, archive
  be.clock.set(be.BJ(T2, 0, 20, 0));
  await rec('archiveDay-open', 'alice', 'getArchiveDay', { dateKey: T1 });
  await rec('daily-grace', 'alice', 'getDaily', {});
  be.clock.set(be.BJ(T2, 0, 31, 0));
  await rec('late', 'erin', 'submitCard', { dateKey: T1, idx: 1, pos: 5 });
  await rec('daily-t2', 'alice', 'getDaily', {});
  await rec('archive', 'alice', 'getArchive', {});
  await rec('archive-erin', 'erin', 'getArchive', { limit: 1 });
  await rec('archiveDay-alice', 'alice', 'getArchiveDay', { dateKey: T1 });
  await rec('archiveDay-erin', 'erin', 'getArchiveDay', { dateKey: T1 });
  await rec('group-closed', 'alice', 'getGroupDay', { groupRef: refs.alice, dateKey: T1 }, 'shape');
  await recT('finalize', 'finalizeDay');
  await recT('finalize-again', 'finalizeDay');
  await rec('daily-t2-final', 'alice', 'getDaily', {});
  await rec('archiveDay-final', 'alice', 'getArchiveDay', { dateKey: T1 });
  await rec('bonus', 'alice', 'getBonusCard', {}, 'shape');
  await rec('dist-closed', 'alice', 'unlockDistribution', { dateKey: T1 });
  await recT('genDaily', 'genDaily');
  await recT('genDaily-again', 'genDaily');
  await recT('sweep', 'sweepRounds');
  await rec('timer-as-client', 'alice', 'genDaily', {});
  return log;
}

test('mock server and cloud functions answer one scripted scenario identically', async () => {
  const mock = makeBackend('mock');
  const real = makeBackend('real');
  try {
    const a = await script(mock);
    const b = await script(real);
    assert.equal(a.length, b.length);
    assert.ok(a.length > 80, 'covers ' + a.length + ' calls');
    for (let i = 0; i < a.length; i++) assert.deepEqual(b[i], a[i], `step ${i} (${a[i][0]})`);
  } finally {
    mock.dispose();
    real.dispose();
    disposeStages();
  }
});

test('the scenario is also identical on the auto path (no schedule)', async () => {
  const mock = makeBackend('mock', { noSchedule: true });
  const real = makeBackend('real', { noSchedule: true });
  try {
    for (const be of [mock, real]) {
      be.log = [];
      for (const key of [T1, T2, '20261107']) {
        be.clock.set(be.BJ(key, 10, 0, 0));
        be.log.push((await be.call('alice', 'getDaily', {})).cards.map((c) => c.itemId));
        await playDay(be, 'alice', [10, 20, 30, 40, 50], null, key);
      }
      be.log.push((await be.timer('genDaily')).source);
    }
    assert.deepEqual(real.log, mock.log, 'same cards: both use core pickDay with the same seed and the same used set');
  } finally {
    mock.dispose();
    real.dispose();
  }
});
