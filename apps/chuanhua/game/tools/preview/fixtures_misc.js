/** Fixtures: group, album, detail, settings, overlays, share cards. */

const SM = require('./sample.js');

function groupVm(over) {
  return Object.assign(
    {
      state: 'ready',
      statsText: '本群已完成 12 条 · 共画了 41 幅画',
      waiting: [
        { chainId: 'a1', line: '第 4 棒 · 猜一句 · 已传 3/6' },
        { chainId: 'a2', line: '第 2 棒 · 画一幅 · 已传 1/6' },
      ],
      inProgress: [
        { chainId: 'b1', line: '第 3 棒审核中' },
        { chainId: 'b2', line: '有群友在接第 5 棒' },
      ],
      revealed: [
        { chainId: 'c1', line: '「月亮吃月饼」→「外星人在吃披萨」', participant: true },
        { chainId: 'c2', line: '「企鹅滑滑梯」→「一只鸭子在坐滑板车」', participant: false },
      ],
      banner: { show: false, reservedHeight: 0 },
      sheet: null,
      t: 0,
    },
    over
  );
}

function albumVm(over) {
  return Object.assign(
    {
      state: 'ready',
      streakText: '连续接龙 4 天',
      items: [
        { chainId: 'a', status: 'revealed', line: '已揭晓「月亮吃月饼」', timeText: '今天 14:20', unseen: true },
        { chainId: 'b', status: 'open', line: '进行中 3/6 · 我画了第 1 棒', timeText: '今天 11:05', unseen: false },
        { chainId: 'c', status: 'pending', line: '审核中 · 我画的第 3 棒', timeText: '今天 10:40', unseen: false },
        { chainId: 'd', status: 'expired', line: '没传完「搬家」', timeText: '昨天 21:30', unseen: false },
        { chainId: 'e', status: 'blocked', line: '这一棒没通过审核 · 第 5 棒', timeText: '昨天 18:02', unseen: false },
        { chainId: 'f', status: 'removed', line: '该接龙已被移除', timeText: '10月12日', unseen: false },
      ],
      cursor: null,
      banner: { show: false, reservedHeight: 0 },
      sheet: null,
      t: 0,
    },
    over
  );
}

function settingsVm(over) {
  return Object.assign({ muted: false, largeText: false, highContrast: false, canUnlockPalette: true, paletteUnlockedToday: false, deleteAll: { state: 'idle' }, subscribeStatusText: '揭晓提醒：已开启，揭晓时会通知你', version: '1.0.0', sheet: null }, over);
}

function add(fx) {
  fx.group = {
    noGroup: groupVm({ state: 'noGroup' }),
    checkingGroup: groupVm({ state: 'checkingGroup' }),
    loading: groupVm({ state: 'loading' }),
    ready: groupVm({}),
    ready_banner: groupVm({ banner: { show: true, reservedHeight: 60 } }),
    ready_only_reveal: groupVm({ waiting: [], inProgress: [] }),
    ready_long_lines: groupVm({ waiting: [{ chainId: 'a1', line: '第 4 棒 · 猜一句 · 已传 3/6 · 今天 14:20 开的头，还剩 31 小时' }], revealed: [{ chainId: 'c1', line: '「一只穿着雨衣的长颈鹿」→「一群外星人在月亮上吃着巨大的披萨」', participant: true }] }),
    empty: groupVm({ state: 'empty', waiting: [], inProgress: [], revealed: [], statsText: null }),
    empty_banner: groupVm({ state: 'empty', waiting: [], inProgress: [], revealed: [], statsText: null, banner: { show: true, reservedHeight: 60 } }),
    error: groupVm({ state: 'error' }),
  };

  fx.album = {
    loading: albumVm({ state: 'loading', items: [] }),
    ready: albumVm({}),
    ready_more: albumVm({ cursor: 'c20' }),
    ready_banner: albumVm({ banner: { show: true, reservedHeight: 60 } }),
    empty: albumVm({ state: 'empty', items: [], streakText: null }),
    error: albumVm({ state: 'error', items: [] }),
    offline_cached: albumVm({ state: 'offline' }),
    offline_empty: albumVm({ state: 'offline', items: [] }),
  };

  fx.detail = {
    open: { chainId: 'b', mine: [{ n: 1, kind: 'draw', strokes: SM.sun(), modState: 'passed', canDelete: true }, { n: 3, kind: 'draw', strokes: SM.house(), modState: 'pending', canDelete: false }] },
    expired: { chainId: 'd', mine: [{ n: 2, kind: 'describe', text: '一个大饼在天上', modState: 'passed', canDelete: true }, { n: 4, kind: 'describe', text: '一只猫在开出租车', modState: 'blocked', canDelete: false }, { n: 5, kind: 'draw', strokes: SM.alien(), modState: 'void', canDelete: false }] },
  };

  fx.settings = {
    default: settingsVm({}),
    muted_large: settingsVm({ muted: true, largeText: true }),
    hc_on: settingsVm({ highContrast: true }),
    palette_unlocked: settingsVm({ canUnlockPalette: false, paletteUnlockedToday: true }),
    no_palette: settingsVm({ canUnlockPalette: false, paletteUnlockedToday: false, subscribeStatusText: null }),
    delete_confirm1: settingsVm({ deleteAll: { state: 'confirm1' } }),
    delete_confirm2: settingsVm({ deleteAll: { state: 'confirm2' } }),
    deleting: settingsVm({ deleteAll: { state: 'deleting' } }),
    delete_done: settingsVm({ deleteAll: { state: 'done' } }),
    delete_error: settingsVm({ deleteAll: { state: 'error' } }),
    scrolled: settingsVm({ scrollY: 400 }),
  };

  fx.overlay = {
    toast: { vm: groupVm({}), overlay: { toast: { text: '被群友抢先一步' } } },
    toast_long: { vm: groupVm({}), overlay: { toast: { text: '群里有新接龙，传完这一棒再看' } } },
    ad_stub: { vm: groupVm({}), overlay: { adStub: { kind: 'rewarded', secondsLeft: 3 } } },
    dialog_single: { vm: groupVm({}), overlay: { dialog: { title: '现在揭晓？', text: '之后就不能再接了', confirmLabel: '现在揭晓', cancelLabel: '再等等' } } },
  };

  fx.shareCard = {
    invite_3: { vm: { kind: 'invite', passed: 3, total: 6 } },
    invite_1: { vm: { kind: 'invite', passed: 1, total: 6 } },
    reveal: { vm: { kind: 'reveal', promptText: '月亮吃月饼', finalText: '外星人在吃披萨', passed: 6, people: 6 } },
    reveal_long: { vm: { kind: 'reveal', promptText: '一只穿着雨衣的长颈鹿', finalText: '一群外星人在月亮上吃着巨大的披萨', passed: 4, people: 3 } },
    fallback: { vm: { kind: 'fallback' } },
  };
}

module.exports = { add, groupVm, albumVm, settingsVm };
