/**
 * Stub renderer: boxes and labels only, so the game is runnable before the
 * real js/render/* (frontend-ui) lands. Same contract as the real renderers:
 *   draw(screen, ctx, vm, layout) -> hitAreas[{id,x,y,w,h}]
 *   drawOverlay(ctx, overlayVm, layout) -> hitAreas
 * It emits the hit ids listed in js/render/CONTRACT.md.
 */

function stubLayout(info) {
  const W = info.windowWidth;
  const H = info.windowHeight;
  const sb = info.statusBarHeight || 20;
  const m = info.menuRect || { left: W - 94, right: W - 7, top: sb + 6, bottom: sb + 38 };
  const navBottom = m.bottom + (m.top - sb);
  const safeBottom = info.safeArea && info.safeArea.bottom != null ? Math.max(0, H - info.safeArea.bottom) : 0;
  const pad = 16;
  return {
    W,
    H,
    s: 1,
    u: (n) => n,
    dpr: info.pixelRatio || 1,
    statusBar: sb,
    navBottom,
    safeBottom,
    bottomEdge: H - safeBottom,
    capsule: { x: m.left, y: m.top, w: m.right - m.left, h: m.bottom - m.top },
    pad,
    x0: pad,
    contentW: W - 2 * pad,
    cx: W / 2,
    back: { x: 0, y: m.top, w: 88, h: 48 },
    thumbTop: H * 0.6,
    board: { x: pad, y: navBottom + 44, w: W - 2 * pad, h: Math.max(160, H - navBottom - 44 - safeBottom - 90) },
  };
}

class Pen {
  constructor(ctx, L) {
    this.ctx = ctx;
    this.L = L;
    this.y = L.navBottom + 4;
    this.hits = [];
  }
  text(s, size) {
    const c = this.ctx;
    c.fillStyle = '#222';
    c.font = (size || 16) + 'px sans-serif';
    c.textAlign = 'left';
    c.fillText(String(s), this.L.x0, this.y + (size || 16));
    this.y += (size || 16) + 8;
  }
  button(id, label, opts) {
    const L = this.L;
    const o = opts || {};
    const h = 48;
    const w = o.w || L.contentW;
    const x = o.x === undefined ? L.x0 : o.x;
    const c = this.ctx;
    c.fillStyle = o.disabled ? '#ccc' : '#C0392B';
    c.fillRect(x, this.y, w, h);
    c.fillStyle = '#fff';
    c.font = '16px sans-serif';
    c.textAlign = 'center';
    c.fillText(label, x + w / 2, this.y + 30);
    if (!o.disabled) this.hits.push({ id, x, y: this.y, w, h });
    if (!o.inline) this.y += h + 8;
  }
}

const HOME_LABEL = { available: '出征', inProgress: '继续出征', done: '查看战报', loading: '正在取今日军令…', pendingSubmit: '战报待发送', offline: '今日军令需联网获取', error: '今日军令需联网获取' };

