'use strict';
/**
 * Boots the whole game against a fake wx and plays it headlessly with touches: a ranked daily
 * by taps only, typing, the hint ladder, the archive and practice, share entry, offline,
 * privacy denied, boards, ads and analytics.
 */
const test = require('node:test');
const assert = require('node:assert');
const { boot, tapAndSettle } = require('./harness');

const TODAY = 'd20261120'; // answer 月亮 (synonym 月球) on the default test clock
const events = (g) => g.app.api.mock.db.events.concat(g.app.analytics.queue);
const names = (g) => events(g).map((e) => e.name);
const count = (g, n) => names(g).filter((x) => x === n).length;
const guessCalls = (g) => g.server.calls.filter((c) => c.name === 'guess');

async function startUp(t, opts) {
  const g = boot(t, opts);
  await g.settle();
  return g;
}

async function startDaily(g) {
  if (g.has('sheet:close')) g.tapId('sheet:close');
  await tapAndSettle(g, 'home:daily');
  assert.equal(g.view().screen, 'play');
}

/** Finish the reveal transition after a solve/give-up. */
async function toReveal(g) {
  g.wait(1500);
  g.frame();
  await g.settle();
  assert.equal(g.view().screen, 'reveal', 'screen ' + g.view().screen);
}

/** Type a vocabulary word through the native keyboard and confirm it. */
async function typeGuess(g, word) {
  g.wait(350);
  g.type(word);
  g.confirm(word);
  await g.settle();
}

/** Words far from the answer (never the answer or a synonym), farthest first. */
function farWords(g, puzzleId, n) {
  const ans = g.server.answerOf(puzzleId);
  const syn = ans === '月亮' ? ['月球'] : [];
  const out = [];
  for (let r = g.server.V; out.length < n && r > 2; r--) {
    const w = g.server.wordAtRank(puzzleId, r);
    if (w && w !== ans && !syn.includes(w)) out.push(w);
  }
  return out;
}

test('boots to home, how-to opens once, no prompts at launch, share menu set up (AC 77, 101, 105)', async (t) => {
  const g = await startUp(t);
  const text = g.frame();
  assert.ok(text.includes('今日一词') && text.includes('玩法'), text.slice(0, 200));
  assert.ok(g.has('sheet:close'), 'how-to sheet auto-opens once');
  assert.deepEqual(g.view().vm.howto.lines.length, 3);
  g.tapId('sheet:close');
  assert.ok(!g.has('sheet:close'));
  assert.ok(g.has('home:daily') && g.has('home:archive') && g.has('home:groupBoard') && g.has('home:friendBoard'));
  for (const c of g.log.calls) assert.ok(!/requirePrivacyAuthorize|authorize|setUserCloudStorage/.test(c), 'no prompt at launch: ' + c);
  assert.ok(g.log.menu.some((m) => m[0] === 'showShareMenu' && m[1].menus[0] === 'shareAppMessage'));
  assert.ok(g.log.menu.some((m) => m[0] === 'updateShareMenu' && m[1].withShareTicket === true && m[1].isUpdatableMessage === undefined));
  assert.equal(count(g, 'session_start'), 1);
  // the how-to does not auto-open again after a restart
  const g2 = await startUp(t, { storage: g.storage });
  assert.ok(!g2.has('sheet:close'));
});

test('home: unavailable, offline and error states offer the right action (AC 94)', async (t) => {
  const g = await startUp(t);
  g.tapId('sheet:close');
  g.server.bankEmpty = true;
  g.ctl.state.home.daily = { state: 'loading' };
  g.app.invalidate();
  await g.ctl.start({}).catch(() => {});
  await g.settle();
  let d = g.view().vm.daily;
  assert.equal(d.state, 'unavailable');
  assert.equal(d.sub, '今日一词暂未发布');
  assert.equal(d.primary.label, '练习一题');
  assert.ok(g.has('home:practice'));
  g.server.bankEmpty = false;
  g.server.offline = true;
  await tapAndSettle(g, 'home:practice'); // offline: opening a puzzle fails, staying on play with a retry
  assert.equal(g.view().screen, 'play');
  assert.equal(g.view().vm.state, 'offline');
  g.server.offline = false;
  await tapAndSettle(g, 'play:retry');
  assert.equal(g.view().vm.state, 'ready');
  assert.equal(g.view().vm.kind, 'practice');
});

