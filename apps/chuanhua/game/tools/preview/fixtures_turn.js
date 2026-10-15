/** Fixtures: draw, describe, sent (已传出). */

const SM = require('./sample.js');
const COLORS = ['#1E1B18', '#D8433B', '#F29B30', '#3E9B5A', '#3C78C8', '#7B4FB3', '#F28DB2', '#F2D13C', '#6CC3E0', '#8A5A3B', '#9A9A9A', '#9CCB4A'];

function palette(unlocked) {
  return COLORS.map((color, idx) => ({ idx, color, locked: idx >= 6 && !unlocked }));
}

function drawVm(over) {
  return Object.assign(
    {
      chainId: 'k7m2q9x4ab',
      claimId: 'c1',
      step: 3,
      title: '第 3 棒 · 画出来',
      source: { kind: 'text', text: '恐龙在学跳舞' },
      canReport: true,
      timer: { secLeft: 48, warn: false },
      palette: palette(false),
      colorIdx: 0,
      sizeIdx: 1,
      strokes: SM.house(),
      pointsUsed: 120,
      pointsMax: 4000,
      paletteAd: { show: false, state: 'idle' },
      canUndo: true,
      canSubmit: true,
      status: 'drawing',
      errorText: null,
      coach: false,
      sheet: null,
    },
    over
  );
}

function describeVm(over) {
  return Object.assign(
    {
      chainId: 'k7m2q9x4ab',
      claimId: 'c1',
      step: 4,
      title: '第 4 棒 · 猜一猜',
      drawing: SM.sun(),
      canReport: true,
      timer: { secLeft: 31, warn: false },
      text: '一只猫在开出租车',
      count: '8/16',
      canSubmit: true,
      status: 'typing',
      errorText: null,
      keyboardH: 0,
      t: 0,
      sheet: null,
    },
    over
  );
}

function sentVm(over) {
  return Object.assign(
    {
      chainId: 'k7m2q9x4ab',
      step: 3,
      kind: 'draw',
      mine: { strokes: SM.house() },
      modState: 'pending',
      modText: '已传出 · 审核中，通过后传给下一位',
      nextText: '通过后，群友就能接第 4 棒',
      autoUpdateNote: true,
      subscribe: { state: 'offer' },
      firstTimeExplainer: false,
      revealed: false,
      sheet: null,
    },
    over
  );
}