const drawers = {
  home(p, vm) {
    p.text('点将台', 28);
    p.text('今日军令 · 第 ' + vm.daily.issueNo + ' 期' + (vm.daily.variantLabel ? ' · ' + vm.daily.variantLabel : '') + '  [' + vm.daily.state + ']' + (vm.daily.record ? ' ' + vm.daily.record.w + '-' + vm.daily.record.l + ' ' + vm.daily.bandLabel : ''));
    if (vm.daily.streak && vm.daily.streak.text) p.text(vm.daily.streak.text);
    if (vm.hasGroupContext) p.button('home:groupBanner', '来自群聊 · 查看本群今日排行');
    const s = vm.daily.state;
    p.button('home:daily', HOME_LABEL[s] || '出征', { disabled: s === 'loading' || s === 'pendingSubmit' || s === 'offline' || s === 'error' });
    if (s === 'pendingSubmit' || s === 'offline' || s === 'error') p.button('home:retry', '重试');
    p.button('home:free', '自由点将 · 不限次');
    p.button('home:groupBoard', '群榜');
    p.button('home:friendBoard', '好友榜');
    p.button('home:history', '往期');
    p.button('home:howto', '玩法');
    p.button('home:sound', vm.muted ? '声音：关' : '声音：开');
    p.button('home:settings', '隐私与设置');
    if (vm.sheet) {
      p.y = p.L.navBottom + 4;
      p.ctx.fillStyle = 'rgba(255,255,255,0.96)';
      p.ctx.fillRect(0, p.y, p.L.W, p.L.H);
      p.hits.length = 0;
      p.text(vm.sheet === 'howto' ? '玩法：翻令、选将、放入位置，五轮后出征' : '隐私与设置');
      if (vm.sheet === 'settings') {
        p.button('settings:music', vm.musicOn ? '音乐：开' : '音乐：关');
        p.button('settings:sfx', vm.sfxOn ? '音效：开' : '音效：关');
        p.button('settings:largeText', vm.settings.largeText ? '大字模式：开' : '大字模式：关');
        p.button('settings:highContrast', vm.settings.highContrast ? '高对比度：开' : '高对比度：关');
        if (!vm.settings.friendBoardEnabled) p.button('settings:openSetting', '好友排行：未开启 [去设置]');
        p.button('settings:privacy', '用户隐私保护指引');
        p.button('settings:feedback', '联系我们/反馈');
      }
      p.button('sheet:close', '知道了');
    }
  },
  draft(p, vm) {
    p.button('back', '‹ 返回', { w: 88, inline: false });
    p.text(vm.mode + '  第 ' + vm.round + ' / 5 轮  [' + vm.phase + ']' + (vm.headerTag ? '  ' + vm.headerTag : ''));
    if (vm.shirenCoach) p.text(vm.shirenCoach, 14);
    if (vm.roundFetchText) {
      p.text(vm.roundFetchText);
      p.button('retryRound', '重试');
    }
    if (vm.tokens) p.text('令牌：' + vm.tokens.faction.label + ' · ' + vm.tokens.era.label);
    if (vm.notice) p.text(vm.notice);
    const hw = (p.L.contentW - 8) / 2;
    for (const dim of ['faction', 'era']) {
      const r = vm.respin[dim];
      const x = dim === 'faction' ? p.L.x0 : p.L.x0 + hw + 8;
      const label = r.free > 0 ? (dim === 'faction' ? '换势力 ×1' : '换时代 ×1') : vm.respin.adAllowed ? '视频再换 ×' + vm.respin.adLeft : '已用';
      const id = r.free > 0 ? 'respin:' + dim : 'respinAd:' + dim;
      const saved = p.y;
      p.button(id, label, { x, w: hw, inline: true, disabled: (r.free > 0 && !r.enabled) || (r.free === 0 && !vm.respin.adAllowed) });
      p.y = saved;
    }
    p.y += 56;
    for (const g of vm.pool.slice(0, 6)) p.button('pool:' + g.id, g.name + (g.stats ? ' ' + g.tier + ' ' + ['zhi', 'xin', 'ren', 'yong', 'yan'].map((k) => g.stats[k]).join('/') : ' ' + g.blurb), { disabled: g.drafted });
    if (vm.selected) {
      p.text(vm.selected.name + '：' + vm.selected.blurb);
      for (const o of vm.selected.slotOptions) p.button('slot:' + o.slot, o.label + (o.score === null ? '' : ' ' + o.score + ' ' + o.fit));
      p.button('sheet:close', '取消');
    }
    p.text(vm.lineup.map((e) => e.label + (e.name ? e.name : '—')).join(' '));
    if (vm.canUndo) p.button('undo', '撤回');
    p.y = Math.max(p.y, p.L.thumbTop);
    p.button('primary', vm.primaryLabel, { disabled: vm.phase === 'flipped' || vm.phase === 'selecting' || vm.primaryDisabled });
    if (vm.coach) p.button('coach:next', '下一步 (' + vm.coach + '/3)');
  },
  result(p, vm) {
    p.button('result:back', '‹ 首页', { w: 88 });
    p.text(vm.mode + '  [' + vm.status + ']');
    if (vm.status === 'revealing') {
      p.text('第 ' + Math.floor(vm.revealCount) + ' 战…');
      p.hits.push({ id: 'result:skip', x: 0, y: 0, w: p.L.W, h: p.L.H });
      return;
    }
    if (vm.status === 'waitingServer') return p.text('军报传递中…');
    if (vm.status === 'pendingSubmit' || vm.status === 'error') {
      p.text(vm.status === 'pendingSubmit' ? '战报待发送' : '出错了');
      return p.button('result:retry', '重试');
    }
    if (vm.reveal && vm.reveal.pending) {
      p.text('五德揭晓 ' + vm.reveal.step + '/5');
      p.hits.push({ id: 'result:revealSkip', x: 0, y: 0, w: p.L.W, h: p.L.H });
    }
    p.text(vm.record.w + ' 胜 ' + vm.record.l + ' 负  ' + vm.band.label + (vm.variantLabel ? ' · ' + vm.variantLabel : ''), 24);
    if (vm.streak && vm.streak.text) p.text(vm.streak.text);
    p.text(vm.comment);
    if (vm.rarityText) p.text(vm.rarityText);
    if (vm.challenge) p.text('好友 ' + vm.challenge.theirRecord.w + '-' + vm.challenge.theirRecord.l);
    p.button('result:breakdown', '战报明细');
    p.button('result:share', '分享战报');
    p.button('result:challenge', '发起挑战');
    p.button('result:save', '保存图片');
    if (vm.subscribe.state === 'offer') p.button('result:subscribe', '好友应战时提醒我');
    p.button('result:replay', vm.replay.unlocked ? '查看复盘' : '▶ 复盘·最佳阵容');
    p.button('result:board', vm.boardLabel);
    p.button('result:again', '再来一局');
    if (vm.sheet) {
      p.hits.push({ id: 'sheet:close', x: 0, y: 0, w: p.L.W, h: 60 });
      p.text(vm.sheet === 'replay' && vm.replay.best ? '复盘 ' + vm.replay.best.record.w + '-' + vm.replay.best.record.l : '明细');
    }
  },
  challenge(p, vm) {
    p.text('战书  [' + vm.status + ']  ' + vm.theirRecord.w + '-' + vm.theirRecord.l);
    if (vm.status === 'ready') {
      p.button('challenge:accept', '接受挑战');
      p.button('challenge:home', '先去首页看看');
    } else if (vm.status === 'expired') {
      p.button('challenge:free', '去自由点将');
      p.button('challenge:daily', '今日军令');
    } else if (vm.status === 'offline' || vm.status === 'error') {
      p.button('challenge:retry', '重试');
      p.button('challenge:free', '自由点将');
    } else if (vm.status === 'answered') p.button('challenge:compare', '查看对比');
    else {
      if (vm.subscribe && vm.subscribe.state === 'offer') p.button('challenge:subscribe', '好友应战时提醒我');
      p.button('challenge:home', '返回首页');
    }
  },
  history(p, vm) {
    p.button('history:back', '‹ 返回', { w: 88 });
    p.text('往期军令  ' + (vm.bestStreakText || '') + '  [' + vm.state + ']');
    if (vm.state === 'offline' || vm.state === 'error') p.button('history:retry', '重试');
    for (const it of vm.items.slice(0, 8)) p.button('history:item:' + it.dateKey, '第' + it.issueNo + '期 ' + it.dateText + (it.variantLabel ? ' ' + it.variantLabel : '') + ' ' + (it.mine ? it.mine.record.w + '胜' + it.mine.record.l + '负' : '未出征') + (it.statusText ? ' ' + it.statusText : ''));
  },
  historyIssue(p, vm) {
    p.button('issue:back', '‹ 往期', { w: 88 });
    p.text('第' + vm.issueNo + '期  ' + (vm.mine ? vm.mine.record.w + '胜' + vm.mine.record.l + '负' : '未出征'));
    if (vm.stats) p.text(vm.stats.totalText);
    if (vm.best) p.text('本期最佳 ' + vm.best.record.w + '胜' + vm.best.record.l + '负');
    if (vm.bestLockedText) p.text(vm.bestLockedText);
  },
  board(p, vm) {
    p.button('board:back', '‹ 返回', { w: 88 });
    p.text((vm.kind === 'group' ? '本群' : '好友') + ' · 今日军令 第' + vm.issueNo + '期  [' + vm.state + ']');
    if (vm.state === 'ready') p.hits.push({ id: 'board:list', x: p.L.board.x, y: p.L.board.y, w: p.L.board.w, h: p.L.board.h });
    if (vm.state === 'serverError') p.button('board:retry', '重试');
    if (vm.state === 'empty') p.button('board:goPlay', '去出征');
    if (vm.state === 'privacyDenied') {
      p.button('board:contract', '查看指引');
      p.button('board:agree', '同意并查看');
    }
    if (vm.state === 'unauthorized') p.button('board:openSetting', '去设置开启');
    if (vm.actions.canShareToGroup) p.button('board:share', '分享到本群');
  },
};