test('offline at launch: home shows the offline state, retry recovers; the how-to still opens (edge 1)', async (t) => {
  const g = boot(t);
  g.server.offline = true;
  await g.ctl.start({});
  await g.settle();
  const d = g.view().vm.daily;
  assert.equal(d.state, 'offline');
  assert.equal(d.sub, '今日一词需联网获取');
  assert.equal(d.primary.label, '重试');
  g.tapId('sheet:close');
  g.tapId('home:howto');
  assert.ok(g.has('sheet:close'));
  g.tapId('sheet:close');
  g.server.offline = false;
  await tapAndSettle(g, 'home:retry');
  assert.equal(g.view().vm.daily.state, 'available');
});

test('ranked daily by TAPS ONLY: warm-up, chips, hints; solved -> reveal (AC 27, 29, 32, 36, 103, 104)', async (t) => {
  const g = await startUp(t);
  await startDaily(g);
  const v0 = g.view().vm;
  assert.equal(v0.title, '今日一词 第20期');
  assert.equal(v0.warmups.length, 6);
  assert.equal(v0.coach, 1);
  assert.equal(v0.ranked, true);
  assert.ok(!g.has('hint:ad'), 'no rewarded hint on the ranked daily (AC 47)');
  let solved = false;
  for (let i = 0; i < 90 && !solved; i++) {
    const v = g.view().vm;
    if (v.state === 'solvedAnim') break;
    if (v.warmups.length) await tapAndSettle(g, 'warmup:0');
    else if (v.hint.state === 'available') await tapAndSettle(g, 'hint:use');
    else if (v.chips.length) await tapAndSettle(g, 'chip:0');
    else assert.fail('stuck with no chip at step ' + v.steps);
    solved = g.view().vm.state === 'solvedAnim';
    // ladder invariants after every step
    const ranks = g.view().vm.ladder.map((r) => r.rank);
    assert.deepEqual(ranks, ranks.slice().sort((a, b) => a - b));
  }
  assert.ok(g.view().vm.state === 'solvedAnim', 'solved by taps, steps ' + g.view().vm.steps);
  const vs = g.view().vm;
  assert.ok(vs.latest.rank === 1 || vs.latest.isSyn);
  await toReveal(g);
  const rv = g.view().vm;
  assert.equal(rv.outcome, 'solved');
  assert.equal(rv.answer, '月亮');
  assert.match(rv.summary, /^\d+ 步猜中/);
  assert.equal(rv.top.state, 'ready');
  assert.equal(rv.top.items.length, 100);
  assert.equal(rv.top.items[0].word, '月亮');
  assert.ok(rv.top.items.some((i) => i.mine) || vs.latest.isSyn);
  assert.equal(rv.temps.length, vs.steps);
  // sources: every guess was a tap
  const srcs = events(g).filter((e) => e.name === 'guess').map((e) => e.props.src);
  assert.ok(srcs.every((s) => s === 'warmup' || s === 'chip'));
  const solve = events(g).find((e) => e.name === 'solve');
  assert.equal(solve.props.steps, vs.steps);
  assert.equal(solve.props.ranked, true);
  const mix = solve.props.srcMix;
  assert.equal(mix.warmup + mix.chip + mix.suggest + mix.typed, vs.steps - solve.props.hints - solve.props.adHints);
  // home now shows solved
  g.tapId('reveal:back');
  const d = g.view().vm.daily;
  assert.equal(d.state, 'solved');
  assert.equal(d.sub, '今日 ' + vs.steps + ' 步猜中');
  assert.equal(d.secondary.label, '再来一题');
  assert.equal(d.footnote, '明日 0:00 换新词');
  assert.equal(d.primary.label, '查看答案');
});

