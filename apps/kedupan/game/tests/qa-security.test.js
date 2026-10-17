'use strict';
// QA (independent) re-check after the security hardening (TD-62..68). Client side.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { getServerContent: getContent } = require('../core/content');
const { boot } = require('./harness');
const content = getContent();
const enter = (id) => ({ scene: 1007, query: { r: id } });
const ROOT = path.join(__dirname, '..');

async function ready(t, opts) {
  const h = await boot(t, opts);
  if (h.has('sheet:close')) await h.tap('sheet:close');
  return h;
}
function revealedRoundFor(h, host) {
  const sp = content.spectra[0];
  const r = h.srv.callAs(host, 'createRound', { spectrumId: sp.id });
  h.srv.callAs(host, 'setClue', { roundId: r.roundId, clueMode: 'preset', clueItemId: sp.items[0].id });
  for (let i = 0; i < 8; i++) h.srv.callAs('g' + i, 'submitGuess', { roundId: r.roundId, pos: 10 + i * 10 });
  return r.roundId;
}

test('QA L4: 直接看答案 then reopening the round later never offers a dead 先猜再看 (server refuses it with ROUND_EXPIRED) [QA-7]', async (t) => {
  const h = await ready(t);
  const id = revealedRoundFor(h, 'bob');
  await h.show(enter(id));
  assert.equal(h.view().vm.status, 'revealedUnplayed');
  await h.tap('round:view');
  assert.equal(h.view().vm.status, 'revealed');
  // the player leaves and opens the same round again (new round object, server remembers the view)
  await h.app.ctl.K.openRound(id, {});
  const st = h.view().vm.status;
  assert.equal(st, 'revealed', 'the server already served the answer; the screen must be the reveal, not 已揭晓 + a 先猜再看 that cannot work (got ' + st + ')');
});

test('QA-7: after a relaunch (fresh client state) the served round opens as the reveal, and a stale 先猜再看 (ROUND_EXPIRED) refreshes to it', async (t) => {
  const h = await ready(t);
  const id = revealedRoundFor(h, 'bob');
  await h.show(enter(id));
  assert.equal(h.view().vm.status, 'revealedUnplayed');
  // another device views the answer meanwhile; this screen still offers 先猜再看
  h.srv.callAs(h.srv.ME, 'getRound', { roundId: id, showAnswer: true });
  await h.tap('round:late');
  assert.equal(h.view().vm.status, 'open');
  await h.place(42);
  await h.tap('round:primary');
  assert.equal(h.view().vm.status, 'revealed');
  // relaunch: brand new harness state on the same server
  await h.app.ctl.K.openRound(id, {});
  assert.equal(h.view().vm.status, 'revealed');
});

test('QA L4: a late guess shows no score on any late row of the reveal', async (t) => {
  const h = await ready(t);
  const id = revealedRoundFor(h, 'bob');
  await h.show(enter(id));
  await h.tap('round:late');
  const r = h.srv.callAs(h.srv.ME, 'submitGuess', { roundId: id, pos: 42 });
  assert.equal(r.late, true);
  for (const row of r.reveal.rows.filter((x) => x[3] === 1)) assert.equal(row[2], null);
});

test('QA M2/DevTools: the server-only files are ignored exactly in release mode (dev state keeps them loadable for the mock)', () => {
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'project.config.json'), 'utf8'));
  const ign = cfg.packOptions.ignore.map((x) => x.value);
  const bc = fs.readFileSync(path.join(ROOT, 'js/build-config.js'), 'utf8');
  const release = /cloudEnv:\s*'[^']+'/.test(bc);
  for (const f of ['core/content/anchors.v1.js', 'core/content/schedule.v1.js']) {
    assert.equal(ign.includes(f), release, f + (release ? ' must be ignored in release' : ' must be loadable in dev'));
  }
});

test('QA M2: the client text library has only {id, text} per item', () => {
  const lib = require('../core/content/spectra.v1.js');
  for (const s of lib.spectra) for (const it of s.items) assert.deepEqual(Object.keys(it).sort(), ['id', 'text']);
});

test('QA L2: every analytics event the real client emits in a full session survives the server allowlist unchanged (no silent KPI loss)', async (t) => {
  const { BJ } = require('./harness');
  const EV = require('../core/events');
  const h = await ready(t, { now: BJ(2026, 11, 1, 10, 0, 0) });
  await h.seedDays(2, 0);
  await h.playDaily([20, 40, 60, 80, 50]);
  await h.tap('result:share');
  const id = revealedRoundFor(h, 'bob');
  await h.show(enter(id));
  await h.tap('round:late');
  await h.flush();
  const events = h.app.analytics.sent.concat(h.app.analytics.queue);
  const names = new Set(events.map((e) => e.name));
  for (const n of ['session_start', 'daily_card_place', 'daily_card_reveal', 'daily_complete', 'share_tap', 'round_view']) assert.ok(names.has(n), 'emitted ' + n);
  for (const e of events) {
    assert.deepEqual(EV.missingProps(e.name, e.props), [], e.name + ' misses a required prop');
    const kept = EV.sanitizeProps(e.name, e.props);
    assert.deepEqual(kept, e.props, e.name + ' loses props on the server: ' + JSON.stringify(Object.keys(e.props).filter((k) => !(k in kept))));
  }
});

test('QA I3: hostile entry queries never crash boot', async (t) => {
  for (const q of ['r=%', 'r=%00', 'r=' + '%41'.repeat(5000), 'r[]=x', '__proto__=1&r=%E0', 'r=a&r=%ZZ', 'g=%C0%AF', '=', '&&&', '%25%25']) {
    const h = await ready(t, { enter: { scene: 1001, query: q } });
    assert.ok(h.app.ctl.K.st.screen, q);
  }
  for (const q of [{ r: null }, { r: { a: 1 } }, { r: ['x'] }, { r: 5 }, { r: '' }, { s: 'x'.repeat(10000) }, null]) {
    const h = await ready(t, { enter: { scene: 1007, query: q } });
    assert.ok(h.app.ctl.K.st.screen, JSON.stringify(q));
  }
});
