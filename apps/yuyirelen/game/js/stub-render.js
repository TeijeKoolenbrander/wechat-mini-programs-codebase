/**
 * Stub renderer: boxes and labels only, so the game runs before (or without) the real
 * js/render/* from frontend-ui. Same contract as the real renderers:
 *   draw(screen, ctx, vm, layout) -> hitAreas[{id,x,y,w,h}]   (+ hitAreas.scrollMax)
 *   drawOverlay(ctx, overlayVm, layout) -> hitAreas
 * It emits every hit id listed in js/HOOKS.md. It is NOT the product's look.
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

/** A real layout may lack some stub fields: fill them from W/H so the stub never throws. */
function fill(L) {
  if (L && L.x0 !== undefined && L.contentW !== undefined && L.navBottom !== undefined && L.thumbTop !== undefined && L.board) return L;
  const base = stubLayout({ windowWidth: (L && L.W) || 375, windowHeight: (L && L.H) || 667, statusBarHeight: (L && L.statusBar) || 20 });
  return Object.assign(base, L || {}, { x0: base.x0, contentW: base.contentW, thumbTop: base.thumbTop, board: (L && L.board) || base.board });
}

class Pen {
  constructor(ctx, L) {
    this.ctx = ctx;
    this.L = L;
    this.y = L.navBottom + 4;
    this.hits = [];
    this.hits.scrollMax = {};
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
    const h = o.h || 48;
    const w = o.w || L.contentW;
    const x = o.x === undefined ? L.x0 : o.x;
    const c = this.ctx;
    c.fillStyle = o.disabled ? '#ccc' : o.color || '#B5432B';
    c.fillRect(x, this.y, w, h);
    c.fillStyle = '#fff';
    c.font = '16px sans-serif';
    c.textAlign = 'center';
    c.fillText(label, x + w / 2, this.y + h / 2 + 6);
    if (!o.disabled) this.hits.push({ id, x, y: this.y, w, h });
    if (!o.inline) this.y += h + 8;
  }
  /** a row of equal buttons: items [{id,label,disabled}] */
  row(prefix, items, perRow) {
    const L = this.L;
    const n = perRow || 3;
    const w = (L.contentW - (n - 1) * 8) / n;
    for (let i = 0; i < items.length; i += n) {
      const saved = this.y;
      for (let j = 0; j < n && i + j < items.length; j++) {
        this.y = saved;
        const it = items[i + j];
        this.button(it.id || prefix + (i + j), it.label, { x: L.x0 + j * (w + 8), w, inline: true, disabled: it.disabled, color: it.color });
      }
      this.y = saved + 56;
    }
  }
}

function sheetOverlay(p, title, lines, closeLabel) {
  p.y = p.L.navBottom + 4;
  p.ctx.fillStyle = 'rgba(255,255,255,0.97)';
  p.ctx.fillRect(0, p.y, p.L.W, p.L.H);
  p.hits.length = 0;
  p.text(title);
  (lines || []).forEach((l) => p.text(l));
  return () => p.button('sheet:close', closeLabel || '知道了');
}

