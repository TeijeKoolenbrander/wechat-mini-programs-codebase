'use strict';
// Host rounds: the hidden target, clue rules, guess rules, the three reveal paths, subscribe messages.
const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createHarness, T0 } = require('./helpers/harness');

let h;
beforeEach(() => { h = createHarness({ now: T0 }); });
afterEach(() => h.teardown());

const HOUR = 3600e3;
const call = (fn, ev, openid) => h.call(fn, ev, { openid });
const SPEC = 's001';
const ITEM = 's001i03';

async function openRound(host = 'H', opts = {}) {
  const c = await call('createRound', { spectrumId: SPEC }, host);
  assert.equal(c.ok, true);
  const s = await call('setClue', { roundId: c.roundId, clueMode: opts.chat ? 'chat' : 'preset', ...(opts.chat ? {} : { clueItemId: ITEM }) }, host);
  assert.equal(s.ok, true, JSON.stringify(s));
  return c;
}
const guess = (roundId, openid, pos, extra = {}) => call('submitGuess', { roundId, pos, ...extra }, openid);

test('createRound: target 5-95 roughly uniform over 10,000 draws; only the host gets it (AC 26)', async () => {
  const crypto = require('crypto');
  const util = h.mod('createRound', ['common', 'util.js']);
  const bins = new Array(10).fill(0);
  let min = 999; let max = -1;
  for (let i = 0; i < 10000; i++) {
    const t = util.randomIntInclusive(5, 95);
    min = Math.min(min, t); max = Math.max(max, t);
    bins[Math.min(9, Math.floor((t - 5) / 9.1))]++;
  }
  assert.ok(min >= 5 && max <= 95);
  assert.ok(min <= 6 && max >= 94, 'both ends are reachable');
  for (const b of bins) assert.ok(b >= 800 && b <= 1200, `decile ${b}`);
  assert.ok(crypto);
  const c = await call('createRound', { spectrumId: SPEC }, 'H');
  assert.ok(c.target >= 5 && c.target <= 95 && Number.isInteger(c.target));
  assert.match(c.roundId, /^[A-Z2-7]{8}$/);
});

test('createRound validates the spectrum and rate limits to 20 a day (AC 35)', async () => {
  assert.equal((await call('createRound', { spectrumId: 's999' }, 'H')).code, 'INVALID_INPUT');
  assert.equal((await call('createRound', { spectrumId: 'x' }, 'H')).code, 'INVALID_INPUT');
  assert.equal((await call('createRound', {}, 'H')).code, 'INVALID_INPUT');
  for (let i = 0; i < 20; i++) assert.equal((await call('createRound', { spectrumId: SPEC }, 'H')).ok, true);
  assert.equal((await call('createRound', { spectrumId: SPEC }, 'H')).code, 'RATE_LIMITED');
  assert.equal((await call('createRound', { spectrumId: SPEC }, 'H2')).ok, true);
  h.advance(25 * HOUR);
  assert.equal((await call('createRound', { spectrumId: SPEC }, 'H')).ok, true, 'new Beijing day, new quota');
});

test('setClue: host only, item must belong to the round spectrum, chat mode carries no text (AC 28)', async () => {
  const c = await call('createRound', { spectrumId: SPEC }, 'H');
  assert.equal((await call('setClue', { roundId: c.roundId, clueMode: 'preset', clueItemId: ITEM }, 'X')).code, 'ROUND_NOT_FOUND', 'drafts are invisible to others');
  assert.equal((await call('setClue', { roundId: c.roundId, clueMode: 'preset', clueItemId: 's002i01' }, 'H')).code, 'INVALID_INPUT');
  assert.equal((await call('setClue', { roundId: c.roundId, clueMode: 'preset' }, 'H')).code, 'INVALID_INPUT');
  assert.equal((await call('setClue', { roundId: c.roundId, clueMode: 'text', clueText: 'hi' }, 'H')).code, 'INVALID_INPUT');
  assert.equal((await call('setClue', { roundId: c.roundId, clueMode: 'chat', clueItemId: ITEM }, 'H')).code, 'INVALID_INPUT');
  const ok = await call('setClue', { roundId: c.roundId, clueMode: 'preset', clueItemId: ITEM, clueText: 'attacker text' }, 'H');
  assert.equal(ok.ok, true);
  const r = h.db.all('rounds')[0];
  assert.equal(r.status, 'open');
  assert.equal(r.clueText, h.mod('setClue', ['common', 'coreapi.js']).getItem(ITEM).text, 'clue text is the curated copy, never client text');
  // a non-host cannot change an open round's clue
  assert.equal((await call('setClue', { roundId: c.roundId, clueMode: 'chat' }, 'X')).code, 'NOT_HOST');
});

