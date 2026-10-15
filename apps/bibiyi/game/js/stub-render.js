/**
 * Stub renderer: boxes and labels only, so the game is runnable and testable
 * before the real js/render/* (frontend-ui) lands. Same contract as the real
 * renderers (js/HOOKS.md):
 *   draw(screen, ctx, vm, layout) -> hitAreas[{id,x,y,w,h}]
 *   drawOverlay(ctx, overlayVm, layout) -> hitAreas
 * It emits the hit ids listed in js/HOOKS.md and is not meant to look good.
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
    const h = o.h || 48;
    const w = o.w || L.contentW;
    const x = o.x === undefined ? L.x0 : o.x;
    const c = this.ctx;
    c.fillStyle = o.disabled ? '#ccc' : '#2F6F8F';
    c.fillRect(x, this.y, w, h);
    c.fillStyle = '#fff';
    c.font = '16px sans-serif';
    c.textAlign = 'center';
    c.fillText(label, x + w / 2, this.y + h / 2 + 6);
    if (!o.disabled) this.hits.push({ id, x, y: this.y, w, h });
    if (!o.inline) this.y += h + 8;
  }
  area(id, x, y, w, h) {
    this.hits.push({ id, x, y, w, h });
  }
}

const DAILY_LABEL = { available: '开始', inProgress: '继续', done: '查看结果', loading: '正在取今日题目…', offline: '今日一比需联网', error: '今日一比需联网' };

function face(p, f, refTop) {
  p.text(f.label + ' · ' + f.subLabel + ' · ' + (f.valueText === null ? '？' : f.valueText) + ' ' + f.unitText);
  if (f.sourceText) {
    p.text(f.sourceText);
    const y = p.y - 24;
    p.area('source:' + refTop, p.L.x0, y, p.L.contentW * 0.6, 24);
    if (f.canReport) p.area('report:' + refTop, p.L.x0 + p.L.contentW * 0.6, y, p.L.contentW * 0.4, 24);
  }
}

function sheet(p, vm) {
  const L = p.L;
  const kind = vm.sheet;
  if (!kind) return;
  const sv = vm.sheetVm;
  p.ctx.fillStyle = 'rgba(255,255,255,0.97)';
  p.ctx.fillRect(0, L.navBottom, L.W, L.H);
  p.hits.length = 0;
  p.y = L.navBottom + 4;
  if (kind === 'howto') sv.lines.forEach((l) => p.text(l));
  else if (kind === 'settings') {
    p.text('设置');
    p.button('settings:sound', sv.muted ? '声音：关' : '声音：开');
    p.button('settings:largeText', sv.largeText ? '大字模式：开' : '大字模式：关');
    p.button('settings:highContrast', sv.highContrast ? '高对比度：开' : '高对比度：关');
    p.button('settings:sources', '数据来源');
    if (!sv.friendBoardEnabled) p.button('settings:openSetting', '好友排行：未开启 [去设置]');
    p.button('settings:privacy', '用户隐私保护指引');
    p.button('settings:feedback', '联系我们/反馈');
  } else if (kind === 'sources') {
    p.text('数据来源');
    sv.sources.forEach((s) => p.text(s.attribution, 14));
    p.text(sv.footText, 14);
  } else if (kind === 'category') {
    sv.options.forEach((o) => p.button('category:' + o.key, (o.key === sv.selected ? '✓ ' : '') + o.label + ' (' + o.factCount + ')', { h: 40 }));
  } else if (kind === 'continue') {
    p.text(sv.missText);
    p.text('再答一次？看完一段视频，接着往下答');
    p.button('continue:video', sv.adState === 'loading' ? '视频加载中…' : '▶ 视频 · 再答一次', { disabled: sv.adState === 'loading' });
    p.y += 24;
    p.button('continue:result', '看结果');
  } else if (kind === 'report') {
    p.text(sv.title);
    p.text(sv.summaryText);
    sv.reasons.forEach((r) => p.button('report:reason:' + r.key, (r.selected ? '✓ ' : '') + r.label, { h: 40 }));
    p.button('report:submit', sv.submitLabel, { disabled: !sv.canSubmit });
    p.button('report:cancel', '取消');
  } else if (kind === 'source') {
    p.text(sv.label + ' · ' + sv.subLabel + ' · ' + sv.valueText + ' ' + sv.unitText);
    p.text(sv.publisher + ' · ' + sv.sourceTitle + ' · ' + sv.year);
    p.text(sv.url, 12);
    p.text('取得于 ' + sv.retrievedAt, 12);
    p.button('source:report', '数据有误？');
  } else if (kind === 'albumDenied') {
    p.text(sv.text);
    p.button('save:openSetting', sv.openLabel);
  } else if (kind === 'questions') {
    p.text('本局题目');
    p.hits.push({ id: 'sheet:list', x: 0, y: L.navBottom, w: L.W, h: L.H });
    vm.questions.forEach((q) => {
      p.text(q.k + ' ' + q.top.label + ' ' + q.top.valueText + ' → ' + q.bottom.label + ' ' + q.bottom.valueText + ' ' + (q.correct ? '✓' : '✗'), 14);
      p.area('report:q:' + q.k + ':bottom', L.x0, p.y - 24, L.contentW, 24);
    });
  }
  p.button('sheet:close', '关闭');
}

const drawers = {
  home(p, vm) {
    p.text('比一比', 28);
    const d = vm.daily;
    p.text('今日一比 · 第 ' + d.issueNo + ' 期 · ' + d.themeLabel + '  [' + d.state + ']');
    if (d.dayStreak.text) p.text(d.dayStreak.text);
    if (d.progressText) p.text(d.progressText);
    if (d.resultText) p.text(d.resultText);
    if (vm.hasGroupContext) p.button('home:groupBanner', '来自群聊 · 查看本群今日排行');
    p.button('home:daily', DAILY_LABEL[d.state] || '开始', { disabled: d.state === 'loading' || d.state === 'offline' || d.state === 'error' });
    if (d.state === 'offline' || d.state === 'error') p.button('home:retry', '重试');
    if (vm.free.resumeText) p.button('home:freeResume', vm.free.resumeText);
    const hw = p.L.contentW * 0.62;
    const y = p.y;
    p.button('home:free', '随便比比 · 不限次', { w: hw, inline: true });
    p.y = y;
    p.button('home:category', vm.free.categoryLabel + ' ▾', { x: p.L.x0 + hw + 8, w: p.L.contentW - hw - 8 });
    if (vm.free.bestText) p.text(vm.free.bestText, 14);
    p.button('home:groupBoard', '群榜');
    p.button('home:friendBoard', '好友榜');
    p.button('home:history', '往期');
    p.button('home:howto', '玩法');
    p.button('home:sound', vm.muted ? '声音：关' : '声音：开');
    p.button('home:settings', '设置');
    sheet(p, vm);
  },
  play(p, vm) {
    p.button('back', '‹ 返回', { w: 88 });
    p.area('play:continue', 0, p.y, p.L.W, p.L.thumbTop - p.y);
    p.text(vm.headerText + '    连对 ' + vm.streak + '  [' + vm.phase + ']');
    if (vm.challenge && vm.challenge.passedText) p.text(vm.challenge.passedText, 14);
    if (vm.netError) {
      p.text(vm.netError.text);
      p.button('play:retry', vm.netError.retryLabel);
    }
    if (vm.loadingText) p.text(vm.loadingText);
    if (vm.top) {
      face(p, vm.top, 'top');
      face(p, vm.bottom, 'bottom');
      p.text(vm.promptText);
      if (vm.verdictText) p.text(vm.verdictText, 24);
      if (vm.segmentBanner) p.text(vm.segmentBanner);
    }
    if (vm.coachMark) p.button('coach:skip', '下面这张比上面多还是少？点一下');
    p.y = Math.max(p.y, p.L.thumbTop);
    const hw = (p.L.contentW - 16) / 2;
    const y = p.y;
    p.button('answer:hi', vm.buttons.hi.label + ' ▲', { w: hw, h: 56, inline: true, disabled: !vm.buttons.hi.enabled });
    p.y = y;
    p.button('answer:lo', vm.buttons.lo.label + ' ▼', { x: p.L.x0 + hw + 16, w: hw, h: 56, disabled: !vm.buttons.lo.enabled });
    sheet(p, vm);
  },
  result(p, vm) {
    p.button('result:back', '‹ 首页', { w: 88 });
    p.text(vm.headerText + '  [' + vm.status + ']');
    if (vm.status === 'finalizing' || vm.status === 'pendingNetwork') {
      p.text(vm.status === 'finalizing' ? '正在记分…' : '网络不太好');
      return p.button('result:retry', '重试');
    }
    p.text('连对 ' + vm.streakText, 32);
    if (vm.clearedText) p.text(vm.clearedText);
    if (vm.rarityText || vm.dayStreakText) p.text([vm.rarityText, vm.dayStreakText].filter(Boolean).join(' · '));
    p.text(vm.commentText);
    if (vm.friendlyText) p.text(vm.friendlyText);
    if (vm.finalizedNote) p.text(vm.finalizedNote);
    if (vm.privacyNote) p.text(vm.privacyNote, 14);
    if (vm.challenge) p.text(vm.challenge.compareText);
    if (vm.miss) {
      p.text(vm.miss.titleText);
      face(p, vm.miss.bottom, 'miss:bottom');
      face(p, vm.miss.top, 'miss:top');
      p.text(vm.miss.chosenLabel);
    }
    p.button('result:share', '分享');
    p.button('result:challenge', '发起挑战');
    p.button('result:save', '保存图片');
    if (vm.subscribe.state === 'offer') p.button('result:subscribe', '好友接受挑战时提醒我');
    p.button('result:questions', '本局题目');
    p.button('result:board', vm.boardLabel);
    p.button('result:again', vm.againLabel);
    sheet(p, vm);
  },
  challenge(p, vm) {
    p.text(vm.titleText);
    p.text(vm.ownerText + '  [' + vm.status + ']');
    if (vm.issueText) p.text(vm.issueText);
    if (vm.rulesText) p.text(vm.rulesText);
    if (vm.status === 'ready') {
      p.button('challenge:accept', '接受挑战');
      p.button('challenge:home', '先去首页看看');
    } else if (vm.status === 'expired' || vm.status === 'retired') {
      p.text(vm.status === 'expired' ? '这个挑战已经过期了' : '这个挑战的题库已更新，无法再玩');
      p.button('challenge:daily', '今日一比');
      p.button('challenge:free', '随便比比');
    } else if (vm.status === 'offline' || vm.status === 'error') {
      p.text('挑战需联网展开');
      p.button('challenge:retry', '重试');
      p.button('challenge:free', '随便比比');
    } else if (vm.status === 'answered') {
      p.button('challenge:compare', '查看对比');
      p.button('challenge:home', '返回首页');
    } else {
      if (vm.ownText) p.text(vm.ownText);
      if (vm.answerCount !== undefined) p.text('已有 ' + vm.answerCount + ' 人应战' + (vm.bestAnswer !== undefined ? ' · 最好 ' + vm.bestAnswer : ''));
      if (vm.subscribe && vm.subscribe.state === 'offer') p.button('challenge:subscribe', '好友接受挑战时提醒我');
      p.button('challenge:home', '返回首页');
    }
  },
  board(p, vm) {
    p.button('board:back', '‹ 返回', { w: 88 });
    p.text(vm.titleText + '  [' + vm.state + ']');
    if (vm.state === 'ready') p.hits.push({ id: 'board:list', x: p.L.board.x, y: p.L.board.y, w: p.L.board.w, h: p.L.board.h });
    if (vm.state === 'serverError') p.button('board:retry', '重试');
    if (vm.state === 'empty') p.button('board:goPlay', '去答题');
    if (vm.state === 'privacyDenied') {
      p.button('board:contract', '查看指引');
      p.button('board:agree', '同意并查看');
    }
    if (vm.state === 'unauthorized') p.button('board:openSetting', '去设置开启');
    if (vm.actions.canShareToGroup) p.button('board:share', '分享到本群');
  },
  history(p, vm) {
    p.button('history:back', '‹ 返回', { w: 88 });
    p.text('往期  [' + vm.state + ']');
    if (vm.headerText) p.text(vm.headerText);
    if (vm.errorText) {
      p.text(vm.errorText);
      p.button('history:retry', '重试');
    }
    vm.items.forEach((it) => p.button('history:item:' + it.dateKey, '第' + it.issueNo + '期 ' + it.dateText + ' · ' + it.themeLabel + ' · ' + (it.statusText || it.mineText), { h: 40 }));
  },
  issue(p, vm) {
    p.button('issue:back', '‹ 往期', { w: 88 });
    p.text((vm.titleText || '') + '  [' + vm.state + ']');
    if (vm.state === 'offline' || vm.state === 'error') return p.button('issue:retry', '重试');
    if (vm.mineText) p.text(vm.mineText);
    if (vm.stats) p.text(vm.stats.totalText);
    if (vm.deckLockedText) p.text(vm.deckLockedText);
    (vm.deck || []).forEach((row) => {
      p.text(row.k + ' ' + row.top.label + ' ' + row.top.valueText + ' → ' + row.bottom.label + ' ' + row.bottom.valueText + ' ' + row.answerLabel, 14);
      p.area('report:issue:' + row.k + ':bottom', p.L.x0, p.y - 24, p.L.contentW, 24);
    });
    vm.errata.forEach((e) => p.text('勘误：第 ' + e.k + ' 题 ' + e.text, 14));
    sheet(p, vm);
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
