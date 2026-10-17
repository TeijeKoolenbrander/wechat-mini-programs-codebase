/**
 * Stub renderer: boxes and labels only, so the game is playable and testable before the real js/render/* (frontend-ui)
 * lands. Same contract as the real renderers (js/render/CONTRACT.md):
 *   draw(screen, ctx, vm, layout) -> hitAreas [{id,x,y,w,h}] (+ .ruler, .scrollMax)
 *   drawOverlay(ctx, overlayVm, layout) -> hitAreas
 * It emits exactly the hit ids listed in CONTRACT.md (a test cross-checks this) and never computes a number, label or
 * sentence from data: it only prints what the vm carries.
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
    board: { x: pad, y: navBottom + 120, w: W - 2 * pad, h: Math.max(160, H - navBottom - 120 - safeBottom - 90) },
  };
}

class Pen {
  constructor(ctx, L, screen) {
    this.ctx = ctx;
    this.L = L;
    this.screen = screen;
    this.y = L.navBottom + 4;
    this.hits = [];
    this.hits.scrollMax = {};
  }
  text(s, size) {
    if (s === null || s === undefined || s === '') return;
    const c = this.ctx;
    c.fillStyle = '#222';
    c.font = (size || 16) + 'px sans-serif';
    c.textAlign = 'left';
    c.fillText(String(s), this.L.x0, this.y + (size || 16));
    this.y += (size || 16) + 8;
  }
  button(id, label, o) {
    const L = this.L;
    const opt = o || {};
    const h = 48;
    const w = opt.w || L.contentW;
    const x = opt.x === undefined ? L.x0 : opt.x;
    const c = this.ctx;
    c.fillStyle = opt.disabled ? '#ccc' : '#2c6e63';
    c.fillRect(x, this.y, w, h);
    c.fillStyle = '#fff';
    c.font = '16px sans-serif';
    c.textAlign = 'center';
    c.fillText(label, x + w / 2, this.y + 30);
    if (!opt.disabled) this.hits.push({ id, x, y: this.y, w, h });
    if (!opt.inline) this.y += h + 8;
  }
  back(id, label) {
    this.button(id, label || '‹ 返回', { w: 88 });
  }
  /** A ruler: end labels, tick line, markers, needle. Sets hits.ruler and the full-width touch band `<screen>:ruler`. */
  ruler(o) {
    const L = this.L;
    const c = this.ctx;
    const h = 72;
    const x0 = L.x0;
    const x1 = L.W - L.x0;
    const y = this.y;
    c.fillStyle = '#eee';
    c.fillRect(x0, y, x1 - x0, h);
    c.fillStyle = '#222';
    c.font = '16px sans-serif';
    c.textAlign = 'left';
    c.fillText(o.left || '', x0 + 4, y + 20);
    c.textAlign = 'right';
    c.fillText(o.right || '', x1 - 4, y + 20);
    const at = (pos) => x0 + ((x1 - x0) * pos) / 100;
    if (o.band) {
      c.fillStyle = '#f90';
      c.fillRect(at(o.band.from), y + 30, at(o.band.to) - at(o.band.from), 20);
    }
    (o.markers || []).forEach((m) => {
      c.fillStyle = '#555';
      c.fillText(m.kind === 'nation' ? '◆' : m.kind === 'group' ? '●' : m.kind === 'target' ? '▮' : m.kind === 'you' ? '▼' : '○', at(m.pos), y + 50);
    });
    if (o.needle !== null && o.needle !== undefined) {
      c.fillStyle = '#c00';
      c.fillText('▼', at(o.needle), y + 50);
    } else if (o.hint) {
      c.textAlign = 'center';
      c.fillText(o.hint, L.cx, y + 50);
    }
    if (o.interactive) {
      this.hits.push({ id: this.screen + ':ruler', x: 0, y, w: L.W, h });
      this.hits.ruler = { x0: x0 + 0, x1, y, h };
    }
    this.y += h + 8;
  }
}

const HOME_LABEL = { available: '开始', inProgress: '继续', done: '看结果', loading: '正在取今日卡片…', pendingSubmit: '答案待发送', offline: '今日卡片需联网获取', error: '今日卡片需联网获取', unavailable: '今日卡片需联网获取' };