test('getRound never returns the target to a non-host before the reveal (AC 26, 30)', async () => {
  const c = await openRound();
  const target = c.target;
  await guess(c.roundId, 'G1', 50);
  const g = await call('getRound', { roundId: c.roundId }, 'G1');
  assert.equal(g.ok, true);
  assert.equal(g.target, undefined);
  assert.equal(g.rows, undefined);
  assert.deepEqual(g.myGuess, { pos: 50, late: false });
  assert.equal(g.guessCount, 1);
  const stranger = await call('getRound', { roundId: c.roundId }, 'Z');
  assert.equal(stranger.target, undefined);
  assert.doesNotMatch(JSON.stringify([g, stranger]), /hostOpenid|"H"|G1/);
  const host = await call('getRound', { roundId: c.roundId }, 'H');
  assert.equal(host.target, target);
  assert.equal(host.isHost, true);
});

test('submitGuess responses never leak the target before the reveal', async () => {
  const c = await openRound();
  const r = await guess(c.roundId, 'G1', 50);
  assert.equal(r.ok, true);
  assert.equal(r.reveal, undefined);
  assert.equal(JSON.stringify(r).includes('target'), false);
});

test('submitGuess rules: one per user, host rejected, 0-100 integer, unknown round, expired after 7 days (AC 31)', async () => {
  const c = await openRound();
  assert.equal((await guess(c.roundId, 'H', 50)).code, 'OWN_ROUND');
  for (const pos of [-1, 101, 5.5, '5', null]) assert.equal((await guess(c.roundId, 'G', pos)).code, 'INVALID_INPUT');
  assert.equal((await guess('AAAAAAAA', 'G', 50)).code, 'ROUND_NOT_FOUND');
  assert.equal((await guess('bad', 'G', 50)).code, 'INVALID_INPUT');
  assert.equal((await guess(c.roundId, 'G', 50)).ok, true);
  assert.equal((await guess(c.roundId, 'G', 60)).code, 'ALREADY_GUESSED');
  assert.equal(h.db.all('guesses').length, 1);
  assert.equal(h.db.all('rounds')[0].guessCount, 1);
  h.advance(7 * 24 * HOUR + 1000);
  assert.equal((await guess(c.roundId, 'LATE', 50)).code, 'ROUND_EXPIRED');
});

test('a draft is ROUND_NOT_FOUND for guessers; after 30 min even for the host; sweep discards it (AC 34)', async () => {
  const c = await call('createRound', { spectrumId: SPEC }, 'H');
  assert.equal((await guess(c.roundId, 'G', 50)).code, 'ROUND_NOT_FOUND');
  assert.equal((await call('getRound', { roundId: c.roundId }, 'G')).code, 'ROUND_NOT_FOUND');
  assert.equal((await call('getRound', { roundId: c.roundId }, 'H')).ok, true);
  h.advance(31 * 60e3);
  assert.equal((await call('getRound', { roundId: c.roundId }, 'H')).code, 'ROUND_NOT_FOUND');
  const s = await h.call('sweepRounds', {});
  assert.equal(s.draftsRemoved, 1);
  assert.equal(h.db.all('rounds').length, 0);
});

test('reveal by the host needs >= 2 on-time guesses; idempotent; mq = rounded mean of on-time scores; 最懂你 (AC 32, 33, 6)', async () => {
  const c = await openRound();
  const target = h.db.all('rounds')[0].target;
  await guess(c.roundId, 'G1', Math.min(100, target + 10)); // d 10 -> 75
  const tooFew = await call('revealRound', { roundId: c.roundId }, 'H');
  assert.equal(tooFew.code, 'TOO_FEW_GUESSES');
  assert.equal((await call('revealRound', { roundId: c.roundId }, 'G1')).code, 'NOT_HOST');
  await guess(c.roundId, 'G2', target); // d 0 -> 100
  const rev = await call('revealRound', { roundId: c.roundId }, 'H');
  assert.equal(rev.ok, true);
  const d1 = Math.min(100, target + 10) - target;
  const expect = Math.round((Math.max(0, 100 - Math.ceil(2.5 * d1)) + 100) / 2);
  assert.equal(rev.reveal.mq, expect);
  assert.equal(rev.reveal.target, target);
  assert.equal(rev.reveal.rows.length, 3, 'host row + 2 guesses');
  assert.equal(rev.reveal.rows[0][4], true);
  assert.equal(rev.reveal.rows[0][2], null, 'the host row has no score');
  assert.equal(rev.reveal.bestH, rev.reveal.rows.find((r) => r[1] === target)[0]);
  assert.doesNotMatch(JSON.stringify(rev), /"G1"|"G2"|"H"|openid/);
  const again = await call('revealRound', { roundId: c.roundId }, 'H');
  assert.equal(again.ok, true);
  assert.equal(again.reveal.mq, rev.reveal.mq);
  assert.equal(h.db.all('events').filter((e) => e.name === 'round_reveal').length, 1, 'one reveal side effect');
});

