/** Fixtures: chain entry, reveal, teaser. */

const SM = require('./sample.js');

function entryVm(over) {
  return Object.assign(
    {
      state: 'claimable',
      passed: 3,
      length: 6,
      nextStep: 4,
      nextKind: 'describe',
      headline: '第 4 棒等你接',
      subline: '上一棒是一幅画，你来猜一句（限时 45 秒）',
      timeLeftText: '还剩 31 小时',
      takenEtaText: null,
      isParticipant: false,
      isStarter: false,
      canRevealNow: false,
      canSameAgain: false,
      subscribe: { state: 'hidden' },
      sheet: null,
    },
    over
  );
}

function step(n, over) {
  const kind = n % 2 ? 'draw' : 'describe';
  const texts = { 2: '一个大饼在天上', 4: '一只猫在开出租车', 6: '外星人在吃披萨' };
  const draws = { 1: SM.sun(), 3: SM.house(), 5: SM.alien() };
  return Object.assign({ n, kind, mine: false, placeholder: null, laughs: n === 2 ? 3 : n === 6 ? 1 : 0, myLaugh: n === 6, canReport: true }, kind === 'draw' ? { strokes: draws[n] } : { text: texts[n] }, over);
}

function revealVm(over) {
  return Object.assign(
    {
      state: 'ready',
      chainId: 'k7m2q9x4ab',
      header: '接龙揭晓 · 6 位群友 · 用时 5 小时',
      early: false,
      earlyText: null,
      prompt: { text: '月亮吃月饼', custom: false },
      steps: [1, 2, 3, 4, 5, 6].map((n) => step(n, n === 3 ? { mine: true, canReport: false, laughs: 2 } : n === 6 ? { mine: true, canReport: false } : {})),
      summaryText: '从「月亮吃月饼」传成了「外星人在吃披萨」',
      nationalText: '今天全国 2,315 条从这里出发',
      autoplay: { enabled: false, panel: 0, playing: false, progress: 1 },
      canSameAgain: true,
      interstitialDue: false,
      sheet: null,
      t: 0,
    },
    over
  );
}

function teaserVm(over) {
  return Object.assign({ state: 'ready', promptText: '月亮吃月饼', finalText: '外星人在吃披萨', passed: 6, canSameAgain: true, sheet: null }, over);
}

