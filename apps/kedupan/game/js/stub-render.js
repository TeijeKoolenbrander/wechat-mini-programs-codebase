/**
 * Stub renderer: boxes and labels only, so the game runs and is testable before (or without) the real
 * js/render/* from frontend-ui, and as the fallback when that renderer is missing or throws. Same contract:
 *   draw(screen, ctx, vm, layout) -> hitAreas[{id,x,y,w,h}] (+ .scrollMax)
 *   drawOverlay(ctx, overlayVm, layout) -> hitAreas
 * It emits every hit id listed in js/README.md. The ruler hit area spans exactly the track (x..x+w maps to 0..100).
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
    thumbTop: H * 0.55,
    odcRect: { x: pad, y: navBottom + 120, w: W - 2 * pad, h: Math.max(160, H - navBottom - 120 - safeBottom - 120) },
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
    if (s === null || s === undefined || s === '') return;
    const c = this.ctx;
    c.fillStyle = '#24211E';
    c.font = (size || 16) + 'px sans-serif';
    c.textAlign = 'left';
    c.fillText(String(s), this.L.x0, this.y + (size || 16));
    this.y += (size || 16) + 6;
  }
  button(id, label, opts) {
    const L = this.L;
    const o = opts || {};
    const h = 48;
    const w = o.w || L.contentW;
    const x = o.x === undefined ? L.x0 : o.x;
    const c = this.ctx;
    c.fillStyle = o.disabled ? '#ccc' : '#F07B2C';
    c.fillRect(x, this.y, w, h);
    c.fillStyle = '#fff';
    c.font = '16px sans-serif';
    c.textAlign = 'center';
    c.fillText(label, x + w / 2, this.y + 30);
    if (!o.disabled) this.hits.push({ id, x, y: this.y, w, h });
    if (!o.inline) this.y += h + 6;
  }
  ruler() {
    const L = this.L;
    const c = this.ctx;
    c.fillStyle = '#ddd';
    c.fillRect(L.x0, this.y, L.contentW, 64);
    this.hits.push({ id: 'ruler', x: L.x0, y: this.y, w: L.contentW, h: 64 });
    this.y += 70;
  }
}

const sign = (n) => (n === null || n === undefined ? '' : String(n));

const drawers = {
  home(p, vm) {
    p.text('群友刻度盘', 28);
    p.text(vm.daily.title);
    p.text(vm.daily.statusText);
    p.text(vm.daily.yesterdayText);
    p.text(vm.daily.streakText);
    p.text(vm.daily.subline);
    if (vm.group.status === 'ok') p.button('home:groupBanner', vm.group.bannerText);
    if (vm.daily.primaryLabel) p.button('home:daily', vm.daily.primaryLabel);
    p.button('home:host', '出一道题');
    p.button('home:archive', '往期刻度');
    p.button('home:group', '本群');
    p.button('home:friend', '好友榜');
    p.button('home:howto', '玩法');
    p.button('home:sound', vm.muted ? '声音 关' : '声音 开');
    p.button('home:settings', '设置');
    if (vm.sheet) {
      p.y = p.L.navBottom + 4;
      p.ctx.fillStyle = 'rgba(255,255,255,0.97)';
      p.ctx.fillRect(0, p.y, p.L.W, p.L.H);
      p.hits.length = 0;
      if (vm.sheet === 'howto') vm.howto.lines.forEach((l) => p.text(l));
      else {
        const st = vm.settings;
        p.text('设置');
        p.button('settings:sound', st.muted ? '声音：关' : '声音：开');
        p.button('settings:large', st.largeText ? '大字模式：开' : '大字模式：关');
        p.button('settings:contrast', st.highContrast ? '高对比度：开' : '高对比度：关');
        p.text(st.friendLine);
        if (st.canOpenSetting) p.button('settings:openSetting', '去设置');
        p.button('settings:privacy', '用户隐私保护指引');
        p.button('settings:feedback', '联系我们/反馈');
      }
      p.button('sheet:close', '知道了');
    }
  },
  card(p, vm) {
    p.button('back', '‹ 返回', { w: 88 });
    p.text(vm.headerText + '   ' + vm.progressText);
    if (vm.tag) p.text(vm.tag);
    p.text(vm.card.catLabel);
    p.text(vm.card.prompt, 28);
    p.text(vm.card.left + ' ↔ ' + vm.card.right);
    if (vm.hint) p.text(vm.hint);
    if (vm.coach) p.button('coach:ok', '知道了');
    p.y = Math.max(p.y, p.L.thumbTop);
    p.ruler();
    if (vm.needle !== null) p.text('指针 ' + vm.needle);
    if (vm.phase === 'empty' || vm.phase === 'placing') {
      p.button('card:left', '‹', { x: p.L.x0, w: 56, inline: true });
      p.button('card:right', '›', { x: p.L.x0 + p.L.contentW - 56, w: 56 });
    }
    if (vm.reveal) {
      p.text(vm.reveal.label + '  ' + vm.reveal.scoreText);
      p.text(vm.reveal.nationText);
      p.text(vm.reveal.agreeText);
      p.text(vm.reveal.groupText);
      p.text(vm.reveal.markers.map((m) => m.kind[0] + m.pos).join(' '));
    }
    if (vm.pendingText) p.text(vm.pendingText);
    p.button('card:primary', vm.phase === 'submitting' ? '提交中…' : vm.primaryLabel, { disabled: !vm.canConfirm });
    if (vm.canReport) p.button('card:report', '这张卡有问题?');
    if (vm.sheet === 'report') {
      p.hits.length = 0;
      p.y = p.L.navBottom + 4;
      p.ctx.fillStyle = 'rgba(255,255,255,0.97)';
      p.ctx.fillRect(0, p.y, p.L.W, p.L.H);
      p.button('report:unsuitable', '不合适');
      p.button('report:ambiguous', '有歧义');
      p.button('report:typo', '有错字');
      p.button('report:cancel', '取消');
    }
  },
  result(p, vm) {
    p.button('back', '‹ 首页', { w: 88 });
    p.text('每日刻度 · 第 ' + vm.issueNo + ' 期');
    p.text(vm.totalText + '  ' + vm.bandLabel + '  (' + vm.statusTag + ')', 28);
    p.text(vm.percentileText);
    vm.rows.forEach((r) => p.text(r.prompt + ' ' + r.left + '↔' + r.right + ' ' + sign(r.you) + '/' + sign(r.nation) + ' ' + r.scoreText, 14));
    p.text(vm.divisiveText);
    p.text(vm.streakText);
    p.text(vm.groupText);
    p.text(vm.offlineNote);
    p.button('result:share', '分享');
    p.button('result:group', '本群');
    p.button('result:friend', '好友榜');
    p.button('result:bonus', vm.bonusText);
    p.button('result:dist', vm.distribution.unlocked ? '全国分布' : vm.distributionText);
    p.button('result:host', '出一道题');
    p.button('result:archive', '往期刻度');
    if (vm.sheet === 'distribution') {
      p.hits.length = 0;
      p.y = p.L.navBottom + 4;
      p.ctx.fillStyle = 'rgba(255,255,255,0.97)';
      p.ctx.fillRect(0, p.y, p.L.W, p.L.H);
      p.text('全国分布');
      p.button('sheet:close', '关闭');
    }
  },
  archive(p, vm) {
    p.button('back', '‹ 返回', { w: 88 });
    p.text(vm.title + '  ' + (vm.bestStreakText || ''));
    p.text(vm.emptyText);
    p.text(vm.errorText);
    p.text(vm.offlineNote);
    vm.items.slice(0, 6).forEach((it) => p.button('archive:item:' + it.dateKey, '第' + it.issueNo + '期 ' + it.dateText + ' ' + it.statusText));
    if (vm.hasMore) p.button('archive:more', '加载更多');
    if (vm.state === 'error' || vm.state === 'offline') p.button('archive:retry', '重试');
  },
  archiveDay(p, vm) {
    p.button('back', '‹ 返回', { w: 88 });
    p.text('往期 第 ' + vm.issueNo + ' 期 ' + vm.dateText + ' [' + vm.kind + ']');
    if (vm.mine) p.text(vm.mine.totalText + ' ' + (vm.bandLabel || '') + ' ' + (vm.mine.percentileText || ''));
    p.text(vm.practiceText);
    p.button('archiveDay:dist', vm.distribution.unlocked ? '全国分布' : '▶ 视频 全国分布');
    if (vm.done) p.button('archiveDay:next', '再来一期');
    p.button('archiveDay:list', '返回列表');
    if (vm.sheet === 'distribution') {
      p.hits.length = 0;
      p.y = p.L.navBottom + 4;
      p.ctx.fillStyle = 'rgba(255,255,255,0.97)';
      p.ctx.fillRect(0, p.y, p.L.W, p.L.H);
      p.text('全国分布');
      p.button('sheet:close', '关闭');
    }
  },
  create(p, vm) {
    p.button('back', '‹ 返回', { w: 88 });
    p.text('出一道题');
    p.text(vm.errorText);
    p.text(vm.rateLimitedText);
    if (vm.step === 'pickSpectrum' || vm.step === 'creating' || vm.step === 'error') {
      vm.spectra.forEach((s) => p.button('create:spectrum:' + s.id, s.left + ' ↔ ' + s.right));
      p.button('create:swapFree', '换一组 (免费)', { disabled: vm.freeSwapLeft <= 0 });
      if (vm.freeSwapLeft <= 0) p.button('create:swapAd', '▶ 视频 换一批', { disabled: vm.adSwapLeft <= 0 });
      p.text(vm.swapHint);
      if (vm.step === 'error') p.button('create:retry', '重试');
    }
    if (vm.step === 'pickClue' || vm.step === 'sharing') {
      p.text(vm.spectrum.left + ' ↔ ' + vm.spectrum.right + '  ' + vm.secretNote);
      if (vm.targetBand) p.text('目标带 ' + vm.targetBand.from + '-' + vm.targetBand.to);
      p.text(vm.clueTitle);
      p.button('create:mode:preset', '选一个提示词', { x: p.L.x0, w: p.L.contentW / 2 - 4, inline: true });
      p.button('create:mode:chat', '我在群里说', { x: p.L.x0 + p.L.contentW / 2 + 4, w: p.L.contentW / 2 - 4 });
      p.text(vm.chatHint);
      if (vm.clueMode === 'preset') {
        vm.clueOptions.forEach((o) => p.button('create:clue:' + o.itemId, (vm.clueItemId === o.itemId ? '✓ ' : '') + o.text));
        p.button('create:clueSwap', '换一批', { disabled: vm.clueSwapLeft <= 0 });
      }
      p.button('create:share', '发到群里', { disabled: !vm.canShare });
    }
  },
  round(p, vm) {
    p.button('back', '‹ 返回', { w: 88 });
    p.text(vm.headerText);
    p.text(vm.errorText);
    p.text('[' + vm.status + ']');
    p.text(vm.guessCountText);
    p.text(vm.revealHint);
    if (vm.hostBand) p.text('目标带 ' + vm.hostBand.from + '-' + vm.hostBand.to);
    const placingNow = vm.status === 'open' || (vm.status === 'revealedUnplayed' && vm.lateMode);
    if (placingNow) {
      p.y = Math.max(p.y, p.L.thumbTop - 60);
      p.ruler();
      if (vm.needle !== null) p.text('指针 ' + vm.needle);
      p.button('round:left', '‹', { x: p.L.x0, w: 56, inline: true });
      p.button('round:right', '›', { x: p.L.x0 + p.L.contentW - 56, w: 56 });
      p.button('round:primary', '就这儿', { disabled: !vm.canConfirm });
    }
    if (vm.status === 'hostWaiting') {
      p.button('round:primary', '揭晓', { disabled: !vm.canReveal });
      p.button('round:share', '再发到群里');
    }
    if (vm.reveal) {
      p.text(vm.reveal.mqText);
      p.text(vm.reveal.markers.map((m) => m.kind[0] + m.pos).join(' '));
      p.text(vm.namesNote);
      if (vm.namesNote) {
        p.button('round:names', '显示昵称');
        p.button('round:settings', '去设置');
      }
      p.button('round:share', '分享揭晓');
      p.button('round:host', '我也出一道');
    }
    if (vm.status === 'revealedUnplayed' && !vm.lateMode) {
      p.button('round:late', '先猜再看', { disabled: !vm.canLate });
      p.button('round:view', '直接看答案');
    }
    if (vm.subscribe.state === 'offer') p.button('round:subscribe', '提醒我');
    if (vm.status === 'offline') p.button('round:retry', '重试');
    if (vm.status === 'noGuesses') {
      p.button('round:host', '再出一道');
      p.button('round:daily', '去每日刻度');
    }
    if (vm.status === 'notFound' || vm.status === 'expired' || vm.status === 'submitted' || vm.status === 'open') p.button('round:home', '回首页');
    p.button('round:refresh', '刷新', { w: 88 });
  },
  group(p, vm) {
    p.button('back', '‹ 返回', { w: 88 });
    p.text('本群 · 第 ' + vm.issueNo + ' 期');
    p.text(vm.mqText);
    p.text(vm.countText);
    p.text(vm.divisiveText);
    p.text(vm.stateText);
    p.text(vm.explainer);
    p.text(vm.notice);
    p.text(vm.trend.map((t) => (t.value === null ? '—' : t.value)).join(' '));
    vm.rounds.forEach((r) => p.button('group:round:' + r.roundId, r.title + ' ' + (r.mqText || '') + ' ' + r.statusText));
    if (vm.state === 'ready' || vm.state === 'small') p.hits.push({ id: 'board:list', x: p.L.odcRect.x, y: p.L.odcRect.y, w: p.L.odcRect.w, h: p.L.odcRect.h });
    if (vm.state === 'serverError') p.button('group:retry', '重试');
    if (vm.state === 'empty' || vm.state === 'notPlayed') p.button('group:play', '去答题');
    if (vm.state === 'privacyDenied') {
      p.button('group:contract', '查看指引');
      p.button('group:agree', '同意并查看');
    }
    if (vm.state === 'unauthorized') p.button('group:openSetting', '去设置开启');
    p.button('group:share', '分享到本群');
  },
  friend(p, vm) {
    p.button('back', '‹ 返回', { w: 88 });
    p.text(vm.title + ' 第 ' + vm.issueNo + ' 期');
    p.text(vm.stateText);
    p.text(vm.selfText);
    if (vm.state === 'ready') p.hits.push({ id: 'board:list', x: p.L.odcRect.x, y: p.L.odcRect.y, w: p.L.odcRect.w, h: p.L.odcRect.h });
    if (vm.state === 'serverError') p.button('friend:retry', '重试');
    if (vm.state === 'empty') p.button('friend:play', '去答题');
    if (vm.state === 'privacyDenied') {
      p.button('friend:contract', '查看指引');
      p.button('friend:agree', '同意并查看');
    }
    if (vm.state === 'unauthorized') p.button('friend:openSetting', '去设置开启');
  },
};

function draw(screen, ctx, vm, layout) {
  ctx.fillStyle = '#FBF6EC';
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
    ctx.fillStyle = '#24211E';
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