test('最懂你 tie goes to the earliest guess (AC 6)', async () => {
  const c = await openRound();
  const target = h.db.all('rounds')[0].target;
  const lo = Math.max(0, target - 5);
  const hi = Math.min(100, target + 5);
  await guess(c.roundId, 'FIRST', hi);
  h.advance(1000);
  await guess(c.roundId, 'SECOND', hi); // same position, later ts
  const rev = await call('revealRound', { roundId: c.roundId }, 'H');
  const helper = h.mod('revealRound', ['common', 'rounds.js']);
  assert.equal(rev.reveal.bestH, helper.hashOf('FIRST', h.db.all('rounds')[0].salt));
  assert.ok(lo <= hi);
});

test('the 8th on-time guess reveals automatically; the 9th becomes late and is excluded (PD-8, AC 32)', async () => {
  const c = await openRound();
  const target = h.db.all('rounds')[0].target;
  let last;
  for (let i = 1; i <= 7; i++) last = await guess(c.roundId, `G${i}`, 50);
  assert.equal(last.reveal, undefined);
  const eighth = await guess(c.roundId, 'G8', 50);
  assert.equal(eighth.late, false);
  assert.equal(eighth.reveal.status, 'revealed');
  assert.equal(eighth.reveal.target, target);
  const ninth = await guess(c.roundId, 'G9', 5);
  assert.equal(ninth.late, true);
  assert.equal(ninth.reveal.target, target);
  const round = h.db.all('rounds')[0];
  assert.equal(round.revealBy, 'count');
  assert.equal(round.guessCount, 8);
  const expected = Math.round(8 * Math.max(0, 100 - Math.ceil(2.5 * Math.abs(50 - target))) / 8);
  assert.equal(round.mq, expected, 'late guess excluded from 默契值');
  const reveal = await call('getRound', { roundId: c.roundId }, 'G9');
  assert.equal(reveal.rows.filter((r) => r[3] === true).length, 1);
});

test('concurrent 8th guesses produce exactly one reveal and notification (AC 32, 63)', async () => {
  h.db.put('app_config', { _id: 'live', subscribe: { tmplId: 'TPL', fields: { topic: 'thing1', result: 'thing2', time: 'time3' } } });
  const c = await openRound();
  for (let i = 1; i <= 6; i++) await guess(c.roundId, `G${i}`, 40);
  assert.equal((await call('subscribeRound', { roundId: c.roundId }, 'G1')).granted, true);
  await Promise.all([guess(c.roundId, 'G7', 40), guess(c.roundId, 'G8', 40), guess(c.roundId, 'G9', 40)]);
  const round = h.db.all('rounds')[0];
  assert.equal(round.status, 'revealed');
  assert.equal(round.guessCount, 8);
  assert.equal(h.db.all('events').filter((e) => e.name === 'round_reveal').length, 1);
  assert.equal(h.sent.length, 1);
  assert.equal(h.db.all('guesses').filter((g) => g.late).length, 1);
});

test('after 24 h: a round with guesses reveals lazily (and by the sweep); one with none becomes noGuesses (PD-8)', async () => {
  const a = await openRound('H1');
  const b = await openRound('H2');
  await guess(a.roundId, 'G1', 30);
  h.advance(24 * HOUR + 1000);
  const view = await call('getRound', { roundId: a.roundId }, 'G1');
  assert.equal(view.status, 'revealed');
  assert.equal(h.db.all('rounds').find((r) => r._id === a.roundId).revealBy, 'timer');
  const sw = await h.call('sweepRounds', {});
  assert.equal(sw.noGuesses, 1);
  assert.equal(h.db.all('rounds').find((r) => r._id === b.roundId).status, 'noGuesses');
  assert.equal((await guess(b.roundId, 'G9', 50)).code, 'ROUND_EXPIRED');
  const again = await h.call('sweepRounds', {});
  assert.equal(again.revealed + again.noGuesses, 0, 'idempotent');
  assert.equal((await h.call('sweepRounds', {}, { openid: 'x' })).code, 'FORBIDDEN');
});

test('a guess after 24 h on a still-open round is stored late (the lazy reveal happens first)', async () => {
  const c = await openRound();
  await guess(c.roundId, 'G1', 30);
  h.advance(25 * HOUR);
  const r = await guess(c.roundId, 'G2', 99);
  assert.equal(r.late, true);
  assert.equal(r.reveal.status, 'revealed');
  assert.equal(h.db.all('rounds')[0].guessCount, 1);
});