function add(fx) {
  fx.entry = {
    loading: entryVm({ state: 'loading' }),
    claimable_describe: entryVm({}),
    claimable_draw: entryVm({ nextStep: 3, nextKind: 'draw', passed: 2, headline: '第 3 棒等你接', subline: '上一棒是一句话，你来画出来（限时 60 秒）' }),
    claimable_starter: entryVm({ isStarter: true, isParticipant: true, canRevealNow: true, passed: 4, nextStep: 5, nextKind: 'draw', headline: '第 5 棒等你接', subline: '上一棒是一句话，你来画出来（限时 60 秒）' }),
    claiming: entryVm({ claimBusy: true }),
    taken: entryVm({ state: 'taken', headline: '有群友正在接第 4 棒（约 2 分钟内）', subline: null, takenEtaText: '2 分钟后没传出，别人还能接' }),
    pending: entryVm({ state: 'pending', headline: '第 3 棒审核中，通常几分钟', subline: null, isParticipant: true, subscribe: { state: 'offer' } }),
    pending_plain: entryVm({ state: 'pending', headline: '第 3 棒审核中，通常几分钟', subline: null }),
    prevMine: entryVm({ state: 'prevMine', headline: '上一棒是你传的，等别人接下一棒吧', subline: null, isParticipant: true }),
    capReached: entryVm({ state: 'capReached', headline: '这条接龙你已经接了 3 棒，留给群友吧', subline: null, isParticipant: true, passed: 5 }),
    wrongGroup: entryVm({ state: 'wrongGroup', headline: '接龙只能在发起的群里接力', subline: null, timeLeftText: null }),
    revealedParticipant: entryVm({ state: 'revealedParticipant', passed: 6, headline: '接龙揭晓了！', subline: null, isParticipant: true, timeLeftText: null }),
    revealedTeaser: entryVm({ state: 'revealedTeaser', passed: 6, headline: '一条接龙揭晓了', subline: null, timeLeftText: null }),
    expired: entryVm({ state: 'expired', passed: 3, headline: '这条接龙没传完', subline: null, isParticipant: true, canSameAgain: true, timeLeftText: null }),
    expired_other: entryVm({ state: 'expired', passed: 3, headline: '这条接龙没传完', subline: null, timeLeftText: null }),
    removed: entryVm({ state: 'removed', passed: null, headline: '该接龙已被移除', subline: null, timeLeftText: null }),
    notFound: entryVm({ state: 'notFound', headline: '找不到这条接龙', subline: null, timeLeftText: null }),
    restricted: entryVm({ state: 'restricted', headline: '你暂时不能参与接龙', subline: '至 10月17日 14:00。原因：多次发布的内容未通过审核。', timeLeftText: null }),
    rulesRequired: entryVm({ state: 'rulesRequired', subline: '开始前先看一下接龙公约' }),
    rulesSheet: entryVm({ state: 'rulesRequired', sheet: 'rules', rules: { version: 1, pendingAction: 'claim' } }),
    ugcPaused: entryVm({ state: 'ugcPaused', headline: '接龙维护中，可以先看看已揭晓的接龙', subline: null }),
    offline: entryVm({ state: 'offline', headline: '需联网才能接龙', subline: null, timeLeftText: null }),
    error: entryVm({ state: 'error', headline: '没能打开这条接龙', subline: null, timeLeftText: null }),
    missing_fields: { state: 'claimable' },
    /* a hostile vm: content fields that must never be drawn */
    leak_attempt: entryVm({ prompt: { text: '机密题目' }, steps: [{ n: 1, kind: 'draw', strokes: SM.sun() }], lastText: '机密句子', previous: { text: '机密句子' } }),
  };

  const ownSteps = [1, 2, 3, 4, 5, 6].map((n) => step(n, n === 3 ? { mine: true, canReport: false } : {}));
  fx.reveal = {
    loading: revealVm({ state: 'loading', steps: [] }),
    ready: revealVm({}),
    ready_small_top: revealVm({ scrollY: 0 }),
    ready_scrolled: revealVm({ scrollY: 520 }),
    replay_one: revealVm({ replay: { n: 3, progress: 0.55 } }),
    early: revealVm({ early: true, earlyText: '提前揭晓 · 传了 4/6 棒', header: '接龙揭晓 · 4 位群友 · 用时 2 小时', steps: ownSteps.slice(0, 4), summaryText: '从「月亮吃月饼」传成了「一只猫在开出租车」', nationalText: null }),
    play_prompt: revealVm({ autoplay: { enabled: true, playing: true, panel: 0, progress: 0.7 } }),
    play_draw1: revealVm({ autoplay: { enabled: true, playing: true, panel: 1, progress: 0.5 } }),
    play_text2: revealVm({ autoplay: { enabled: true, playing: true, panel: 2, progress: 0.5 } }),
    play_draw3: revealVm({ autoplay: { enabled: true, playing: true, panel: 3, progress: 0.8 } }),
    play_end: revealVm({ autoplay: { enabled: true, playing: true, panel: 6, progress: 1 } }),
    placeholders: revealVm({
      steps: [step(1), step(2, { placeholder: 'reported', text: undefined }), step(3, { mine: true, canReport: false }), step(4, { placeholder: 'deleted', strokes: undefined, text: undefined }), step(5), step(6, { mine: true, canReport: false })],
    }),
    play_with_placeholder: revealVm({
      steps: [step(1), step(2, { placeholder: 'reported', text: undefined }), step(3), step(4), step(5), step(6)],
      autoplay: { enabled: true, playing: true, panel: 3, progress: 0.4 },
    }),
    missing_content: revealVm({ steps: [{ n: 1, kind: 'draw' }, { n: 2, kind: 'describe' }, { n: 3, kind: 'draw', strokes: SM.house() }] }),
    paused: revealVm({ state: 'paused', steps: [step(1, { placeholder: 'paused' })] }),
    offline: revealVm({ state: 'offline', steps: [] }),
    error: revealVm({ state: 'error', steps: [] }),
    notParticipant: revealVm({ state: 'notParticipant', teaser: { promptText: '月亮吃月饼', finalText: '外星人在吃披萨', passed: 6, canSameAgain: true } }),
    report_sheet: revealVm({ sheet: 'report', report: { target: { chainId: 'k7m2q9x4ab', step: 2 }, reason: 'porn', state: 'idle' } }),
    custom_prompt_long: revealVm({ prompt: { text: '一只穿着雨衣的长颈鹿在高高的树上', custom: true }, summaryText: '从「一只穿着雨衣的长颈鹿在高高的树上」传成了「外星人在吃披萨」' }),
  };

  fx.teaser = {
    loading: teaserVm({ state: 'loading' }),
    ready: teaserVm({}),
    ready_no_same: teaserVm({ canSameAgain: false }),
    long_texts: teaserVm({ promptText: '一只穿着雨衣的长颈鹿', finalText: '一群外星人在月亮上吃着巨大的披萨' }),
    missing_final: teaserVm({ finalText: null }),
    removed: teaserVm({ state: 'removed' }),
    notFound: teaserVm({ state: 'notFound' }),
    offline: teaserVm({ state: 'offline' }),
    report_sheet: teaserVm({ sheet: 'report', report: { target: { chainId: 'k7m2q9x4ab', step: 0 }, reason: null, state: 'idle' } }),
  };
}

module.exports = { add, entryVm, revealVm, teaserVm, step };