function sheetHome(p, vm) {
  p.y = p.L.navBottom + 4;
  p.ctx.fillStyle = 'rgba(255,255,255,0.97)';
  p.ctx.fillRect(0, p.y, p.L.W, p.L.H);
  p.hits.length = 0;
  p.hits.push({ id: 'sheet:list', x: 0, y: p.y, w: p.L.W, h: p.L.H });
  if (vm.sheet === 'howto') {
    p.text('拖动指针，放到你觉得对的位置');
    p.text('和全国、和群友比比谁更同频');
    p.text('每天 5 张卡');
  } else if (vm.sheet === 'rules') {
    p.text('发言规则');
    require('./render/clueSheets').RULES_BULLETS.forEach((b) => p.text('· ' + b, 14));
    p.button('rules:terms', '《用户协议》');
    p.button('rules:privacy', '《用户隐私保护指引》');
    p.button('rules:ok', '知道了');
    return;
  } else {
    p.text('设置');
    p.button('settings:sound', vm.settings.muted ? '声音：关' : '声音：开');
    p.button('settings:largeText', vm.settings.largeText ? '大字模式：开' : '大字模式：关');
    p.button('settings:highContrast', vm.settings.highContrast ? '高对比度：开' : '高对比度：关');
    p.text(vm.settings.friendScope === 'granted' ? '好友排行：已开启' : '好友排行：未开启');
    if (vm.settings.friendScope !== 'granted') p.button('settings:openSetting', '去设置');
    p.button('settings:rules', '发言规则');
    p.button('settings:terms', '《用户协议》');
    p.button('settings:privacy', '用户隐私保护指引');
    p.button('settings:feedback', '联系我们/反馈');
  }
  p.button('sheet:close', '知道了');
}

