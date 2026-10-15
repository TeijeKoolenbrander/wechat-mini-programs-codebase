/**
 * Card play flow (spec 2.1, 2.3, 6.2, 6.3): the ruler, confirm, the reveal, for the daily, archive sets and the
 * bonus card. The daily reveal needs the server (submitCard); archive and bonus score locally against the frozen final.
 */

const S_ = require('../../core/score');
const V = require('../vm');
const { clamp } = require('../util');

const REVEAL_MS = 600;
const REASONS = ['unsuitable', 'ambiguous', 'typo'];

module.exports = function createCard(c) {
  const { S, api, track } = c;
  let card = null;
  const f = { REASONS };

  // ---------------------------------------------------------------- construction

  function make(o) {
    return {
      mode: o.mode, // 'daily' | 'archive' | 'bonus'
      cards: o.cards,
      idx: o.idx || 0,
      total: o.total || o.cards.length,
      dateKey: o.dateKey || null,
      issueNo: o.issueNo || null,
      finals: o.finals || null,
      phase: 'empty',
      needle: null,
      touches: 0,
      nudges: 0,
      firstTouchAt: 0,
      revealAt: 0,
      reveal: null,
      sheet: null,
      positions: o.positions || [],
      startedAt: c.now(),
      coach: !!o.coach,
      lastBin: -1,
    };
  }

  f.state = () => card;
  f.midCard = () => !!card && c.screen === 'card' && card.phase !== 'revealed';

  /** Start (or resume at the first unanswered card) today's daily. */
  f.startDaily = function () {
    const d = S.daily;
    if (!d || d.dateKey !== c.todayKey()) return c.flows.home.refreshDaily();
    const idx = d.pos.findIndex((p) => p === null);
    if (idx < 0) return c.flows.result.open(false);
    card = make({ mode: 'daily', cards: d.cards, idx, dateKey: d.dateKey, issueNo: d.issueNo, positions: d.pos.slice(), coach: !S.coachSeen && S.lifetimeSets === 0 && idx === 0 });
    c.go('card', { replace: c.screen === 'card' });
    return undefined;
  };

  /** Home showed 答案待发送: open the card with the kept position and a retry. */
  f.resumePending = function () {
    const d = S.daily;
    const p = S.pending;
    if (!d || !p) return c.flows.home.refreshDaily();
    card = make({ mode: 'daily', cards: d.cards, idx: p.idx, dateKey: d.dateKey, issueNo: d.issueNo, positions: d.pos.slice() });
    card.needle = p.pos;
    card.phase = 'pending';
    c.go('card');
    return undefined;
  };

  /** Archive play of a closed day: cards[5] and finals[5] from getArchiveDay. */
  f.startArchive = function (day) {
    card = make({ mode: 'archive', cards: day.cards, finals: day.finals, dateKey: day.dateKey, issueNo: day.issueNo });
    c.go('card');
  };

  /** 加一题: one card from a closed day, scored against its frozen final, unscored for the day. */
  f.startBonus = function (cardText, final, dateKey) {
    card = make({ mode: 'bonus', cards: [cardText], finals: [final], total: 1, dateKey });
    c.go('card');
  };

  // ---------------------------------------------------------------- the ruler

  function endCoach() {
    if (card && card.coach) {
      card.coach = false;
      S.coachSeen = true;
      c.store.save();
    }
  }

  function setNeedle(pos) {
    card.needle = clamp(Math.round(pos), 0, 100);
    card.phase = 'placing';
    const bin = Math.floor(card.needle / 5);
    if (bin !== card.lastBin) {
      card.lastBin = bin;
      c.audio('tick');
    }
  }

  f.ruler = function (pos, phase) {
    if (!card || (card.phase !== 'empty' && card.phase !== 'placing')) return;
    if (phase === 'start') {
      card.touches++;
      endCoach();
    }
    if (!card.firstTouchAt) card.firstTouchAt = c.now();
    setNeedle(pos);
  };

  function nudge(dir) {
    if (!card || (card.phase !== 'empty' && card.phase !== 'placing')) return;
    card.nudges++;
    if (!card.firstTouchAt) card.firstTouchAt = c.now();
    endCoach();
    setNeedle((card.needle === null ? 50 : card.needle) + dir);
  }

  // ---------------------------------------------------------------- confirm and reveal

  function applyDailyReveal(resp) {
    const d = S.daily;
    const idx = card.idx;
    const group = resp.group || null;
    d.pos[idx] = resp.pos;
    d.answered = d.pos.filter((p) => p !== null).length;
    d.refs[idx] = resp.ref;
    if (S.pending && S.pending.dateKey === d.dateKey && S.pending.idx === idx) S.pending = null;
    card.needle = resp.pos;
    card.positions[idx] = resp.pos;
    card.reveal = V.revealVm({ pos: resp.pos, ref: resp.ref, n: resp.n, agreePct: resp.agreePct, group, mode: 'daily', live: true });
    card.phase = 'revealed';
    card.revealAt = c.now();
    track('daily_card_reveal', { dateKey: d.dateKey, idx, d: Math.abs(resp.pos - resp.ref), score: S_.cardScore(Math.abs(resp.pos - resp.ref)), label: card.reveal.label, hasGroup: !!group, n: resp.n });
    celebrate(card.reveal);
    if (resp.complete) {
      d.complete = true;
      d.total = resp.total;
      d.streak = { current: resp.streak || 1, best: Math.max(d.streak ? d.streak.best : 0, resp.streak || 1) };
      S.lifetimeSets++;
      track('daily_complete', { dateKey: d.dateKey, total: resp.total, durationMs: c.now() - card.startedAt, hasGroup: !!group, streak: resp.streak || 1 });
    }
    c.store.save();
    if (c.pendingEntry) c.toast('你有一道新刻度题');
  }

  function celebrate(reveal) {
    if (reveal.bullseye) {
      if (c.wx.vibrateShort) c.wx.vibrateShort({ type: 'light' });
      c.audio('bullseye');
    } else c.audio('reveal');
  }

  async function submitDaily() {
    const d = S.daily;
    const idx = card.idx;
    const pos = card.needle;
    card.phase = 'submitting';
    c.invalidate();
    track('daily_card_place', { dateKey: d.dateKey, idx, touches: card.touches, nudges: card.nudges, ms: card.firstTouchAt ? c.now() - card.firstTouchAt : 0 });
    const r = await api.submitCard({ dateKey: d.dateKey, idx, pos, groupRef: c.group.status === 'ok' ? c.group.groupRef : undefined });
    if (!card || card.idx !== idx || card.mode !== 'daily') return;
    if (r && r.ok) return applyDailyReveal(r);
    const code = r && r.code;
    if (code === 'CARD_DONE' && r.reveal) {
      // answered elsewhere: the server's stored position and reveal win
      card.needle = r.reveal.pos;
      return applyDailyReveal(r.reveal);
    }
    if (code === 'CARD_ORDER') {
      await c.flows.home.refreshDaily(true);
      track('error', { where: 'submitCard', code });
      return f.startDailyAfterSync();
    }
    if (code === 'LATE_SUBMIT') {
      track('error', { where: 'submitCard', code });
      c.toast('这一期已经结束，可以去往期里玩');
      S.pending = null;
      c.store.save();
      card = null;
      await c.flows.home.refreshDaily(true);
      return c.goHome();
    }
    // offline, timeout or anything else: keep the position, retry later; the reveal needs the server
    S.pending = { dateKey: d.dateKey, idx, pos };
    c.store.save();
    card.phase = 'pending';
    track('error', { where: 'submitCard', code: code || 'none' });
    c.invalidate();
    return undefined;
  }

  f.startDailyAfterSync = function () {
    card = null;
    return f.startDaily();
  };

  /** Retry a pending (unsent) card without any UI: launch, onShow, or the home retry. */
  f.flushPending = async function () {
    const p = S.pending;
    if (!p || !S.daily || S.daily.dateKey !== p.dateKey) return;
    const r = await api.submitCard({ dateKey: p.dateKey, idx: p.idx, pos: p.pos, groupRef: c.group.status === 'ok' ? c.group.groupRef : undefined });
    if (r && (r.ok || (r.code === 'CARD_DONE' && r.reveal))) {
      const resp = r.ok ? r : r.reveal;
      const showing = card && card.mode === 'daily' && card.idx === p.idx && c.screen === 'card';
      if (showing) {
        card.needle = resp.pos;
        applyDailyReveal(resp);
      } else {
        const d = S.daily;
        d.pos[p.idx] = resp.pos;
        d.answered = d.pos.filter((x) => x !== null).length;
        d.refs[p.idx] = resp.ref;
        if (resp.complete) {
          d.complete = true;
          d.total = resp.total;
          S.lifetimeSets++;
        }
        S.pending = null;
        c.store.save();
      }
    } else if (r && (r.code === 'LATE_SUBMIT' || r.code === 'CARD_ORDER' || r.code === 'INVALID_INPUT')) {
      S.pending = null;
      c.store.save();
      await c.flows.home.refreshDaily(true);
    }
    c.invalidate();
  };

  function confirmLocal() {
    const final = card.finals[card.idx];
    card.reveal = V.revealVm({ pos: card.needle, ref: final, n: 0, agreePct: null, group: null, mode: card.mode, live: false });
    card.positions[card.idx] = card.needle;
    card.phase = 'revealed';
    card.revealAt = c.now();
    celebrate(card.reveal);
    if (card.mode === 'bonus') {
      track('bonus_card', { itemId: card.cards[0].itemId, score: S_.cardScore(Math.abs(card.needle - final)) });
    }
    if (c.pendingEntry) c.toast('你有一道新刻度题');
  }

  function primary() {
    if (!card) return;
    if (card.phase === 'placing' && card.needle !== null) return card.mode === 'daily' ? submitDaily() : confirmLocal();
    if (card.phase === 'pending') return card.mode === 'daily' ? retryPendingTap() : undefined;
    if (card.phase === 'revealed') return next();
    return undefined;
  }

  async function retryPendingTap() {
    const p = S.pending;
    if (!p) return;
    card.phase = 'submitting';
    c.invalidate();
    const idx = card.idx;
    const r = await api.submitCard({ dateKey: p.dateKey, idx: p.idx, pos: p.pos, groupRef: c.group.status === 'ok' ? c.group.groupRef : undefined });
    if (!card || card.idx !== idx) return;
    if (r && r.ok) return applyDailyReveal(r);
    if (r && r.code === 'CARD_DONE' && r.reveal) return applyDailyReveal(r.reveal);
    if (r && (r.code === 'LATE_SUBMIT' || r.code === 'CARD_ORDER')) {
      S.pending = null;
      c.store.save();
      card = null;
      await c.flows.home.refreshDaily(true);
      if (r.code === 'LATE_SUBMIT') c.toast('这一期已经结束，可以去往期里玩');
      return c.goHome();
    }
    card.phase = 'pending';
    track('error', { where: 'submitCard', code: (r && r.code) || 'none' });
    c.invalidate();
    return undefined;
  }

  function next() {
    if (card.idx < card.total - 1) {
      card.idx++;
      card.phase = 'empty';
      card.needle = null;
      card.touches = 0;
      card.nudges = 0;
      card.firstTouchAt = 0;
      card.reveal = null;
      card.lastBin = -1;
      c.invalidate();
      return;
    }
    if (card.mode === 'daily') {
      card = null;
      return c.flows.result.open(true);
    }
    if (card.mode === 'archive') {
      const done = card;
      card = null;
      return c.flows.archive.finishSet(done);
    }
    card = null;
    return c.flows.result.open(false, true);
  }

  // ---------------------------------------------------------------- report sheet (6.3)

  async function report(reason) {
    const cur = card.cards[card.idx];
    card.sheet = null;
    const r = await api.reportCard({ itemId: cur.itemId, dateKey: card.mode === 'bonus' ? card.dateKey : card.dateKey || null, reason });
    track('card_report', { itemId: cur.itemId, reason });
    if (r && r.ok) c.toast('谢谢，我们会尽快查看');
    else if (r && r.code === 'RATE_LIMITED') c.toast('今天反馈得够多啦，谢谢');
    else c.toast('暂时没发出去，稍后再试');
  }

  // ---------------------------------------------------------------- hits and view

  f.back = function () {
    if (!card) return c.goHome();
    if (card.phase === 'submitting') return undefined;
    const mode = card.mode;
    card = null;
    if (mode === 'bonus') return c.flows.result.open(false, true);
    if (mode === 'archive') {
      c.flows.archive.reenter();
      return undefined;
    }
    return c.goHome();
  };

  f.hit = function (id) {
    if (!card) return undefined;
    if (card.sheet === 'report') {
      if (id === 'report:cancel' || id === 'sheet:close') card.sheet = null;
      else if (id.indexOf('report:') === 0 && REASONS.indexOf(id.slice(7)) >= 0) report(id.slice(7));
      return undefined;
    }
    switch (id) {
      case 'back':
        return f.back();
      case 'card:left':
        return nudge(-1);
      case 'card:right':
        return nudge(1);
      case 'card:primary':
        return primary();
      case 'card:report':
        if (card.phase === 'revealed') card.sheet = 'report';
        return undefined;
      case 'coach:ok':
        return endCoach();
    }
    return undefined;
  };

  f.animating = (t) => !!card && ((card.phase === 'submitting') || (card.phase === 'revealed' && card.revealAt && t - card.revealAt < REVEAL_MS + 800));

  f.vm = function (t) {
    if (!card) return c.flows.home.vm(t);
    const cur = card.cards[card.idx];
    const isDaily = card.mode === 'daily';
    const header = isDaily ? '每日刻度 · 第 ' + card.issueNo + ' 期' : card.mode === 'archive' ? '往期刻度 · 第 ' + card.issueNo + ' 期' : '加一题';
    const vm = V.cardVm(
      {
        mode: card.mode,
        index: card.mode === 'bonus' ? null : card.idx + 1,
        total: card.mode === 'bonus' ? null : card.total,
        tag: card.mode === 'bonus' ? '加一题 · 不计分' : null,
        card: cur,
        phase: card.phase,
        needle: card.needle,
        reveal: card.reveal,
        isLast: card.idx >= card.total - 1,
        headerText: header,
        coach: card.coach,
        sheet: card.sheet,
        canReport: true,
      },
      c.display(),
      c.featuresVm()
    );
    vm.revealT = card.phase === 'revealed' && card.revealAt ? clamp((t - card.revealAt) / REVEAL_MS, 0, 1) : 0;
    vm.t = t;
    return vm;
  };

  f.nudge = nudge;
  return f;
};
