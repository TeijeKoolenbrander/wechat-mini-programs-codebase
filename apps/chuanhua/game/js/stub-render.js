/**
 * Stub renderer: boxes and labels only, so the game is runnable (and testable) before the real js/render/*
 * (frontend-ui) lands. Same contract as the real renderers (js/CONTRACT.md):
 *   draw(screen, ctx, vm, layout) -> hitAreas[{id,x,y,w,h}]   (+ hitAreas.scrollMax = {})
 *   drawOverlay(ctx, overlayVm, layout) -> hitAreas
 * It emits every hit id of the contract, and `draw:canvas` for the drawing area.
 */

function stubLayout(info) {
  const W = info.windowWidth;
  const H = info.windowHeight;
  const sb = info.statusBarHeight || 20;
  const m = info.menuRect || { left: W - 94, right: W - 7, top: sb + 6, bottom: sb + 38 };
  const navBottom = m.bottom + (m.top - sb);
  const safeBottom = info.safeArea && info.safeArea.bottom != null ? Math.max(0, H - info.safeArea.bottom) : 0;
  const pad = 16;
  const side = Math.min(W - 2 * pad, Math.max(160, H * 0.42));
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
    canvas: { x: pad, y: navBottom + 96, w: side, h: side },
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
    c.fillStyle = o.disabled ? '#ccc' : '#444';
    c.fillRect(x, this.y, w, h);
    c.fillStyle = '#fff';
    c.font = '16px sans-serif';
    c.textAlign = 'center';
    c.fillText(label, x + w / 2, this.y + 30);
    if (!o.disabled) this.hits.push({ id, x, y: this.y, w, h });
    if (!o.inline) this.y += h + 8;
  }
}

const ENTRY_BUTTONS = (p, vm) => {
  if (vm.primary) p.button(vm.state === 'revealedParticipant' ? 'entry:reveal' : 'entry:claim', vm.primary.label);
  if (vm.canRevealNow) p.button('entry:revealNow', '现在揭晓');
  if (vm.canShare) p.button('entry:share', '发到群里接龙');
  if (vm.subscribe.state === 'offer') p.button('entry:subscribe', '揭晓时提醒我');
  if (vm.canSeeMine) p.button('entry:mine', '看我的那一棒');
  if (vm.canSameAgain) p.button('entry:same', '同题再传');
  if (vm.showOthers) p.button('entry:others', '看看本群其他接龙');
  if (vm.showNew) p.button('entry:new', '开一条新的');
  if (vm.retry) p.button('entry:retry', '重试');
  if (vm.state === 'removed' || vm.state === 'notFound') p.button('entry:home', '首页');
};