function draw(screen, ctx, vm, layout) {
  ctx.fillStyle = '#F5EFE0';
  ctx.fillRect(0, 0, layout.W, layout.H);
  const p = new Pen(ctx, layout);
  drawers[screen](p, vm);
  const hits = p.hits;
  hits.scrollMax = {};
  return hits;
}

function drawOverlay(ctx, ov, layout) {
  const hits = [];
  if (!ov) return hits;
  const box = (id, label, y) => {
    ctx.fillStyle = '#7A5230';
    ctx.fillRect(layout.x0, y, layout.contentW, 48);
    ctx.fillStyle = '#fff';
    ctx.font = '16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, layout.cx, y + 30);
    hits.push({ id, x: layout.x0, y, w: layout.contentW, h: 48 });
  };
  if (ov.dialog) {
    hits.push({ id: 'dialog:block', x: 0, y: 0, w: layout.W, h: layout.H });
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, 0, layout.W, layout.H);
    ctx.fillStyle = '#fff';
    ctx.fillText(ov.dialog.text, layout.cx, layout.H / 2 - 20);
    box('dialog:confirm', ov.dialog.confirmLabel, layout.H / 2);
    if (ov.dialog.cancelLabel) box('dialog:cancel', ov.dialog.cancelLabel, layout.H / 2 + 56);
  }
  if (ov.adStub) {
    hits.push({ id: 'adstub:block', x: 0, y: 0, w: layout.W, h: layout.H });
    ctx.fillStyle = 'rgba(0,0,0,0.8)';
    ctx.fillRect(0, 0, layout.W, layout.H);
    ctx.fillStyle = '#fff';
    ctx.fillText('广告位（测试）' + ov.adStub.secondsLeft, layout.cx, layout.H / 2 - 20);
    if (ov.adStub.secondsLeft === 0) box('adstub:complete', '完成', layout.H / 2);
    box('adstub:skip', '跳过', layout.H / 2 + 56);
  }
  if (ov.toast) {
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(layout.x0, layout.H * 0.7, layout.contentW, 40);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.fillText(ov.toast.text, layout.cx, layout.H * 0.7 + 26);
  }
  return hits;
}

module.exports = { draw, drawOverlay, stubLayout };