const drawers = {
  home(p, vm) {
    const d = vm.daily;
    p.text('语义热冷', 28);
    p.text(d.title + '  [' + d.state + ']');
    p.text(d.sub);
    if (vm.streak.show) p.text(vm.streak.label);
    if (vm.groupLine) p.button('home:groupBanner', vm.groupLine);
    p.button(d.primary.id, d.primary.label, { disabled: d.primary.disabled });
    if (d.secondary) p.button(d.secondary.id, d.secondary.label);
    if (d.footnote) p.text(d.footnote);
    p.row('', [
      { id: 'home:groupBoard', label: '群榜' },
      { id: 'home:friendBoard', label: '好友榜' },
      { id: 'home:archive', label: '往期' },
      { id: 'home:howto', label: '玩法' },
    ], 4);
    p.row('', [
      { id: 'home:sound', label: vm.muted ? '声音 关' : '声音 开' },
      { id: 'home:settings', label: '设置' },
    ], 2);
    if (vm.sheet === 'howto') {
      const close = sheetOverlay(p, '玩法', vm.howto.lines.concat([vm.howto.note]));
      close();
    } else if (vm.sheet === 'settings') {
      const close = sheetOverlay(p, '设置', []);
      p.button('settings:sound', vm.muted ? '声音：关' : '声音：开');
      p.button('settings:largeText', vm.settings.largeText ? '大字模式：开' : '大字模式：关');
      p.button('settings:highContrast', vm.settings.highContrast ? '高对比度：开' : '高对比度：关');
      if (!vm.settings.friendBoardEnabled) p.button('settings:openSetting', '好友排行：未开启 [去设置]');
      p.button('settings:privacy', '用户隐私保护指引');
      p.button('settings:feedback', '联系我们/反馈');
      close();
    }
  },

  play(p, vm) {
    const L = p.L;
    p.button('back', '‹ 返回', { w: 88, inline: true });
    p.button('menu:open', '⋯', { w: 56, x: L.W - 150, inline: true });
    p.y += 52;
    p.text(vm.title + '  ' + vm.stepsLabel + '  [' + vm.state + ']');
    if (vm.firstCharLabel) p.text(vm.firstCharLabel);
    if (vm.banner) p.text(vm.banner);
    if (vm.state === 'starting') p.text('正在展开题目…');
    if (vm.state === 'offline' || vm.state === 'error') {
      p.text('网络开小差了');
      p.button('play:retry', '重试');
    }
    if (vm.keyboard.open) {
      p.text('键盘：' + vm.keyboard.text);
      p.row('sugg:', vm.keyboard.suggestions.map((w, i) => ({ id: 'sugg:' + i, label: w })), 3);
      if (vm.latest) p.text('刚猜 ' + vm.latest.word + ' ' + vm.latest.rankLabel + ' ' + vm.latest.bandLabel);
      p.button('key:close', '收起');
      return;
    }
    if (vm.steps === 0 && vm.state !== 'starting') {
      p.text('先点一个词试试：');
      p.row('warmup:', vm.warmups.map((w, i) => ({ id: 'warmup:' + i, label: w })), 3);
    } else if (vm.latest) {
      p.text('刚猜 ' + vm.latest.word + ' ' + (vm.latest.pending ? '…' : vm.latest.rankLabel + ' ' + vm.latest.bandLabel));
      if (vm.chips.length) {
        p.text(vm.chipsTitle);
        p.row('chip:', vm.chips.map((w, i) => ({ id: 'chip:' + i, label: w })), 3);
      }
    }
    // ladder (first rows only; the real renderer scrolls)
    const top = p.y;
    const shown = vm.ladder.slice(0, 6);
    shown.forEach((r, i) => {
      p.button('row:' + i, (r.isHint ? '提示·' : '') + r.word + ' ' + r.rankLabel + ' ' + r.bandLabel + (r.isSyn ? ' 意思一样！' : ''), { h: 36, color: r.isLatest ? '#7A5230' : '#8a8a8a' });
    });
    p.hits.push({ id: 'play:ladder', x: L.x0, y: top, w: L.contentW, h: Math.max(40, p.y - top) });
    p.hits.scrollMax['play:ladder'] = Math.max(0, (vm.ladder.length - 6) * 44);
    p.y = Math.max(p.y, L.thumbTop);
    p.button('hint:use', vm.hint.label, { disabled: vm.hint.state === 'locked' || vm.hint.state === 'exhausted', inline: true, w: (L.contentW - 8) / 2 });
    p.button('key:open', '输入', { x: L.x0 + (L.contentW - 8) / 2 + 8, w: (L.contentW - 8) / 2 });
    if (vm.adHint.visible) p.button('hint:ad', '▶ 视频提示 ' + vm.adHint.left, { disabled: vm.adHint.left <= 0 });
    if (vm.coach) {
      p.button('coach:next', '知道了 (' + vm.coach + '/3)');
      p.button('coach:skip', '跳过');
    }
    if (vm.sheet === 'menu') {
      const close = sheetOverlay(p, '菜单', []);
      vm.menu.items.forEach((it) => p.button(it.id, it.label));
      close();
    } else if (vm.sheet === 'howto') {
      const close = sheetOverlay(p, '玩法', vm.howto.lines.concat([vm.howto.note]));
      close();
    }
  },

  reveal(p, vm) {
    p.button('reveal:back', '‹ 首页', { w: 88 });
    p.text(vm.title);
    p.text((vm.answerLabel ? vm.answerLabel + '：' : '') + vm.answer, 40);
    p.text(vm.summary);
    p.text('温度 ' + vm.temps.length + ' 列');
    if (vm.stats.show) {
      p.text(vm.stats.line1);
      if (vm.stats.line2) p.text(vm.stats.line2);
    }
    if (vm.streak.show) p.text(vm.streak.label);
    if (vm.compare) {
      p.text(vm.compare.line);
      if (vm.compare.theirWords) p.button('reveal:theirWords', '看 TA 的猜词');
    }
    p.button('reveal:share', '分享成绩');
    p.button('reveal:board', '群榜/好友榜');
    if (vm.top.state === 'loading') p.text('正在取最接近的 100 个词…');
    else if (vm.top.state === 'error') {
      p.text(vm.top.errorText);
      p.button('reveal:retryList', '重试');
    } else vm.top.items.slice(0, 5).forEach((it) => p.text(it.rank + ' ' + it.word + (it.synonym ? ' (同义)' : '') + (it.mine ? ' *' : '')));
    p.hits.push({ id: 'reveal:scroll', x: 0, y: p.y, w: p.L.W, h: 40 });
    p.hits.scrollMax['reveal:scroll'] = 600;
    p.y = Math.max(p.y, p.L.thumbTop);
    p.button('reveal:next', vm.nextLabel, { disabled: !vm.nextEnabled });
    if (vm.sheet === 'theirWords') {
      const close = sheetOverlay(p, 'TA 的猜词', vm.compare && vm.compare.theirWords ? vm.compare.theirWords.slice(0, 10) : []);
      close();
    }
  },

  challenge(p, vm) {
    p.text(vm.headline + '  [' + vm.state + ']');
    if (vm.sub) p.text(vm.sub);
    if (vm.note) p.text(vm.note);
    if (vm.ownLine) p.text(vm.ownLine);
    if (vm.state === 'ready' || vm.state === 'own') {
      p.button('challenge:accept', vm.primaryLabel);
      p.button('challenge:home', vm.secondaryLabel);
    } else if (vm.state === 'offline') {
      p.button('challenge:retry', vm.primaryLabel);
      p.button('challenge:home', '先去首页看看');
    } else if (vm.state === 'notFound') p.button('challenge:home', vm.primaryLabel);
  },

  board(p, vm) {
    p.button('board:back', '‹ 返回', { w: 88 });
    p.text(vm.title + '  [' + vm.state + ']');
    p.text(vm.footer);
    if (vm.state === 'ready') p.hits.push({ id: 'board:list', x: p.L.board.x, y: p.L.board.y, w: p.L.board.w, h: p.L.board.h });
    if (vm.state === 'error') p.button('board:retry', '重试');
    if (vm.state === 'empty') p.button('board:goPlay', '去猜');
    if (vm.state === 'noGroup') p.text(vm.explainer);
    if (vm.state === 'privacyDenied') {
      p.text(vm.myLine);
      p.button('board:contract', '查看指引');
      p.button('board:agree', '同意并查看');
    }
    if (vm.state === 'scopeDenied') {
      p.text(vm.myLine);
      p.button('board:openSetting', '去设置开启');
    }
    if (vm.canShareToGroup) p.button('board:share', '分享到本群');
  },

  archive(p, vm) {
    p.button('archive:back', '‹ 返回', { w: 88 });
    p.text('往期  ' + vm.bestStreakLabel + '  [' + vm.state + ']');
    if (vm.state === 'error') {
      p.text(vm.errorText);
      p.button('archive:retry', '重试');
      return;
    }
    if (vm.state === 'empty') p.text(vm.emptyText);
    vm.items.slice(0, 8).forEach((it, i) => p.button('archive:item:' + i, it.title + '  ' + it.line, { h: 40 }));
    p.hits.push({ id: 'archive:scroll', x: 0, y: p.L.navBottom + 60, w: p.L.W, h: 40 });
    p.hits.scrollMax['archive:scroll'] = Math.max(0, (vm.items.length - 8) * 48);
    if (vm.hasMore) p.button('archive:more', '加载更多');
    p.button('archive:practice', vm.practice.line + '  ' + vm.practice.cta);
  },
};

