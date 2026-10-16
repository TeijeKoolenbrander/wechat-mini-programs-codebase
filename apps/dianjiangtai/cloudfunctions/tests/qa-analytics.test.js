'use strict';
// QA: AC 52 (the four go/kill metrics computable from the `events` collection, spec 15 definitions),
// run against events written through the real `track` function in the shape the game client sends
// (see game/js/analytics.js flush: {name, props:{sessionId,...}, clientTs}).
const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createHarness } = require('./helpers/harness');

const T0 = Date.UTC(2026, 10, 3, 4, 0, 0); // 20261103 12:00 BJT
let h;
beforeEach(() => { h = createHarness({ now: T0 }); });
afterEach(() => h.teardown());

const BJT = 8 * 3600e3;
const dayOf = (ms) => new Date(ms + BJT).toISOString().slice(0, 10).replace(/-/g, '');

// ---- the four metric queries (QA deliverable for AC 52); `events` = array of event docs ----
const M = {
  shareRate(events) {
    const shared = new Set(events.filter((e) => e.name === 'share_tap' && ['result', 'challenge'].includes(e.props.kind) && e.props.runId).map((e) => e.props.runId));
    const done = events.filter((e) => e.name === 'run_complete').length;
    return done ? shared.size / done : null;
  },
  cardOpenToPlay(events) {
    const opens = events.filter((e) => e.name === 'card_open');
    const starts = events.filter((e) => e.name === 'run_start');
    const hit = opens.filter((o) => starts.some((s) => s.openid === o.openid && s.props.sessionId === o.props.sessionId && s.ts >= o.ts));
    return opens.length ? hit.length / opens.length : null;
  },
  runsPerSession(events) {
    const sessions = new Set(events.filter((e) => e.name === 'run_start').map((e) => e.openid + '|' + e.props.sessionId));
    const done = events.filter((e) => e.name === 'run_complete').length;
    return sessions.size ? done / sessions.size : null;
  },
  d1(events, dayN) {
    const first = {};
    const days = {};
    for (const e of events.filter((x) => x.name === 'session_start').sort((a, b) => a.ts - b.ts)) {
      first[e.openid] = first[e.openid] || dayOf(e.ts);
      (days[e.openid] = days[e.openid] || new Set()).add(dayOf(e.ts));
    }
    const next = dayOf(Date.UTC(+dayN.slice(0, 4), +dayN.slice(4, 6) - 1, +dayN.slice(6, 8)) + 86400000 - BJT + 3600e3);
    const cohort = Object.keys(first).filter((o) => first[o] === dayN);
    return cohort.length ? cohort.filter((o) => days[o].has(next)).length / cohort.length : null;
  },
};

async function send(openid, name, props) {
  const r = await h.call('track', { events: [{ name, props, clientTs: h.now() }] }, { openid });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.accepted, 1, name);
  h.advance(1000);
}

test('AC 52: share rate, card-open-to-play, runs-per-session and D1 are computable from the events collection', async () => {
  // user A: session s1: card_open -> run_start -> 2 runs complete, one shared
  await send('A', 'session_start', { sessionId: 's1', fromCard: 'result' });
  await send('A', 'card_open', { sessionId: 's1', cardKind: 'result' });
  await send('A', 'run_start', { sessionId: 's1', runId: 'run-0001', mode: 'free' });
  await send('A', 'run_complete', { sessionId: 's1', runId: 'run-0001', mode: 'free', wins: 7 });
  await send('A', 'share_tap', { sessionId: 's1', runId: 'run-0001', kind: 'result' });
  await send('A', 'run_start', { sessionId: 's1', runId: 'run-0002', mode: 'free' });
  await send('A', 'run_complete', { sessionId: 's1', runId: 'run-0002', mode: 'free', wins: 5 });
  // group_invite / menu share taps must NOT count toward the share rate
  await send('A', 'share_tap', { sessionId: 's1', kind: 'group_invite' });
  // user B: card_open but never plays; one session
  await send('B', 'session_start', { sessionId: 's2', fromCard: 'challenge' });
  await send('B', 'card_open', { sessionId: 's2', cardKind: 'challenge' });
  // user C: plays 1 run in a session, no share
  await send('C', 'session_start', { sessionId: 's3', fromCard: 'none' });
  await send('C', 'run_start', { sessionId: 's3', runId: 'run-0003', mode: 'free' });
  await send('C', 'run_complete', { sessionId: 's3', runId: 'run-0003', mode: 'free', wins: 6 });
  // next Beijing day: A and C return, B does not
  h.setNow(Date.UTC(2026, 10, 4, 4, 0, 0));
  await send('A', 'session_start', { sessionId: 's4', fromCard: 'none' });
  await send('C', 'session_start', { sessionId: 's5', fromCard: 'none' });

  const events = h.db.all('events');
  assert.equal(M.shareRate(events), 1 / 3);          // r1 shared of 3 completed runs
  assert.equal(M.cardOpenToPlay(events), 1 / 2);     // A's card led to a run, B's did not
  assert.equal(M.runsPerSession(events), 3 / 2);     // 3 runs over the 2 sessions that started a run (s1, s3)
  assert.equal(M.d1(events, '20261103'), 2 / 3);     // A, C return; B not
});

test('events keep the session id the metric queries need, at the top level too',
  async () => {
    await send('A', 'run_start', { sessionId: 'sess-123', runId: 'run-0009', mode: 'free' });
    const e = h.db.all('events')[0];
    assert.equal(e.sessionId, 'sess-123');
  });
