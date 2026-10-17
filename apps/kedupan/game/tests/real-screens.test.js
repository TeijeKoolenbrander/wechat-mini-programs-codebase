'use strict';
// Real-screen integration: the real controller drives the REAL js/render/* modules through every screen and state, in the
// four display modes. Checks (render/CONTRACT.md, "Integration decisions"): every hit id a renderer returns is routed by
// logic; every property a renderer reads from a view model is set by the vm builders (recording proxy); no drawn text
// contains undefined / NaN / null; the renderer never falls back to the stub; ids drawn are listed in CONTRACT.md.
const test = require('node:test');
const assert = require('node:assert/strict');
const { getServerContent: getContent } = require('../core/content');
const { BJ } = require('./harness');
const { rig, check, scrollTo, OPTIONAL } = require('./real-rig');

const content = getContent();
const D1 = BJ(2026, 11, 1, 10, 0, 0);
const ADS = { adUnits: { rewarded: 'rw-1', interstitial: 'in-1' } };

async function tour(t, mode) {
  const h = await rig(t, { now: D1 }, mode);
  const C = (label) => check(h, (mode ? JSON.stringify(mode) : 'std') + ' ' + label);
  const tap = async (id, label) => {
    await scrollTo(h, id);
    await h.tap(id);
    return C(label || 'after ' + id);
  };

  C('home available');
  await tap('home:settings');
  await tap('settings:sound');
  await tap('settings:sound');
  await tap('sheet:close');
  await tap('home:howto');
  await tap('sheet:close');
  h.srv.offline = true;
  await h.show();
  C('home offline');
  h.srv.offline = false;
  await tap('home:retry');
  await h.seedDays(4, 3);
  C('home after seed');

  // daily card: coach, empty, placing, reveal with bullseye, report sheet, pending
  await tap('home:daily');
  C('card empty + coach');
  await h.place(50);
  C('card placing');
  const a0 = h.srv.db.sets[h.ctl.K.todayKey()].cards[0].anchor;
  await h.place(a0);
  await tap('card:primary', 'card revealed (bullseye)');
  await tap('card:report');
  await tap('report:cancel');
  await tap('card:primary');
  await h.place(30);
  h.srv.offline = true;
  await tap('card:primary', 'card pending');
  h.srv.offline = false;
  await tap('card:primary', 'card reveal after retry');
  await tap('card:primary');
  for (let i = 2; i < 5; i++) {
    await h.answer(20 * i);
    C('card ' + (i + 1));
    await h.tap('card:primary');
  }
  C('result');
  await tap('result:distribution', 'distribution sheet');
  await tap('sheet:close');
  await tap('result:bonus', 'bonus card');
  await h.answer(40);
  C('bonus reveal');
  await tap('card:primary', 'result again');
  await tap('result:group', 'group page without group');
  await tap('board:back');
  await tap('result:friends', 'friend board');
  await tap('board:back');
  await tap('result:back');

  // create + rounds
  await tap('home:host');
  await tap('create:swapFree');
  await tap('create:swapAd');
  await tap('create:spectrum:' + h.view().vm.spectra[0].id, 'create pickClue');
  await tap('create:tab:preset', 'create preset tab');
  await tap('create:clue:' + h.view().vm.clueOptions[0].itemId);
  await tap('create:clueSwap');
  await tap('create:clue:' + h.view().vm.clueOptions[0].itemId);
  await tap('create:share', 'host waiting');
  const rid = h.st.round.roundId;
  h.srv.callAs('r1', 'submitGuess', { roundId: rid, pos: 30 });
  h.srv.callAs('r2', 'submitGuess', { roundId: rid, pos: 70 });
  h.ctl.K.handlers['round:retry']();
  await h.settle();
  C('host waiting (can reveal)');
  await tap('round:reveal', 'round revealed');
  await tap('round:back');

  const sp = content.spectra[3];
  const mk = (who) => {
    const r = h.srv.callAs(who, 'createRound', { spectrumId: sp.id });
    h.srv.callAs(who, 'setClue', { roundId: r.roundId, clueMode: 'preset', clueItemId: sp.items[0].id });
    return r.roundId;
  };
  const open = mk('bob');
  await h.show({ scene: 1007, query: { r: open } });
  C('round open');
  await h.place(44);
  C('round placing');
  await tap('round:primary', 'round submitted');
  const done = mk('cat');
  for (let i = 0; i < 8; i++) h.srv.callAs('g' + i, 'submitGuess', { roundId: done, pos: 10 + i * 10 });
  await h.show({ scene: 1007, query: { r: done } });
  C('round revealedUnplayed');
  await tap('round:late');
  await h.place(20);
  await tap('round:primary', 'round late revealed');
  await h.show({ scene: 1007, query: { r: 'ABCDEFGH' } });
  C('round notFound');
  h.srv.offline = true;
  await h.show({ scene: 1007, query: { r: mk('bob') === '' ? 'ABCDEFGH' : 'BCDEFGHJ' } });
  C('round offline');
  h.srv.offline = false;
  const lone = mk('dan');
  h.advance(25 * 3600e3);
  await h.show({ scene: 1007, query: { r: lone } });
  C('round expired');
  await tap('round:daily');

  // archive: list, play, end, review
  await tap('home:archive');
  C('archive list');
  const items = h.view().vm.items;
  const played = items.find((x) => x.statusText.startsWith('已玩'));
  const fresh = items.find((x) => x.statusText.startsWith('未玩'));
  await tap('archive:item:' + played.dateKey, 'archive review');
  await tap('review:distribution', 'review distribution');
  await tap('sheet:close');
  await tap('review:back');
  try {
    await h.archiveSet(fresh.dateKey, [10, 30, 50, 70, 90]);
  } catch (e) {
    throw new Error(e.message + ' | screen ' + h.screen() + ' ids ' + h.ids().join(',') + ' play ' + JSON.stringify(h.st.play && { m: h.st.play.mode, i: h.st.play.idx, ph: h.st.play.phase }));
  }
  C('archive end');
  await tap('archive:distribution', 'archive distribution');
  await tap('sheet:close');
  await tap('archive:backList');
  h.srv.offline = true;
  await tap('archive:back');
  await tap('home:archive', 'archive cached offline');
  h.srv.offline = false;
  await tap('archive:back');

  // groups: a group entry with others, then every state
  await h.show({ scene: 1044, query: { s: 'g' }, shareTicket: 'TT' });
  C('group page');
  h.joinOther('u1');
  h.joinOther('u2');
  h.otherDaily('u1', [10, 20, 30, 40, 50]);
  h.otherDaily('u2', [15, 25, 35, 45, 55]);
  await tap('board:back');
  await tap('home:group', 'group page ready');
  C('group ready');
  await tap('board:back');
  return h;
}

for (const [name, mode] of [['standard', null], ['large text', { largeText: true, highContrast: false }], ['high contrast', { largeText: false, highContrast: true }], ['large + high contrast', { largeText: true, highContrast: true }]]) {
  test('real screens (' + name + '): every drawn hit id is routed, text is clean, vm properties are set', async (t) => {
    const h = await tour(t, mode);
    assert.deepEqual(h.problems, []);
    const bad = [...h.missing].filter((m) => !OPTIONAL.has(m.split('.').pop()));
    assert.deepEqual(bad, [], 'renderer read vm properties the builders did not set');
    assert.ok(h.drawn.size > 40, 'the tour reached many screens: ' + h.drawn.size);
  });
}