test('typing: suggestions, exact match, OOV sends nothing, keyboard stays open and clears (AC 20-23, 26)', async (t) => {
  const g = await startUp(t);
  await startDaily(g);
  g.tapId('key:open');
  assert.equal(g.log.keyboard[0][0], 'show');
  assert.deepEqual(g.log.keyboard[0][1], { defaultValue: '', maxLength: 8, multiple: false, confirmHold: true, confirmType: 'done' });
  assert.equal(g.view().vm.keyboard.open, true);
  assert.equal(count(g, 'keyboard_open'), 1);
  g.type('火');
  const sugg = g.view().vm.keyboard.suggestions;
  assert.ok(sugg.length >= 2 && sugg.length <= 6);
  assert.ok(sugg.every((w) => w.startsWith('火')));
  assert.equal(sugg[0], '火', 'the exact match is suggestion #1');
  g.handlers.kbHeight({ height: 300 });
  assert.equal(g.view().vm.keyboard.heightPx, 300);
  // tap a suggestion
  const before = guessCalls(g).length;
  await tapAndSettle(g, 'sugg:0');
  assert.equal(guessCalls(g).length, before + 1);
  assert.equal(events(g).filter((e) => e.name === 'guess').pop().props.src, 'suggest');
  assert.equal(g.view().vm.keyboard.open, true, 'keyboard stays open after a submit');
  assert.equal(g.view().vm.keyboard.text, '');
  assert.ok(g.log.keyboard.some((k) => k[0] === 'update' && k[1].value === ''), 'text cleared');
  // out of vocabulary: toast, no network call
  g.type('乱码词');
  assert.deepEqual(g.view().vm.keyboard.suggestions, []);
  const calls = g.server.calls.length;
  g.confirm('乱码词');
  await g.settle();
  assert.equal(g.server.calls.length, calls, 'nothing sent');
  assert.equal(g.view().overlay.toast.text, '词库里没有「乱码词」，换个常用词试试');
  const rej = events(g).filter((e) => e.name === 'guess_rejected').pop();
  assert.deepEqual([rej.props.reason, rej.props.len], ['oov', 3]);
  assert.ok(!JSON.stringify(events(g)).includes('乱码词'), 'typed text never reaches analytics');
  // exact match with spaces and a traditional character, typed
  await typeGuess(g, ' 貓 ');
  assert.equal(events(g).filter((e) => e.name === 'guess').pop().props.src, 'typed');
  assert.ok(g.view().vm.ladder.some((r) => r.word === '猫'));
  // a duplicate: no call, toast with its rank
  const c2 = guessCalls(g).length;
  await typeGuess(g, '猫');
  assert.equal(guessCalls(g).length, c2, 'no guess call for a duplicate');
  assert.match(g.view().overlay.toast.text, /^已经猜过「猫」了 · 第 [\d,]+ 名$/);
  g.tapId('key:close');
  assert.equal(g.view().vm.keyboard.open, false);
  assert.ok(g.log.keyboard.some((k) => k[0] === 'hide'));
});

test('typing the answer (and a synonym) solves it (AC 36, 37)', async (t) => {
  const g = await startUp(t);
  await startDaily(g);
  g.tapId('key:open');
  await typeGuess(g, '月球');
  const v = g.view().vm;
  assert.equal(v.state, 'solvedAnim');
  assert.equal(g.view().overlay.toast.text, '意思一样！');
  assert.equal(v.latest.isSyn, true);
  await toReveal(g);
  assert.equal(g.view().vm.answer, '月亮');
  assert.equal(g.view().vm.top.items[1].synonym, true);
  assert.equal(events(g).find((e) => e.name === 'solve').props.solvedBy, 'synonym');
});

test('hint ladder 10/20/30/40: labels, +1 step, first character, ladder marks (AC 42-45, 49)', async (t) => {
  const g = await startUp(t);
  await startDaily(g);
  g.tapId('key:open');
  const far = farWords(g, TODAY, 90);
  let n = 0;
  const guessTo = async (steps) => {
    while (g.view().vm.steps < steps) {
      if (n % 30 === 29) g.wait(61000);
      await typeGuess(g, far[n++]);
      assert.notEqual(g.view().vm.state, 'offline');
    }
  };
  await guessTo(9);
  assert.equal(g.view().vm.hint.state, 'locked');
  assert.equal(g.view().vm.hint.label, '第 10 步后可用提示');
  g.tapId('key:close');
  assert.ok(!g.has('hint:use'), 'disabled hint is not tappable');
  g.tapId('key:open');
  await guessTo(10);
  assert.deepEqual(g.view().vm.hint, { next: 1, state: 'available', label: '提示 1 可用' });
  g.tapId('key:close');
  await tapAndSettle(g, 'hint:use');
  let v = g.view().vm;
  assert.equal(v.steps, 11);
  assert.equal(v.hintsUsed, 1);
  const hintRow = v.ladder.find((r) => r.isHint);
  assert.ok(hintRow && hintRow.rank >= 2 && hintRow.rank <= 300, JSON.stringify(hintRow));
  assert.ok(v.chips.length > 0, 'hint words get chips');
  assert.equal(v.hint.label, '第 20 步后可用提示');
  g.tapId('key:open');
  await guessTo(20);
  assert.equal(g.view().vm.hint.next, 2);
  g.tapId('key:close');
  await tapAndSettle(g, 'hint:use');
  assert.equal(g.view().vm.steps, 21);
  assert.ok(g.view().vm.ladder.filter((r) => r.isHint).length === 2);
  g.tapId('key:open');
  await guessTo(30);
  g.tapId('key:close');
  await tapAndSettle(g, 'hint:use'); // hint 3: first character
  v = g.view().vm;
  assert.equal(v.steps, 31);
  assert.equal(v.firstChar, '月');
  assert.equal(v.firstCharLabel, '首字：月');
  assert.equal(v.ladder.length, 30, 'the first-character step is a step but not a ladder row');
  g.tapId('key:open');
  await guessTo(40);
  g.tapId('key:close');
  await tapAndSettle(g, 'hint:use');
  v = g.view().vm;
  assert.equal(v.steps, 41);
  assert.equal(v.hintsUsed, 4);
  assert.deepEqual(v.hint, { next: null, state: 'exhausted', label: '提示已用完' });
  assert.equal(count(g, 'hint_use'), 4);
  assert.equal(count(g, 'hint_unlock'), 4);
  // the menu still offers 放弃
  g.tapId('menu:open');
  assert.ok(g.has('menu:giveup'));
});