function add(fx) {
  const first = drawVm({ step: 1, title: '第 1 棒 · 画出来', source: { kind: 'prompt', text: '月亮吃月饼' }, canReport: false, timer: { secLeft: 60, warn: false }, strokes: SM.EMPTY, pointsUsed: 0, canUndo: false, canSubmit: false, coach: true, paletteAd: { show: true, state: 'idle' } });
  fx.draw = {
    first_empty: first,
    first_ad_loading: Object.assign({}, first, { coach: false, paletteAd: { show: true, state: 'loading' } }),
    first_ad_error: Object.assign({}, first, { coach: false, paletteAd: { show: true, state: 'error' } }),
    drawing: drawVm({}),
    drawing_long_source: drawVm({ source: { kind: 'text', text: '一只穿着雨衣的长颈鹿在高高的树上给小鸟们表演魔术' }, timer: { secLeft: 59, warn: false } }),
    warn_10s: drawVm({ timer: { secLeft: 7, warn: true }, colorIdx: 1, sizeIdx: 2 }),
    palette12: drawVm({ palette: palette(true), colorIdx: 8, strokes: SM.alien(), title: '第 5 棒 · 画出来', step: 5 }),
    point_limit: drawVm({ pointsUsed: 4000, strokes: SM.scribble(8, 120) }),
    submitting: drawVm({ status: 'submitting', canSubmit: false }),
    error: drawVm({ status: 'error', errorText: '没传出去', canSubmit: true }),
    claim_lost: drawVm({ status: 'error', errorText: '超时了，这一棒已被群友接走' }),
    timeUp: drawVm({ status: 'timeUp', timer: { secLeft: 0, warn: true }, strokes: SM.EMPTY, canUndo: false, canSubmit: false }),
    report_sheet: drawVm({ sheet: 'report', report: { target: { chainId: 'k7m2q9x4ab', step: 2 }, reason: 'ad', state: 'idle' } }),
    report_done: drawVm({ sheet: 'report', report: { state: 'done' } }),
    report_limit: drawVm({ sheet: 'report', report: { state: 'limit' } }),
    report_dup: drawVm({ sheet: 'report', report: { state: 'dup' } }),
    report_error: drawVm({ sheet: 'report', report: { state: 'error', reason: 'abuse' } }),
    report_submitting: drawVm({ sheet: 'report', report: { state: 'submitting', reason: 'abuse' } }),
    confirm_giveup: { vm: drawVm({}), overlay: { dialog: { text: '放弃这一棒？群友可以接着画', confirmLabel: '放弃', cancelLabel: '继续画', danger: true } } },
    confirm_clear: { vm: drawVm({}), overlay: { dialog: { text: '清空画布？', confirmLabel: '清空', cancelLabel: '取消', danger: true } } },
  };

  fx.describe = {
    typing: describeVm({}),
    empty: describeVm({ text: '', count: '0/16', canSubmit: false, timer: { secLeft: 45, warn: false } }),
    long: describeVm({ text: '一只穿着雨衣的长颈鹿在树上表演魔术', count: '16/16' }),
    keyboard_open: describeVm({ keyboardH: 260 }),
    keyboard_open_long: describeVm({ keyboardH: 300, text: '一只穿着雨衣的长颈鹿在树上表演魔术', count: '16/16' }),
    warn_10s: describeVm({ timer: { secLeft: 6, warn: true } }),
    submitting: describeVm({ status: 'submitting', canSubmit: false }),
    blocked: describeVm({ status: 'blocked' }),
    busy: describeVm({ status: 'busy' }),
    error: describeVm({ status: 'error', errorText: '没传出去，请重试' }),
    timeUp: describeVm({ status: 'timeUp', timer: { secLeft: 0, warn: true } }),
    step6: describeVm({ step: 6, title: '第 6 棒 · 猜一猜', drawing: SM.alien() }),
    report_sheet: describeVm({ sheet: 'report', report: { reason: null, state: 'idle' } }),
  };

  fx.sent = {
    draw_pending: sentVm({}),
    draw_pending_first: sentVm({ firstTimeExplainer: true, step: 1, subscribe: { state: 'offer' } }),
    draw_passed: sentVm({ modState: 'passed', modText: '已通过', nextText: '群友现在可以接第 4 棒了', subscribe: { state: 'granted' } }),
    draw_blocked: sentVm({ modState: 'blocked', modText: '这一棒没通过内容审核，没有传出去', nextText: null, subscribe: { state: 'hidden' } }),
    draw_void: sentVm({ modState: 'void', modText: '审核超时，这一棒没有传出去，不算你的次数', nextText: null, subscribe: { state: 'hidden' } }),
    text_passed: sentVm({ kind: 'describe', step: 4, mine: { text: '一只猫在开出租车' }, modState: 'passed', modText: '已通过', nextText: '通过后，群友就能接第 5 棒', subscribe: { state: 'hidden' } }),
    text_passed_nolink: sentVm({ kind: 'describe', step: 2, mine: { text: '一个大饼在天上' }, modState: 'passed', modText: '已通过', autoUpdateNote: false, subscribe: { state: 'requesting' } }),
    missing_modstate: sentVm({ modState: undefined, modText: undefined }),
    revealed: sentVm({ kind: 'describe', step: 6, mine: { text: '外星人在吃披萨' }, modState: 'passed', modText: '已通过', revealed: true, nextText: null, subscribe: { state: 'hidden' } }),
  };
}

module.exports = { add, drawVm, describeVm, sentVm, palette };