const drawers = {
  home(p, vm) {
    p.text('传画接龙', 28);
    p.text('今日起点 · ' + vm.daily.dateText + '  [' + vm.state + ']');
    p.text(vm.daily.prompts.map((x) => x.text).join(' · '));
    if (vm.daily.countText) p.text(vm.daily.countText);
    if (vm.streakText) p.text(vm.streakText);
    if (vm.restriction) p.text(vm.restriction.text);
    if (vm.ugcPausedText) p.text(vm.ugcPausedText);
    if (vm.offlineText) p.text(vm.offlineText);
    if (vm.groupLine.show) p.button('home:group', vm.groupLine.text);
    p.button('home:start', vm.start.label + (vm.start.sublabel ? ' · ' + vm.start.sublabel : ''), { disabled: !vm.start.enabled });
    if (vm.start.adLabel) p.button('home:adStart', vm.start.adLabel);
    if (vm.state === 'offline' || vm.state === 'error') p.button('home:retry', '重试');
    p.button('home:album', '我的接龙' + (vm.album.unseenReveals ? ' (' + vm.album.unseenReveals + ' 条揭晓)' : ''));
    p.button('home:group', '本群接龙');
    p.button('home:howto', '玩法');
    p.button('home:settings', '设置');
  },
  picker(p, vm) {
    p.button('back', '‹ 返回', { w: 88 });
    p.text('选一个起点，你来画第 1 棒');
    for (const x of vm.prompts) p.button('picker:prompt:' + x.id, (x.id === vm.selectedId ? '● ' : '○ ') + x.text);
    p.button('picker:batch', '换一批');
    if (vm.custom.open) {
      p.button('picker:customInput', vm.custom.text + '  ' + vm.custom.count);
      if (vm.custom.error) p.text(vm.custom.error);
    } else p.button('picker:custom', '自己出题');
    if (vm.errorText) p.text(vm.errorText);
    if (vm.state === 'offline') p.button('picker:retry', '重试');
    p.button('picker:start', vm.startLabel, { disabled: !vm.canStart });
  },
  draw(p, vm) {
    p.button('back', '‹ 放弃', { w: 88 });
    p.text(vm.title + '   ' + vm.timer.text);
    p.text(vm.sourceLabel);
    if (vm.canReport) p.button('draw:report', '举报', { w: 88, inline: true });
    const cv = p.L.canvas;
    p.ctx.fillStyle = '#fff';
    p.ctx.fillRect(cv.x, cv.y, cv.w, cv.h);
    p.hits.push({ id: 'draw:canvas', x: cv.x, y: cv.y, w: cv.w, h: cv.h });
    p.y = cv.y + cv.h + 8;
    if (vm.notice) p.text(vm.notice);
    if (vm.coach) p.text(vm.coach);
    if (vm.errorText) p.text(vm.errorText);
    const sw = Math.floor(p.L.contentW / 6);
    let k = 0;
    for (const c of vm.palette.filter((x) => !x.locked)) {
      const x = p.L.x0 + (k % 6) * sw;
      if (k > 0 && k % 6 === 0) p.y += 44;
      p.ctx.fillStyle = c.color;
      p.ctx.fillRect(x, p.y, sw - 4, 40);
      p.hits.push({ id: 'draw:color:' + c.idx, x, y: p.y, w: sw - 4, h: 48 });
      k++;
    }
    p.y += 52;
    if (vm.paletteAd.show) p.button('draw:paletteAd', '▶ 今日彩笔', { w: 120 });
    for (let i = 0; i < 3; i++) p.hits.push({ id: 'draw:size:' + i, x: p.L.x0 + i * 52, y: p.y, w: 48, h: 48 });
    p.hits.push({ id: 'draw:undo', x: p.L.x0 + 170, y: p.y, w: 70, h: 48 });
    p.hits.push({ id: 'draw:clear', x: p.L.x0 + 250, y: p.y, w: 70, h: 48 });
    p.y += 56;
    if (vm.status === 'error') p.button('draw:retry', '重试');
    p.button('draw:done', vm.status === 'submitting' ? '正在传出…' : '画好了', { disabled: !vm.canSubmit });
  },
  describe(p, vm) {
    p.button('back', '‹ 放弃', { w: 88 });
    p.text(vm.title + '   ' + vm.timer.text);
    p.button('describe:report', '举报', { w: 88 });
    p.text('这画的是：');
    p.button('describe:input', (vm.text || vm.placeholder) + '  ' + vm.count);
    if (vm.errorText) p.text(vm.errorText);
    p.button('describe:submit', vm.status === 'submitting' ? '审核中…' : '传出去', { disabled: !vm.canSubmit });
  },
  sent(p, vm) {
    p.button('back', '‹ 首页', { w: 88 });
    p.text(vm.title, 24);
    p.text(vm.modText);
    if (vm.nextText) p.text(vm.nextText);
    if (vm.explainerText) p.text(vm.explainerText);
    if (vm.canShare) p.button('sent:share', '发到群里接龙');
    if (vm.subscribe.state === 'offer') p.button('sent:subscribe', '揭晓时提醒我');
    p.button('sent:group', '看看本群其他接龙');
    p.button('sent:again', '再开一条');
  },
  entry(p, vm) {
    p.text('传画接龙', 24);
    p.text(vm.progressText + '  [' + vm.state + ']');
    p.text(vm.headline, 20);
    if (vm.subline) p.text(vm.subline);
    if (vm.limitText) p.text(vm.limitText);
    if (vm.timeLeftText) p.text('48 小时内传完 · ' + vm.timeLeftText);
    ENTRY_BUTTONS(p, vm);
    p.button('back', '‹ 返回', { w: 88 });
  },
  reveal(p, vm) {
    p.button('back', '‹ 返回', { w: 88 });
    if (vm.state !== 'ready') {
      if (vm.messageText) p.text(vm.messageText);
      if (vm.state === 'offline' || vm.state === 'error') p.button('reveal:retry', '重试');
      return;
    }
    p.text(vm.header);
    if (vm.earlyText) p.text(vm.earlyText);
    p.text('起点：' + vm.prompt.text);
    for (const s of vm.steps) {
      p.text(s.label + (s.placeholderText ? ' ' + s.placeholderText : s.text ? ' 「' + s.text + '」' : ' [画]') + '  笑 ' + s.laughs);
      if (s.kind === 'draw' && !s.placeholder) p.hits.push({ id: 'reveal:panel:' + s.n, x: p.L.x0, y: p.y - 24, w: 120, h: 24 });
      if (!s.placeholder) p.hits.push({ id: 'reveal:laugh:' + s.n, x: p.L.x0 + 130, y: p.y - 24, w: 60, h: 24 });
      if (s.canReport) p.hits.push({ id: 'reveal:report:' + s.n, x: p.L.x0 + 200, y: p.y - 24, w: 60, h: 24 });
    }
    p.text(vm.summaryText);
    if (vm.nationalText) p.text(vm.nationalText);
    p.button('reveal:share', '分享揭晓卡');
    if (vm.canSameAgain) p.button('reveal:same', '同题再传');
    p.button('reveal:replay', '重播');
    if (vm.autoplay.playing) p.hits.push({ id: 'reveal:skip', x: 0, y: 0, w: p.L.W, h: p.L.H });
  },
  teaser(p, vm) {
    p.button('back', '‹ 返回', { w: 88 });
    if (vm.state !== 'ready') {
      p.text(vm.state === 'removed' ? '该接龙已被移除' : vm.state === 'notFound' ? '找不到这条接龙' : '需联网查看');
      if (vm.state === 'offline') p.button('teaser:retry', '重试');
      else p.button('teaser:home', '首页');
      return;
    }
    p.text('一条接龙揭晓了', 22);
    p.text('「' + vm.promptText + '」');
    p.text(vm.summary);
    if (vm.finalText) p.text('「' + vm.finalText + '」');
    p.text(vm.notice);
    if (vm.canSameAgain) p.button('teaser:same', '同题再传');
    p.button('teaser:others', '看看本群其他接龙');
    p.button('teaser:report', '举报', { w: 88 });
  },
  group(p, vm) {
    p.button('back', '‹ 返回', { w: 88 });
    p.text('本群接龙  [' + vm.state + ']');
    if (vm.statsText) p.text(vm.statsText);
    if (vm.explainer) p.text(vm.explainer);
    if (vm.emptyText) p.text(vm.emptyText);
    if (vm.errorText) p.button('group:retry', '重试');
    vm.waiting.forEach((x) => p.button('group:chain:' + x.chainId, x.line));
    vm.inProgress.forEach((x) => p.button('group:chain:' + x.chainId, x.line));
    vm.revealed.forEach((x) => p.button('group:reveal:' + x.chainId, x.line));
    p.button('group:new', '开一条接龙');
  },
  album(p, vm) {
    p.button('back', '‹ 返回', { w: 88 });
    p.text('我的接龙  ' + (vm.streakText || '') + '  [' + vm.state + ']');
    if (vm.emptyText) p.text(vm.emptyText);
    if (vm.staleNote) p.text(vm.staleNote);
    if (vm.state === 'error' || vm.state === 'offline') p.button('album:retry', '重试');
    vm.items.forEach((x) => p.button('album:item:' + x.chainId, (x.unseen ? '● ' : '') + x.line + ' ' + x.timeText));
    if (vm.cursor) p.button('album:more', '更多');
  },
  detail(p, vm) {
    p.button('back', '‹ 返回', { w: 88 });
    p.text('我的这几棒  [' + (vm.state || 'ready') + ']');
    vm.mine.forEach((m) => {
      p.text('第 ' + m.n + ' 棒 ' + (m.text ? '「' + m.text + '」' : '[画]') + ' ' + m.modText);
      if (m.canDelete) p.button('detail:delete:' + m.n, '删除这一棒');
    });
    if (vm.state === 'offline' || vm.state === 'error') p.button('detail:retry', '重试');
  },
  settings(p, vm) {
    p.button('back', '‹ 返回', { w: 88 });
    p.text('设置');
    p.button('settings:sound', vm.muted ? '声音：关' : '声音：开');
    p.button('settings:large', vm.largeText ? '大字模式：开' : '大字模式：关');
    p.button('settings:contrast', vm.highContrast ? '高对比度：开' : '高对比度：关');
    if (vm.canUnlockPalette) p.button('settings:palette', '▶ 看视频解锁今日彩笔');
    p.button('settings:rules', '接龙公约');
    p.button('settings:agreement', '用户协议');
    p.button('settings:privacy', '用户隐私保护指引');
    p.button('settings:feedback', '反馈');
    p.button('settings:delete', '删除我的全部接龙内容');
  },
};

