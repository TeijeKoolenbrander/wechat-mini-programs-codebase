'use strict';
// AC 72: every network-backed screen shows its error state with 重试 and never traps the player.
const test = require('node:test');
const assert = require('node:assert/strict');
const { getServerContent: getContent } = require('../core/content');
const { boot, BJ } = require('./harness');

const content = getContent();

test('AC 72: offline, each network-backed screen offers 重试 (and a way back); retrying online recovers it', async (t) => {
  const h = await boot(t, { now: BJ(2026, 11, 1, 10, 0, 0), enter: { scene: 1044, query: { s: 'd' }, shareTicket: 'T' } });
  if (h.has('sheet:close')) await h.tap('sheet:close');
  await h.seedDays(3, 0);
  await h.playDaily([10, 20, 30, 40, 50]);
  await h.tap('result:back');

  // home
  h.srv.offline = true;
  await h.show();
  assert.equal(h.view().vm.daily.state, 'offline');
  assert.ok(h.has('home:retry') && h.has('home:archive'));
  h.srv.offline = false;
  await h.tap('home:retry');
  assert.equal(h.view().vm.daily.state, 'done');

  // archive list (no cache yet), then review
  h.srv.offline = true;
  await h.tap('home:archive');
  assert.equal(h.view().vm.state, 'offline');
  assert.ok(h.has('archive:retry') && h.has('archive:back'));
  h.srv.offline = false;
  await h.tap('archive:retry');
  assert.equal(h.view().vm.state, 'ready');
  const played = h.view().vm.items.find((i) => i.statusText.startsWith('已玩'));
  if (played) {
    h.srv.offline = true;
    await h.tap('archive:item:' + played.dateKey);
    assert.equal(h.view().vm.state, 'error');
    assert.ok(h.has('review:retry') && h.has('review:back'));
    h.srv.offline = false;
    await h.tap('review:retry');
    assert.equal(h.view().vm.state, 'ready');
  }
  await h.tap(h.has('review:back') ? 'review:back' : 'archive:back');
  if (h.screen() === 'archive') await h.tap('archive:back');

  // create
  await h.tap('home:host');
  h.srv.offline = true;
  await h.tap('create:spectrum:' + h.view().vm.spectra[0].id);
  assert.equal(h.view().vm.step, 'error');
  assert.ok(h.has('create:retry') && h.has('create:back'));
  h.srv.offline = false;
  await h.tap('create:retry');
  assert.equal(h.view().vm.step, 'pickClue');
  await h.tap('create:back');

  // round entry
  const r = h.srv.callAs('bob', 'createRound', { spectrumId: content.spectra[0].id });
  h.legacyChat('bob', r.roundId);
  h.srv.offline = true;
  await h.show({ scene: 1007, query: { r: r.roundId } });
  assert.equal(h.view().vm.status, 'offline');
  assert.ok(h.has('round:retry') && h.has('round:back'));
  h.srv.offline = false;
  await h.tap('round:retry');
  assert.equal(h.view().vm.status, 'open');
  await h.tap('round:home');

  // group page and friend board
  h.srv.offline = true;
  await h.tap('home:group');
  assert.equal(h.view().vm.state, 'serverError');
  assert.ok(h.has('board:retry') && h.has('board:back'));
  h.srv.offline = false;
  await h.tap('board:retry');
  assert.notEqual(h.view().vm.state, 'serverError');
  await h.tap('board:back');
  h.srv.offline = true;
  await h.tap('home:friends');
  assert.equal(h.view().vm.state, 'serverError');
  h.srv.offline = false;
  await h.tap('board:retry');
  assert.equal(h.view().vm.state, 'ready');
  await h.tap('board:back');
  assert.equal(h.screen(), 'home');
});