test('groupRefs: only a groupRef the guesser belongs to is recorded, max 10 (spec 11.2)', async () => {
  const c = await openRound();
  const mk = (n) => `${n}`.repeat(16).slice(0, 16);
  h.db.put('group_members', { _id: 'OG_G1', openGId: 'OG', openid: 'G1', groupRef: mk('a'), firstSeen: '1', lastSeen: '1' });
  await guess(c.roundId, 'G1', 10, { groupRef: mk('a') });
  await guess(c.roundId, 'G2', 10, { groupRef: mk('b') }); // not a member: ignored
  assert.deepEqual(h.db.all('rounds')[0].groupRefs, [mk('a')]);
  assert.equal(h.db.all('guesses').find((g) => g.openid === 'G2').groupRef, undefined);
});

test('subscribe flow: no template -> NO_TEMPLATE; one grant per (round, user); one message per grant; no names (AC 62, 63)', async () => {
  const c = await openRound();
  assert.equal((await call('subscribeRound', { roundId: c.roundId }, 'H')).code, 'NO_TEMPLATE');
  h.db.put('app_config', { _id: 'live', subscribe: { tmplId: 'TPL', fields: { topic: 'thing1', result: 'thing2', time: 'time3' } } });
  h.mod('subscribeRound', ['common', 'store.js']).resetAppConfigCache();
  const store = h.mod('revealRound', ['common', 'store.js']); store.resetAppConfigCache();
  assert.equal((await call('subscribeRound', { roundId: c.roundId }, 'stranger')).code, 'FORBIDDEN');
  assert.equal((await call('subscribeRound', { roundId: c.roundId }, 'H')).granted, true);
  assert.equal((await call('subscribeRound', { roundId: c.roundId }, 'H')).granted, true);
  await guess(c.roundId, 'G1', 50);
  await call('subscribeRound', { roundId: c.roundId }, 'G1');
  await guess(c.roundId, 'G2', 55);
  assert.equal(h.db.all('sub_grants').length, 2);
  await call('revealRound', { roundId: c.roundId }, 'H');
  assert.equal(h.sent.length, 2);
  assert.deepEqual(h.sent.map((m) => m.touser).sort(), ['G1', 'H']);
  for (const m of h.sent) {
    assert.equal(m.templateId, 'TPL');
    assert.equal(m.page, `index?r=${c.roundId}`);
    assert.match(m.data.thing2.value, /^本题默契值 \d+$/);
    assert.doesNotMatch(JSON.stringify(m.data), /G1|G2/);
  }
  // sweep / a second reveal path never sends again
  await h.call('sweepRounds', {});
  await call('revealRound', { roundId: c.roundId }, 'H');
  assert.equal(h.sent.length, 2);
  // granting after the reveal is a no-op
  assert.equal((await call('subscribeRound', { roundId: c.roundId }, 'G2')).granted, false);
});

test('a failed send is recorded on the grant and never retried (at most one message per grant)', async () => {
  h.db.put('app_config', { _id: 'live', subscribe: { tmplId: 'TPL', fields: { topic: 'a', result: 'b', time: 'c' } } });
  const c = await openRound();
  await call('subscribeRound', { roundId: c.roundId }, 'H');
  await guess(c.roundId, 'G1', 50);
  await guess(c.roundId, 'G2', 50);
  h.setSendError(43101);
  await call('revealRound', { roundId: c.roundId }, 'H');
  const g = h.db.all('sub_grants')[0];
  assert.equal(g.used, true);
  assert.equal(g.sendErrCode, '43101');
  h.setSendError(null);
  await h.call('sweepRounds', {});
  assert.equal(h.sent.length, 0);
});

test('reportCard: whitelist reasons, no text, <= 10 a day (AC 79)', async () => {
  const item = 's001i03';
  assert.equal((await call('reportCard', { itemId: item, reason: 'rude' }, 'A')).code, 'INVALID_INPUT');
  assert.equal((await call('reportCard', { itemId: 'nope', reason: 'typo' }, 'A')).code, 'INVALID_INPUT');
  assert.equal((await call('reportCard', { itemId: 's999i01', reason: 'typo' }, 'A')).code, 'INVALID_INPUT');
  for (let i = 0; i < 10; i++) assert.equal((await call('reportCard', { itemId: item, reason: 'typo', text: 'free text' }, 'A')).ok, true);
  assert.equal((await call('reportCard', { itemId: item, reason: 'typo' }, 'A')).code, 'RATE_LIMITED');
  const doc = h.db.all('card_reports')[0];
  assert.deepEqual(Object.keys(doc).sort(), ['_id', 'dateKey', 'itemId', 'openid', 'reason', 'ts']);
});