test('give up: only through the menu, confirm dialog names the streak, then the reveal (AC 50, 51)', async (t) => {
  const g = await startUp(t);
  await startDaily(g);
  assert.ok(!g.has('menu:giveup'));
  g.tapId('menu:open');
  g.tapId('menu:giveup');
  assert.equal(g.view().overlay.toast.text, '先猜一个词再放弃'); // needs a step
  await tapAndSettle(g, 'warmup:0');
  g.tapId('menu:open');
  g.tapId('menu:giveup');
  const dlg = g.view().overlay.dialog;
  assert.match(dlg.text, /连续猜中天数会中断/);
  assert.equal(dlg.confirmLabel, '放弃并看答案');
  g.tapId('dialog:cancel');
  assert.equal(g.view().vm.state, 'result');
  g.tapId('menu:open');
  g.tapId('menu:giveup');
  g.tapId('dialog:confirm');
  await g.settle();
  const rv = g.view().vm;
  assert.equal(g.view().screen, 'reveal');
  assert.equal(rv.outcome, 'gaveup');
  assert.equal(rv.answerLabel, '答案');
  assert.equal(rv.answer, '月亮');
  assert.match(rv.summary, /^未猜中 · 最近第 [\d,]+ 名$/);
  assert.equal(rv.top.items.length, 100);
  assert.equal(count(g, 'give_up'), 1);
  assert.equal(g.view().vm.streak.show, false);
  g.tapId('reveal:back');
  assert.equal(g.view().vm.daily.state, 'gaveup');
  assert.equal(g.view().vm.daily.sub, '今日未猜中');
  // the marker is written for the finished ranked daily (privacy interface, first use)
  assert.ok(g.log.cloudWrites.length === 1);
  assert.deepEqual(Object.keys(JSON.parse(g.log.cloudWrites[0][0].value)).sort(), ['h', 's', 'st']);
  assert.equal(g.log.cloudWrites[0][0].key, 'd_20261120');
  assert.equal(JSON.parse(g.log.cloudWrites[0][0].value).st, 'gaveup');
});

test('resume: leaving and reopening continues the same ladder; home shows 继续猜 (edge 11, AC 60, 94)', async (t) => {
  const g = await startUp(t);
  await startDaily(g);
  await tapAndSettle(g, 'warmup:1');
  await tapAndSettle(g, 'chip:0');
  const ladder = g.view().vm.ladder.map((r) => r.word);
  const best = Math.min(...g.view().vm.ladder.map((r) => r.rank));
  g.tapId('back');
  const d = g.view().vm.daily;
  assert.equal(d.state, 'inProgress');
  assert.equal(d.sub, '已猜 2 步 · 最近第 ' + best.toLocaleString('en-US') + ' 名');
  assert.equal(d.primary.label, '继续猜');
  await tapAndSettle(g, 'home:daily');
  const v = g.view().vm;
  assert.equal(v.steps, 2);
  assert.deepEqual(v.ladder.map((r) => r.word), ladder);
  assert.equal(v.warmups.length, 0);
  assert.ok(v.chips.length > 0, 'chips come back after a resume');
});
