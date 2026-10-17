'use strict';
// Shared helpers for the mock-server tests.
const { createMockServer } = require('../js/mock-server');
const { createContent } = require('../core/content');
const { buildSchedule } = require('../core/schedule');
const { dateKeyToMs } = require('../core/date');
const { mulberry32 } = require('../core/rng');
const raw = require('./fixtures/spectra.fixture');

const content = createContent(raw);
const LAUNCH = '20261101';
const schedule = buildSchedule(content, { launchKey: LAUNCH, days: 40 }).schedule;

/** epoch ms of h:m:s Beijing time on a date key */
const BJ = (key, h, m, s) => dateKeyToMs(key) + (((h || 0) * 60 + (m || 0)) * 60 + (s || 0)) * 1000;

function setup(o) {
  o = o || {};
  let t = BJ(o.date || '20261105', 10, 0, 0);
  const clock = {
    now: () => t,
    set: (ms) => {
      t = ms;
    },
    add: (ms) => {
      t += ms;
    },
  };
  const rng = mulberry32(99);
  const srv = createMockServer({ now: clock.now, content, schedule: o.noSchedule ? null : schedule, launchKey: LAUNCH, random: rng, rateLimits: !!o.limits, appConfig: o.appConfig || null });
  return { srv, clock };
}

/** Answer all five cards of the current day as `openid` at the given positions; returns the responses. */
function playDay(srv, openid, positions, extra) {
  const d = srv.callAs(openid, 'getDaily', {});
  const out = [];
  for (let i = 0; i < 5; i++) out.push(srv.callAs(openid, 'submitCard', { dateKey: d.dateKey, idx: i, pos: positions[i], ...(extra || {}) }));
  return out;
}

/** Every string in a JSON value (keys and values) - used to prove nothing leaks. */
function allStrings(x, acc) {
  acc = acc || [];
  if (typeof x === 'string') acc.push(x);
  else if (Array.isArray(x)) x.forEach((v) => allStrings(v, acc));
  else if (x && typeof x === 'object') {
    Object.keys(x).forEach((k) => {
      acc.push(k);
      allStrings(x[k], acc);
    });
  }
  return acc;
}

/**
 * A legacy `clueMode: 'chat'` round (stored before D-2; setClue can no longer create one): the draft is opened by writing the round
 * document directly. Returns the round id.
 */
function legacyChat(srv, openid, roundId) {
  const r = srv.db.rounds[roundId];
  r.status = 'open';
  r.clueMode = 'chat';
  r.clueItemId = null;
  r.clueText = null;
  void openid;
  return roundId;
}

module.exports = { legacyChat, content, schedule, setup, playDay, BJ, LAUNCH, allStrings, raw };