const drawers = {
  home(p, vm) {
    p.text('群友刻度盘', 28);
    const d = vm.daily;
    p.text('每日刻度 · 第 ' + d.issueNo + ' 期 · 5 张卡  [' + d.state + ']' + (d.state === 'inProgress' ? ' 已答 ' + d.answered + '/5' : ''));
    p.text(d.yesterdayText);
    p.text(d.streakText);
    p.text(d.scoreText);
    if (vm.group.status === 'ok') p.button('home:groupBanner', vm.group.bannerText || '来自群聊 · 查看本群今日默契');
    p.button('home:daily', HOME_LABEL[d.state], { disabled: d.state === 'loading' || d.state === 'pendingSubmit' || d.state === 'offline' || d.state === 'error' || d.state === 'unavailable' });
    if (d.state === 'pendingSubmit' || d.state === 'offline' || d.state === 'error' || d.state === 'unavailable') p.button('home:retry', '重试');
    p.button('home:host', '出一道题');
    p.button('home:archive', '往期刻度');
    p.button('home:group', '本群');
    p.button('home:friends', '好友榜');
    p.button('home:howto', '玩法');
    p.button('home:sound', vm.muted ? '声音：关' : '声音：开');
    p.button('home:settings', '设置');
    p.hits.unshift({ id: 'home:scroll', x: 0, y: p.L.navBottom, w: p.L.W, h: p.L.H });
    p.hits.scrollMax['home:scroll'] = 0;
    if (vm.sheet) sheetHome(p, vm);
  },
  card(p, vm) {
    p.back('card:back');
    p.text((vm.mode === 'daily' ? '每日刻度 · 第 ' + vm.issueNo + ' 期' : vm.mode === 'archive' ? '往期刻度' : '') + (vm.tag ? ' ' + vm.tag : '') + (vm.index ? '  ' + vm.index + ' / ' + vm.total : ''));
    p.text(vm.card.catLabel, 14);
    p.text(vm.card.prompt, 28);
    p.ruler({ left: vm.card.left, right: vm.card.right, needle: vm.needle, markers: vm.reveal ? vm.reveal.markers : [], interactive: vm.phase === 'empty' || vm.phase === 'placing', hint: vm.hint });
    const live = vm.phase === 'empty' || vm.phase === 'placing';
    if (live) {
      p.button('card:nudgeL', '‹', { w: 64, inline: true, disabled: vm.needle === null });
      p.button('card:nudgeR', '›', { w: 64, x: p.L.W - 80, disabled: vm.needle === null });
    }
    if (vm.coach) p.button('coach:dismiss', '点一下或拖动，放上指针');
    if (vm.reveal) {
      p.text(vm.reveal.label + '  ' + vm.reveal.scoreText, 24);
      p.text(vm.reveal.nationText);
      p.text(vm.reveal.agreeText);
      p.text(vm.reveal.groupText);
    }
    p.text(vm.submitNote);
    if (vm.phase === 'revealed') p.button('card:report', '这张卡有问题?');
    p.y = Math.max(p.y, p.L.thumbTop);
    p.button('card:primary', vm.phase === 'submitting' ? '提交中…' : vm.primaryLabel, { disabled: vm.phase === 'submitting' || ((vm.phase === 'empty' || vm.phase === 'placing') && !vm.canConfirm) });
    if (vm.reportSheet) {
      p.y = p.L.navBottom + 4;
      p.hits.length = 0;
      p.button('report:unsuitable', '不合适');
      p.button('report:ambiguous', '有歧义');
      p.button('report:typo', '有错字');
      p.button('report:cancel', '取消');
    }
  },
  result(p, vm) {
    p.back('result:back', '‹ 首页');
    p.text('今日默契分 (' + vm.statusTag + ')');
    p.text(vm.totalText, 40);
    p.text(vm.bandLabel);
    vm.rows.forEach((r) => p.text(r.prompt + '  ' + r.left + ' ↔ ' + r.right + '  ' + r.label + ' ' + r.scoreText, 14));
    p.text(vm.divisiveText, 14);
    p.text(vm.percentileText, 14);
    p.text(vm.groupText, 14);
    p.text(vm.streakText ? vm.streakText + (vm.final ? '' : ' · 0:30 定分') : null, 14);
    if (vm.stale) p.text('暂未更新', 14);
    p.button('result:share', '分享', { w: 100, inline: true });
    p.button('result:group', '本群', { w: 100, x: 124, inline: true });
    p.button('result:friends', '好友榜', { w: 100, x: 232 });
    p.button('result:bonus', vm.bonus.left === 0 ? '今天的加一题用完了' : vm.bonus.adState === 'loading' ? '加载中…' : '▶ 视频 加一题', { disabled: vm.bonus.left === 0 || vm.bonus.adState === 'loading' || vm.bonus.adState === 'playing' });
    if (vm.bonus.adState === 'error') p.text('暂无广告，请稍后再试', 14);
    p.button('result:distribution', vm.distribution.unlocked ? '查看全国分布' : '▶ 视频 全国分布', { disabled: vm.distribution.adState === 'loading' });
    p.button('result:host', '出一道题');
    p.button('result:archive', '往期刻度');
    p.hits.unshift({ id: 'result:scroll', x: 0, y: p.L.navBottom, w: p.L.W, h: p.L.H });
    p.hits.scrollMax['result:scroll'] = 0;
    if (vm.sheet === 'distribution') {
      p.y = p.L.navBottom + 4;
      p.hits.length = 0;
      p.hits.push({ id: 'sheet:list', x: 0, y: p.y, w: p.L.W, h: p.L.H });
      p.text('全国分布');
      (vm.distribution.hist || []).forEach((h, i) => p.text(vm.rows[i].prompt + ' ' + h.join(','), 12));
      p.button('sheet:close', '知道了');
    }
  },
  create(p, vm) {
    p.back('create:back');
    p.text('出一道题', 24);
    if (vm.step === 'pickSpectrum') {
      vm.spectra.forEach((s) => p.button('create:spectrum:' + s.id, s.left + ' ↔ ' + s.right));
      if (vm.freeSwapLeft > 0) p.button('create:swapFree', '换一组 (免费)');
      else if (vm.adSwapLeft > 0) p.button('create:swapAd', '▶ 视频 换一批', { disabled: vm.adState === 'loading' });
      else p.button('create:noSwap', '就从这几条里选吧', { disabled: true });
    } else if (vm.step === 'creating') p.text('正在生成位置…');
    else if (vm.step === 'pickClue' || vm.step === 'sharing') {
      p.text('只有你能看到这个位置');
      p.ruler({ left: '', right: '', needle: null, band: vm.targetBand, markers: [], interactive: false });
      const tt = vm.textTab;
      const kb = vm.tab === 'text' && vm.keyboardH !== 0;
      if (vm.tabs.length > 1 && !kb) {
        p.text('怎么给提示？');
        p.button('create:tab:text', (vm.tab === 'text' ? '(●) ' : '( ) ') + '自己写', { w: 160, inline: true, disabled: tt.sending });
        p.button('create:tab:preset', (vm.tab === 'preset' ? '(●) ' : '( ) ') + '选一个提示词', { w: 160, x: 196, disabled: tt.sending });
      }
      if (kb) p.hits.unshift({ id: 'create:block', x: 0, y: 0, w: p.L.W, h: p.L.H });
      if (vm.tab === 'preset') {
        vm.clueOptions.forEach((o) => p.button('create:clue:' + o.itemId, (vm.clueItemId === o.itemId ? '✓ ' : '') + o.text));
        if (vm.clueSwapLeft > 0) p.button('create:clueSwap', '换一批');
        else p.button('create:noClueSwap', '就从这几个里选吧', { disabled: true });
      } else if (tt.state === 'restricted') {
        p.text(tt.restrictionText, 14);
        p.button('create:toPreset', '去选一个提示词 ›');
      } else {
        p.button('create:input', tt.text ? tt.text + '  ' + tt.countText : '写个东西或场景，让大家猜位置  ' + tt.countText, { disabled: tt.sending });
        p.text(tt.ruleLine, 14);
        if (tt.hint) p.text('⚠ ' + tt.hint, 14);
        if (tt.busyBox) {
          p.text('提示暂时没法检查，还没有发出去', 14);
          p.button('create:busyRetry', '重试', { w: 120, inline: true });
          p.button('create:busyPreset', '改用提示词', { w: 160, x: 156 });
        }
        if (!kb) p.button('create:toPreset', '想不出来？试试选一个提示词 ›');
      }
      p.button('create:share', tt.sending ? '检查中…' : vm.shareConfirm ? '提示已通过 · 发到群里' : '发到群里', { disabled: !vm.canShare || tt.sending });
      p.hits.scrollMax['create:scroll'] = 0;
      if (vm.sheet === 'rules' || vm.sheet === 'rulesReadOnly') {
        p.y = p.L.navBottom + 4;
        p.hits.length = 0;
        p.hits.push({ id: 'sheet:list', x: 0, y: p.y, w: p.L.W, h: p.L.H });
        p.text('发言规则');
        require('./render/clueSheets').RULES_BULLETS.forEach((b) => p.text('· ' + b, 14));
        p.button('rules:terms', '《用户协议》');
        p.button('rules:privacy', '《用户隐私保护指引》');
        if (vm.sheet === 'rules') {
          p.button('rules:decline', '先用提示词');
          p.button('rules:agree', '同意并写提示');
        } else p.button('rules:ok', '知道了');
      } else if (vm.sheet === 'warn') {
        p.y = p.L.navBottom + 4;
        p.hits.length = 0;
        p.hits.push({ id: 'sheet:list', x: 0, y: p.y, w: p.L.W, h: p.L.H });
        p.text(require('./render/clueSheets').WARN_TEXT, 14);
        p.button('warn:rules', '查看发言规则');
        p.button('warn:ok', '知道了');
      }
    } else if (vm.step === 'error') {
      p.text('出题需联网');
      p.button('create:retry', '重试');
    } else if (vm.step === 'rateLimited') p.text('今天出的题够多啦，明天再来');
  },
  round(p, vm) {
    p.back('round:back');
    const s = vm.status;
    if (s === 'loading') return p.text('展开题目…');
    if (s === 'offline') {
      p.text('题目需联网展开');
      return p.button('round:retry', '重试');
    }
    if (s === 'notFound') {
      p.text('找不到这道题');
      return p.button('round:home', '去首页');
    }
    if (s === 'expired') {
      p.text('这道题已经结束了');
      return p.button('round:daily', '去每日刻度');
    }
    if (s === 'noGuesses') {
      p.text('没有人作答，这道题结束了');
      return p.button('round:hostAgain', '再出一道');
    }
    p.text(s === 'open' ? '群友出了一道刻度题' : vm.left + ' ↔ ' + vm.right, 20);
    p.text(vm.left + ' ↔ ' + vm.right);
    p.text(vm.clueText);
    p.text(vm.clueSubText, 14);
    if (vm.canReport) p.button('round:report', '举报', { w: 100 });
    if (vm.reportSheet) {
      p.y = p.L.navBottom + 4;
      p.hits.length = 0;
      p.hits.push({ id: 'sheet:list', x: 0, y: p.y, w: p.L.W, h: p.L.H });
      p.text('举报这个提示');
      vm.reportSheet.reasons.forEach((r) => p.button('clueReport:reason:' + r, (vm.reportSheet.selected === r ? '(●) ' : '( ) ') + require('./render/clueSheets').REPORT_LABELS[r]));
      p.button('clueReport:submit', vm.reportSheet.sending ? '提交中…' : '提交举报', { disabled: !vm.reportSheet.selected || vm.reportSheet.sending });
      p.button('clueReport:cancel', '取消');
      return;
    }
    if (s === 'open') {
      p.text(vm.guessCountText);
      p.ruler({ left: vm.left, right: vm.right, needle: vm.needle, markers: [], interactive: true, hint: vm.hint });
      p.button('round:nudgeL', '‹', { w: 64, inline: true, disabled: vm.needle === null });
      p.button('round:nudgeR', '›', { w: 64, x: p.L.W - 80, disabled: vm.needle === null });
      p.button('round:primary', vm.phase === 'submitting' ? '提交中…' : '就这儿', { disabled: !vm.canConfirm });
      p.button('round:home', '先去首页看看');
    } else if (s === 'submitted') {
      p.text(vm.guessCountText);
      p.text(vm.revealHint);
      if (vm.subscribe.state === 'offer' || vm.subscribe.state === 'requesting') p.button('round:subscribe', '提醒我', { disabled: vm.subscribe.state === 'requesting' });
      if (vm.subscribe.state === 'granted') p.text('已开启提醒');
      p.button('round:home', '回首页');
    } else if (s === 'hostWaiting') {
      p.ruler({ left: vm.left, right: vm.right, needle: null, band: vm.hostBand, markers: [], interactive: false });
      p.text('只有你能看到这个位置');
      p.text(vm.guessCountText);
      p.button('round:reveal', '揭晓', { disabled: !vm.canReveal });
      p.text(vm.revealHint, 14);
      if (vm.subscribe.state === 'offer' || vm.subscribe.state === 'requesting') p.button('round:subscribe', '提醒我', { disabled: vm.subscribe.state === 'requesting' });
      if (vm.subscribe.state === 'granted') p.text('已开启提醒');
      p.button('round:reshare', '再发到群里');
    } else if (s === 'revealedUnplayed') {
      p.text('已揭晓');
      p.button('round:late', '先猜再看');
      p.button('round:view', '直接看答案');
    } else if (s === 'revealed' && vm.reveal) {
      p.ruler({ left: vm.left, right: vm.right, needle: null, markers: vm.reveal.markers, interactive: false });
      p.text(vm.reveal.mqText, 24);
      p.hits.unshift({ id: 'round:list', x: p.L.board.x, y: p.L.board.y, w: p.L.board.w, h: p.L.board.h });
      p.hits.scrollMax['round:list'] = 0;
      p.button('round:shareReveal', '分享揭晓');
      p.button('round:hostAgain', '我也出一道');
    }
  },
  terms(p, vm) {
    p.back('terms:back');
    p.text(vm.title, 20);
    vm.paragraphs.slice(0, 6).forEach((q) => p.text(q.text, 14));
    p.hits.unshift({ id: 'terms:scroll', x: 0, y: p.L.navBottom, w: p.L.W, h: p.L.H });
    p.hits.scrollMax['terms:scroll'] = 0;
  },
  group(p, vm) {
    p.back('board:back');
    p.text((vm.kind === 'group' ? '本群 · 第 ' : '好友 · 今日刻度 第 ') + vm.issueNo + ' 期  [' + vm.state + ']', 20);
    if (vm.kind === 'group') {
      p.text(vm.mqText, 40);
      p.text(vm.countText);
      p.text(vm.divisiveText);
      if (vm.state === 'noGroup' || vm.state === 'groupFailed') {
        p.text('在群聊里点开本游戏的卡片，就能看到本群的默契度');
        p.button('board:share', '分享到群');
      }
      if (vm.state === 'notPlayed') {
        p.text('完成今日刻度后查看本群默契');
        p.button('board:goPlay', '去答题');
      }
      if (vm.state === 'small') p.text('完成人数满 3 人后计算本群默契度');
      if (vm.state === 'empty') {
        p.text('本群今天还没有人完成');
        p.button('board:goPlay', '去答题');
      }
      if (vm.trend.length) p.text('近 7 天默契度  ' + vm.trend.map((t) => (t.value === null ? '—' : t.value)).join(' '), 14);
      vm.rounds.forEach((r) => p.button('board:round:' + r.roundId, r.title + ' ' + (r.mqText || r.statusText), { w: p.L.contentW }));
      if (vm.state === 'ready') p.button('board:share', '分享到本群');
    } else {
      p.text(vm.selfText);
      if (vm.state === 'empty') {
        p.text('还没有好友完成今日刻度');
        p.button('board:goPlay', '去答题');
      }
    }
    if (vm.state === 'serverError') {
      p.text('本群数据暂时打不开');
      p.button('board:retry', '重试');
    }
    if (vm.state === 'privacyDenied') {
      p.text('查看群友昵称需要同意《用户隐私保护指引》');
      p.button('board:contract', '查看指引');
      p.button('board:agree', '同意并查看');
    }
    if (vm.state === 'unauthorized') {
      p.text('开启「微信朋友关系」可显示群友昵称');
      p.button('board:openSetting', '去设置开启');
    }
    if (vm.state === 'ready' || vm.state === 'small' || vm.state === 'privacyDenied' || vm.state === 'unauthorized') {
      p.hits.unshift({ id: 'board:list', x: p.L.board.x, y: p.L.board.y, w: p.L.board.w, h: p.L.board.h });
      p.hits.scrollMax['board:list'] = 0;
    }
  },
  archive(p, vm) {
    if (vm.kind === 'list') {
      p.back('archive:back');
      p.text('往期刻度  ' + (vm.bestStreakText || '') + (vm.offlineTag ? ' 离线' : '') + '  [' + vm.state + ']', 20);
      if (vm.state === 'empty') p.text('还没有往期，明天再来');
      if (vm.state === 'offline' || vm.state === 'error') {
        p.text('往期需联网查看');
        p.button('archive:retry', '重试');
      }
      vm.items.slice(0, 8).forEach((it) => p.button('archive:item:' + it.dateKey, '第' + it.issueNo + '期 ' + it.dateText + '  ' + it.statusText));
      if (vm.hasMore) p.button('archive:more', '加载更多');
      p.hits.unshift({ id: 'archive:list', x: 0, y: p.L.navBottom, w: p.L.W, h: p.L.H });
      p.hits.scrollMax['archive:list'] = 0;
    } else if (vm.kind === 'review') {
      p.back('review:back');
      if (vm.state === 'loading') return p.text('正在取往期…');
      if (vm.state === 'error') {
        p.text('往期需联网查看');
        return p.button('review:retry', '重试');
      }
      p.text('第 ' + vm.issueNo + ' 期 · 定分 ' + vm.mine.totalText);
      p.text(vm.mine.percentileText);
      vm.rows.forEach((r) => p.text(r.prompt + ' ' + r.label + ' ' + r.scoreText, 14));
      p.button('review:distribution', vm.distribution.unlocked ? '查看全国分布' : '▶ 视频 全国分布');
      p.hits.unshift({ id: 'review:scroll', x: 0, y: p.L.navBottom, w: p.L.W, h: p.L.H });
      p.hits.scrollMax['review:scroll'] = 0;
      if (vm.sheet === 'distribution') {
        p.y = p.L.navBottom + 4;
        p.hits.length = 0;
        p.hits.push({ id: 'sheet:list', x: 0, y: p.y, w: p.L.W, h: p.L.H });
        (vm.distribution.hist || []).forEach((h, i) => p.text(vm.rows[i].prompt + ' ' + h.join(','), 12));
        p.button('sheet:close', '知道了');
      }
    } else {
      p.text('往期练习 ' + vm.totalText + ' · 不计入排行', 20);
      p.text(vm.bandLabel);
      vm.rows.forEach((r) => p.text(r.prompt + ' ' + r.label + ' ' + r.scoreText, 14));
      if (vm.nextAvailable) p.button('archive:again', '再来一期');
      p.button('archive:backList', '返回列表');
      p.button('archive:distribution', vm.distribution.unlocked ? '查看全国分布' : '▶ 视频 全国分布');
      if (vm.sheet === 'distribution') {
        p.y = p.L.navBottom + 4;
        p.hits.length = 0;
        p.hits.push({ id: 'sheet:list', x: 0, y: p.y, w: p.L.W, h: p.L.H });
        (vm.distribution.hist || []).forEach((h, i) => p.text(vm.rows[i].prompt + ' ' + h.join(','), 12));
        p.button('sheet:close', '知道了');
      }
    }
  },
};

function draw(screen, ctx, vm, layout) {
  ctx.fillStyle = '#f6f1e6';
  ctx.fillRect(0, 0, layout.W, layout.H);
  const p = new Pen(ctx, layout, screen === 'card' ? 'card' : screen === 'round' ? 'round' : screen);
  drawers[screen](p, vm);
  return p.hits;
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
