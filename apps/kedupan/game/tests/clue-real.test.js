'use strict';
// End to end against the REAL mock server and the real core/clue.js (no test double): type a clue, a local rejection, the mock moderation
// word 测试违规 (risky), a pass, the share, a guesser sees it, a report, hidden for both views.
const test = require('node:test');
const assert = require('node:assert/strict');
const { boot } = require('./harness');
const core = require('../core/clue');

const enter = (roundId) => ({ scene: 1007, query: { r: roundId } });

test('real mock: type -> local reject -> risky -> pass -> share -> a guesser sees it -> report -> hidden for both views', async (t) => {
  const h = await boot(t);
  if (h.has('sheet:close')) await h.tap('sheet:close');
  await h.tap('home:host');
  await h.tap('create:spectrum:' + h.view().vm.spectra[0].id);
  const vm0 = h.view().vm;
  assert.equal(vm0.tab, 'text');
  const roundId = vm0.roundId;
  const { left, right } = vm0.chosen;
  const good = ['冬天的被窝', '一杯奶茶', '外婆家的饭', '千层饼'].find((x) => core.checkClue(x, { leftLabel: left, rightLabel: right }).ok);

  // the 发言规则 sheet, the real agreeRules
  await h.tap('create:input');
  assert.equal(h.view().vm.sheet, 'rules');
  await h.tap('rules:agree');
  assert.equal(h.view().vm.sheet, null);
  assert.equal(h.st.create.kbOpen, true);

  // local rejection: nothing reaches the server
  await h.kb.type('左边一点');
  h.advance(160);
  await h.settle();
  assert.equal(h.view().vm.textTab.reason, 'position');
  assert.equal(h.view().vm.canShare, false);
  assert.equal(h.srv.db.rounds[roundId].status, 'draft');

  // risky (the mock moderation word): blocked, text kept, nobody sees it
  await h.kb.type('测试违规');
  await h.tap('create:share');
  assert.equal(h.view().vm.textTab.hint, '这个提示没通过审核，换个说法吧');
  assert.equal(h.view().vm.textTab.text, '测试违规');
  assert.equal(h.srv.db.rounds[roundId].status, 'draft');
  assert.ok(!JSON.stringify(h.srv.callAs('bob', 'getRound', { roundId })).includes('测试违规'));

  // pass -> share
  await h.tap('create:input');
  await h.kb.type(good);
  await h.tap('create:share');
  await h.settle(20);
  assert.equal(h.log.shares.length, 1);
  assert.equal(h.log.shares[0].query, 'r=' + roundId);
  assert.ok(!JSON.stringify(h.log.shares).includes(good));
  assert.equal(h.srv.db.rounds[roundId].status, 'open');
  assert.equal(h.view().vm.status, 'hostWaiting');
  assert.equal(h.view().vm.clueText, '提示：「' + good + '」');
  assert.equal(h.view().vm.canReport, false);

  // another player sees the clue and reports it
  const bob = h.srv.callAs('bob', 'getRound', { roundId });
  assert.equal(bob.ok, true);
  assert.equal((bob.clue && bob.clue.text) || bob.clueText, good);
  const rep = h.srv.callAs('bob', 'reportClue', { roundId, reason: 'abuse' });
  assert.equal(rep.ok, true);

  // hidden for the host and for guessers
  h.ctl.K.handlers['round:retry']();
  await h.settle();
  assert.equal(h.view().vm.clueText, '你的提示被举报隐藏了，群友仍可继续猜');
  const bob2 = h.srv.callAs('bob', 'getRound', { roundId });
  assert.equal(bob2.clue.state, 'hidden');
  assert.equal(bob2.clue.text, null);
  const cat = h.srv.callAs('cat', 'getRound', { roundId });
  assert.equal(cat.clueText, null);
});

test('real mock: a guesser (the client) sees 提示：「…」 with 举报, reports it, and the clue turns into the placeholder', async (t) => {
  const h = await boot(t);
  if (h.has('sheet:close')) await h.tap('sheet:close');
  const sp = h.srv.callAs('bob', 'createRound', { spectrumId: 's001' });
  assert.equal(h.srv.callAs('bob', 'agreeRules', { rulesVersion: 1 }).ok, true);
  const set = h.srv.callAs('bob', 'setClue', { roundId: sp.roundId, clueMode: 'text', clueText: '冬天的被窝' });
  assert.equal(set.ok, true, JSON.stringify(set));
  await h.show(enter(sp.roundId));
  let vm = h.view().vm;
  assert.equal(vm.clueText, '提示：「冬天的被窝」');
  assert.equal(vm.canReport, true);
  await h.tap('round:report');
  await h.tap('clueReport:reason:porn');
  await h.tap('clueReport:submit');
  vm = h.view().vm;
  assert.equal(vm.clueText, '提示已被举报隐藏');
  assert.equal(vm.clueSubText, '凭感觉猜一猜，或回群里问问出题人');
  // the server agrees on the next read
  h.ctl.K.handlers['round:retry']();
  await h.settle();
  assert.equal(h.view().vm.clueText, '提示已被举报隐藏');
  assert.equal(h.view().vm.canReport, false);
  // guessing still works
  await h.place(40);
  await h.tap('round:primary');
  assert.equal(h.view().vm.status, 'submitted');
});