function draw(screen, ctx, vm, layout) {
  const L = fill(layout);
  ctx.fillStyle = vm.display && vm.display.highContrast ? '#FFFFFF' : '#F5EFE0';
  ctx.fillRect(0, 0, L.W, L.H);
  const p = new Pen(ctx, L);
  drawers[screen](p, vm);
  return p.hits;
}

function drawOverlay(ctx, ov, layout) {
  const hits = [];
  if (!ov) return hits;
  const L = fill(layout);
  const box = (id, label, y) => {
    ctx.fillStyle = '#7A5230';
    ctx.fillRect(L.x0, y, L.contentW, 48);
    ctx.fillStyle = '#fff';
    ctx.font = '16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, L.cx, y + 30);
    hits.push({ id, x: L.x0, y, w: L.contentW, h: 48 });
  };
  if (ov.dialog) {
    hits.push({ id: 'dialog:block', x: 0, y: 0, w: L.W, h: L.H });
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, 0, L.W, L.H);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.fillText(ov.dialog.text, L.cx, L.H / 2 - 20);
    box('dialog:confirm', ov.dialog.confirmLabel, L.H / 2);
    if (ov.dialog.cancelLabel) box('dialog:cancel', ov.dialog.cancelLabel, L.H / 2 + 56);
  }
  if (ov.adStub) {
    hits.push({ id: 'adstub:block', x: 0, y: 0, w: L.W, h: L.H });
    ctx.fillStyle = 'rgba(0,0,0,0.8)';
    ctx.fillRect(0, 0, L.W, L.H);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.fillText('广告位（测试）' + ov.adStub.secondsLeft, L.cx, L.H / 2 - 20);
    if (ov.adStub.secondsLeft === 0) box('adstub:complete', '完成', L.H / 2);
    box('adstub:skip', '跳过', L.H / 2 + 56);
  }
  if (ov.toast) {
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(L.x0, L.H * 0.7, L.contentW, 40);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.fillText(ov.toast.text, L.cx, L.H * 0.7 + 26);
  }
  return hits;
}

module.exports = { draw, drawOverlay, stubLayout };