function draw(screen, ctx, vm, layout) {
  ctx.fillStyle = '#F7F1E6';
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
  if (ov.sheet) {
    hits.push({ id: 'sheet:block', x: 0, y: 0, w: layout.W, h: layout.H });
    ctx.fillStyle = 'rgba(255,255,255,0.97)';
    ctx.fillRect(0, layout.navBottom, layout.W, layout.H);
    ctx.fillStyle = '#222';
    ctx.font = '16px sans-serif';
    ctx.textAlign = 'left';
    let y = layout.navBottom + 24;
    const line = (s) => {
      ctx.fillText(s, layout.x0, y);
      y += 24;
    };
    const k = ov.sheet.kind;
    if (k === 'rules') {
      line('接龙公约');
      ov.sheet.vm.lines.forEach(line);
      box('rules:privacy', '《用户隐私保护指引》', y);
      y += 52;
      box('rules:agreement', '《用户协议》', y);
      y += 52;
      box('rules:later', '先看看', y);
      y += 52;
      box('rules:agree', '同意并开始', y);
    } else if (k === 'howto') {
      ov.sheet.vm.lines.forEach(line);
      line(ov.sheet.vm.footer);
      box('sheet:close', '知道了', y);
    } else if (k === 'warn') {
      line(ov.sheet.vm.text);
      box('sheet:ack', '知道了', y + 8);
    } else if (k === 'report') {
      line('举报');
      for (const r of ov.sheet.vm.reasons) {
        box('report:reason:' + r, (ov.sheet.vm.selected === r ? '● ' : '○ ') + ov.sheet.vm.reasonLabels[r], y);
        y += 52;
      }
      if (ov.sheet.vm.message) line(ov.sheet.vm.message);
      box('report:submit', '提交举报', y);
      y += 52;
      box('report:cancel', '取消', y);
    }
  }
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
