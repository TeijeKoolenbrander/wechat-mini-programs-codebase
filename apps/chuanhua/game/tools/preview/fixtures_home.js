/** Fixtures: home, picker. */

const DAILY = {
  dateText: '10月15日',
  prompts: [
    { id: 'A01', text: '月亮吃月饼' },
    { id: 'B07', text: '企鹅滑滑梯' },
    { id: 'C12', text: '搬家' },
  ],
  countText: '全国已有 2,315 条从这里出发',
};

function homeVm(over) {
  return Object.assign(
    {
      state: 'ready',
      daily: DAILY,
      streakText: '连续接龙 4 天',
      start: { freeLeft: 2, adLeft: 2, label: '开一条接龙', sublabel: '今天还能开 2 条', enabled: true },
      groupLine: { show: false, text: '' },
      album: { unseenReveals: 0 },
      restriction: null,
      ugcPausedText: null,
      showHowToOnce: false,
      showRulesWarning: false,
      sheet: null,
      t: 0,
    },
    over
  );
}

function pickerVm(over) {
  return Object.assign(
    {
      state: 'ready',
      prompts: [
        { id: 'A01', text: '月亮吃月饼', isDaily: true },
        { id: 'B07', text: '企鹅滑滑梯', isDaily: true },
        { id: 'C12', text: '搬家', isDaily: true },
      ],
      selectedId: 'A01',
      custom: { open: false, text: '', count: '0/12', error: null },
      canStart: true,
      errorText: null,
    },
    over
  );
}

function add(fx) {
  fx.home = {
    loading: homeVm({ state: 'loading', daily: { dateText: '10月15日', prompts: [], countText: null }, streakText: null, start: { freeLeft: 0, adLeft: 0, label: '开一条接龙', enabled: false } }),
    loading_local: homeVm({ state: 'loading', daily: Object.assign({}, DAILY, { countText: null }), streakText: null, start: { freeLeft: 3, adLeft: 2, label: '开一条接龙', enabled: false } }),
    ready: homeVm({}),
    ready_plain: homeVm({ daily: Object.assign({}, DAILY, { countText: null }), streakText: null, start: { freeLeft: 3, adLeft: 2, label: '开一条接龙', sublabel: null, enabled: true } }),
    group: homeVm({ groupLine: { show: true, text: '来自群聊 · 本群有 2 条等你接' } }),
    group_nocount: homeVm({ groupLine: { show: true, text: '来自群聊 · 本群接龙' } }),
    unseen: homeVm({ album: { unseenReveals: 1 } }),
    offline: homeVm({ state: 'offline', start: { freeLeft: 0, adLeft: 0, label: '开一条接龙', enabled: false } }),
    error: homeVm({ state: 'error', start: { freeLeft: 0, adLeft: 0, label: '开一条接龙', enabled: false } }),
    startsUsed_ad: homeVm({ start: { freeLeft: 0, adLeft: 2, label: '今天的 3 条已开完', sublabel: null, enabled: false } }),
    startsUsed: homeVm({ start: { freeLeft: 0, adLeft: 0, label: '今天的 3 条已开完', sublabel: '明天再来开新的吧', enabled: false } }),
    restricted: homeVm({ restriction: { text: '你暂时不能参与接龙（至 10月17日 14:00）。原因：多次发布的内容未通过审核。如有疑问，请在「设置 · 反馈」联系我们。' }, start: { freeLeft: 0, adLeft: 0, label: '开一条接龙', enabled: false } }),
    paused: homeVm({ ugcPausedText: '接龙维护中，可以先看看已揭晓的接龙', start: { freeLeft: 3, adLeft: 0, label: '开一条接龙', enabled: false } }),
    sheet_howto: homeVm({ showHowToOnce: true }),
    sheet_rules: homeVm({ sheet: 'rules', rules: { version: 1, pendingAction: 'start' } }),
    sheet_strike: homeVm({ showRulesWarning: true }),
  };

  fx.picker = {
    ready: pickerVm({}),
    shuffled: pickerVm({ prompts: [{ id: 'D02', text: '猫咪开出租车', isDaily: false }, { id: 'E09', text: '大象刷牙', isDaily: false }, { id: 'A01', text: '月亮吃月饼', isDaily: true }], selectedId: 'D02' }),
    custom_empty: pickerVm({ custom: { open: true, text: '', count: '0/12', error: null }, canStart: false }),
    custom_typing: pickerVm({ custom: { open: true, text: '会飞的西瓜', count: '5/12', error: null }, canStart: true, keyboardH: 0 }),
    custom_blocked: pickerVm({ custom: { open: true, text: '换个说法', count: '4/12', error: '这个题目不太合适，换一个吧' }, canStart: true }),
    custom_busy: pickerVm({ custom: { open: true, text: '会飞的西瓜', count: '5/12', error: '审核服务繁忙，请稍后再试，或先选一个现成的题目' } }),
    creating: pickerVm({ state: 'creating' }),
    error: pickerVm({ state: 'error', errorText: '没能准备好画布，请重试' }),
    offline: pickerVm({ state: 'offline', errorText: '需联网才能开始' }),
    limit: pickerVm({ state: 'error', errorText: '今天的 3 条已开完，明天再来开新的吧' }),
    none_selected: pickerVm({ selectedId: null, canStart: false }),
    sheet_rules: pickerVm({ sheet: 'rules', rules: { version: 1, pendingAction: 'start' } }),
  };
}

module.exports = { add, homeVm, pickerVm };
