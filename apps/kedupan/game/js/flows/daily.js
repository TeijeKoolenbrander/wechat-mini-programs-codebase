/**
 * Daily flow (spec 2.1, 6.1-6.4, 15): home, the 5 daily cards with their reveals, the day result, 加一题, 全国分布 and
 * the "这张卡有问题" report. Archive and bonus cards reuse the same card screen (play.mode).
 *
 * Time is the server's (st.offsetMs from getDaily.serverNow); the position of a card is final once the server accepts
 * it; offline at confirm keeps it as `pending` (store) and retries on 重试, onShow and launch (spec 15.2).
 */

const P = require('../../core/present');
const S = require('../../core/score');
const W = require('../../core/windows');
const { hash32 } = require('../../core/rng');
const { normalizeFeatures } = require('../features');
const VM = require('../vm');

module.exports = function install(K) {
  const { st, store, api, ruler, ads, audio, wx } = K;
  let loadSeq = 0;
  let retrying = false;

  // ---- loading the daily ------------------------------------------------------------------------------------------------------

  K.loadDaily = async function loadDaily() {
    const seq = ++loadSeq;
    if (!st.daily) st.dailyStatus = 'loading';
    const arg = st.group.status === 'ok' && st.group.groupRef ? { groupRef: st.group.groupRef } : {};
    const r = await api.getDaily(arg);
    if (seq !== loadSeq) return r;
    if (r.ok) {
      st.daily = r;
      st.dailyStatus = 'ok';
      st.offsetMs = r.serverNow - K.now();
      st.features = normalizeFeatures(r.features);
      ads.setInterstitialConfig(st.features.interstitial);
      reconcileLocal(r);
    } else {
      st.dailyStatus = r.code === 'DAILY_UNAVAILABLE' ? 'unavailable' : K.isNet(r.code) ? 'offline' : 'error';
      K.track('error', { where: 'getDaily', code: r.code || 'unknown' });
    }
    K.invalidate();
    K.syncBanner();
    return r;
  };

  /** Drop local leftovers the server has already settled (answered elsewhere, or an older day). */
  function reconcileLocal(r) {
    const pe = store.state.pending;
    if (pe && (pe.dateKey !== r.dateKey || r.mine.pos[pe.idx] !== null)) {
      store.state.pending = null;
      store.save();
    }
    const vw = store.state.viewing;
    if (vw && (vw.dateKey !== r.dateKey || r.mine.reveals[vw.idx] === null)) {
      store.state.viewing = null;
      store.save();
    }
  }

  K.homeState = () => VM.home(K.ctx(0)).daily.state;

  /** After launch / onShow: send a card that was confirmed offline (spec 15.2). Silent. */
  K.afterLaunchLoad = async function afterLaunchLoad() {
    if (retrying || st.screen !== 'home') return;
    if (VM.pendingFor(store.state.pending, st.daily)) {
      retrying = true;
      try {
        await retryPendingSilently();
      } finally {
        retrying = false;
      }
    }
  };

  async function retryPendingSilently() {
    const pe = store.state.pending;
    if (!pe || !st.daily) return false;
    const arg = { dateKey: pe.dateKey, idx: pe.idx, pos: pe.pos };
    if (st.group.status === 'ok') arg.groupRef = st.group.groupRef;
    const r = await api.submitCard(arg);
    if (r.ok || r.code === 'CARD_DONE' || r.code === 'LATE_SUBMIT' || r.code === 'CARD_ORDER') {
      store.state.pending = null;
      store.save();
      await K.loadDaily();
      return !!r.ok || r.code === 'CARD_DONE';
    }
    return false;
  }

  // ---- home -------------------------------------------------------------------------------------------------------------------------

  K.on('home:daily', () => {
    const s = K.homeState();
    if (s === 'available' || s === 'inProgress') openDailyCard();
    else if (s === 'done') showResult(true);
  });
  K.on('home:retry', async () => {
    const s = K.homeState();
    if (s === 'pendingSubmit') {
      const ok = await retryPendingSilently();
      if (!ok) K.toast(K.copy('NETWORK', 'submitCard'));
    } else {
      await K.loadDaily();
    }
  });
  K.on('home:host', () => K.startCreate());
  K.on('home:archive', () => K.openArchive());
  K.on('home:group', () => K.openGroupPage());
  K.on('home:groupBanner', () => K.openGroupPage());
  K.on('home:friends', () => K.openFriendBoard());

  // ---- the daily card ------------------------------------------------------------------------------------------------------------

  function openDailyCard() {
    const d = st.daily;
    if (!d) return;
    const idx = d.mine.answered;
    const vw = store.state.viewing;
    if (d.mine.complete) return showResult(true);
    if (vw && vw.dateKey === d.dateKey && idx > 0 && vw.idx === idx - 1 && d.mine.reveals[idx - 1]) {
      enterCard(idx - 1, { resumeReveal: d.mine.reveals[idx - 1] });
      return;
    }
    enterCard(idx, {});
  }

  function newPlay(o) {
    return Object.assign(
      { mode: 'daily', dateKey: '', issueNo: 0, cards: [], finals: null, idx: 0, pos: null, phase: 'empty', reveal: null, revealAt: 0, confetti: null, coach: false, submitNote: null, reportSheet: false, startedAt: K.now(), completion: null, raw: null },
      o
    );
  }

  /** opts.from = the previous play of the same day (keeps its date and cards even if st.daily moved on); opts.resumeReveal = a stored reveal to show first. */
  function enterCard(idx, opts) {
    const d = st.daily;
    const src = opts.from || { dateKey: d.dateKey, issueNo: d.issueNo, cards: d.cards };
    const answered = opts.from ? idx : d.mine.answered;
    ruler.reset();
    const coach = !store.state.coachSeen && idx === 0 && answered === 0 && !opts.resumeReveal;
    const p = newPlay({ mode: 'daily', dateKey: src.dateKey, issueNo: src.issueNo, cards: src.cards, idx, coach });
    if (coach) {
      store.state.coachSeen = true; // the one coach bubble shows once, ever
      store.save();
    }
    st.play = p;
    if (!st.dayPos) st.dayPos = {};
    if (!opts.from && d.dateKey === src.dateKey) st.dayPos[src.dateKey] = d.mine.pos.slice();
    if (!st.dayStart) st.dayStart = {};
    if (idx === 0 && !st.dayStart[src.dateKey]) st.dayStart[src.dateKey] = K.now();
    const pe = store.state.pending;
    if (opts.resumeReveal) {
      presentReveal(p, opts.resumeReveal, false);
    } else if (pe && pe.dateKey === src.dateKey && pe.idx === idx) {
      p.pos = pe.pos;
      ruler.restore(pe.pos);
      ruler.lock();
      p.phase = 'pending';
    }
    K.go('card');
  }

  /** Show a server reveal on the card screen. `fresh` = this is the first time the player sees it (effects + analytics). */
  function presentReveal(p, rv, fresh) {
    const rev = P.buildCardReveal({ pos: rv.pos, ref: rv.ref, n: rv.n, agreePct: rv.agreePct, group: rv.group, frozen: !!rv.frozen });
    p.pos = rv.pos;
    p.reveal = rev;
    p.phase = 'revealed';
    p.revealAt = K.now();
    ruler.restore(rv.pos);
    ruler.lock();
    if (p.mode === 'daily') {
      store.state.viewing = { dateKey: p.dateKey, idx: p.idx };
      store.save();
    }
    if (fresh && rev.bullseye) {
      audio.play('chime');
      try {
        if (wx.vibrateShort) wx.vibrateShort({ type: 'light' });
      } catch (e) {
        /* optional */
      }
      p.confetti = { t0: K.now(), seed: hash32(p.dateKey + ':' + p.idx + ':' + rv.pos) };
    }
    K.invalidate();
  }

  K.newPlay = newPlay;
  K.presentReveal = presentReveal;

  K.on('card:primary', () => {
    const p = st.play;
    if (!p || st.screen !== 'card') return;
    if (p.phase === 'revealed') return nextCard();
    if (p.phase === 'submitting') return;
    if (p.phase === 'pending') return p.mode === 'daily' ? submitDaily(p, true) : undefined;
    if (!ruler.canConfirm()) return;
    if (p.mode === 'daily') submitDaily(p, false);
    else K.confirmLocal(p);
  });

  K.on('coach:dismiss', () => {
    if (st.play) st.play.coach = false;
  });

  async function submitDaily(p, retry) {
    const d = st.daily;
    const pos = retry ? p.pos : ruler.pos;
    p.pos = pos;
    ruler.lock();
    p.phase = 'submitting';
    p.submitNote = null;
    if (!retry) K.track('daily_card_place', Object.assign({ dateKey: p.dateKey, idx: p.idx }, ruler.stats(K.now())));
    store.state.pending = { dateKey: p.dateKey, idx: p.idx, pos };
    store.save();
    K.invalidate();
    const arg = { dateKey: p.dateKey, idx: p.idx, pos };
    if (st.group.status === 'ok') arg.groupRef = st.group.groupRef;
    const r = await api.submitCard(arg);
    const accepted = r.ok || (r.code === 'CARD_DONE' && r.reveal);
    if (accepted) {
      store.state.pending = null;
      store.save();
    }
    if (st.play !== p || p.phase !== 'submitting') {
      if (accepted) patchDaily(d, p.dateKey, p.idx, r.ok ? r : r.reveal);
      return;
    }
    if (accepted) return onAccepted(p, r);
    if (r.code === 'LATE_SUBMIT') {
      store.state.pending = null;
      store.save();
      K.toast(K.copy('LATE_SUBMIT'));
      K.goHome();
      return;
    }
    if (r.code === 'CARD_ORDER' || r.code === 'INVALID_INPUT' || r.code === 'DAILY_UNAVAILABLE') {
      store.state.pending = null;
      store.save();
      K.track('error', { where: 'submitCard', code: r.code });
      K.toast(K.copy(r.code, 'submitCard') || K.copy('INTERNAL'));
      K.goHome();
      return;
    }
    // network / timeout / server trouble: keep the position, offer 重试 (spec 6.2)
    K.track('error', { where: 'submitCard', code: r.code || 'unknown' });
    p.phase = 'pending';
    p.submitNote = K.copy('NETWORK', 'submitCard');
    K.invalidate();
  }

  function patchDaily(d, dateKey, idx, rv) {
    recordPos(dateKey, idx, rv.pos);
    if (!d || d.dateKey !== dateKey || !d.mine || d.mine.pos[idx] !== null) return;
    d.mine.pos[idx] = rv.pos;
    d.mine.answered = d.mine.pos.filter((x) => x !== null).length;
    d.mine.complete = d.mine.answered === 5;
  }

  function onAccepted(p, r) {
    const replay = !r.ok;
    const rv = replay ? Object.assign({}, r.reveal) : r;
    const d = st.daily;
    patchDaily(d, p.dateKey, p.idx, rv);
    presentReveal(p, rv, !replay);
    K.trackOnce('reveal:' + p.dateKey + ':' + p.idx, 'daily_card_reveal', {
      dateKey: p.dateKey,
      idx: p.idx,
      d: rv.d,
      score: rv.score,
      label: rv.label,
      hasGroup: !!(rv.group && rv.group.n >= 1),
      n: rv.n,
    });
    const complete = r.ok ? r.complete : p.idx === 4;
    if (complete) {
      p.completion = r.ok ? r : null;
      K.trackOnce('complete:' + p.dateKey, 'daily_complete', {
        dateKey: p.dateKey,
        total: r.ok && r.total !== undefined ? r.total : null,
        durationMs: Math.max(0, K.now() - (st.dayStart && st.dayStart[p.dateKey] ? st.dayStart[p.dateKey] : p.startedAt)),
        hasGroup: st.group.status === 'ok',
        streak: r.ok && r.streak ? r.streak.current : 0,
      });
      if (r.ok) {
        store.state.lifetimeSets += 1;
        store.save();
      }
    }
    if (K.pendingEntryToast) K.pendingEntryToast();
  }

  function nextCard() {
    const p = st.play;
    if (p.mode === 'daily') {
      store.state.viewing = null;
      store.save();
      if (p.idx < 4) return enterCard(p.idx + 1, { from: p });
      return showResult(true, p);
    }
    if (p.mode === 'archive') return K.archiveNext(p);
    if (p.mode === 'bonus') return backFromCard();
  }

  function backFromCard() {
    const p = st.play;
    if (!p) return K.goHome();
    if (p.mode === 'daily') {
      store.state.viewing = null;
      store.save();
      return K.goHome();
    }
    if (p.mode === 'archive') return K.openArchive();
    // bonus -> the result it came from
    st.play = null;
    ruler.reset();
    if (st.result) K.go('result');
    else K.goHome();
  }
  K.on('card:back', backFromCard);

  // ---- 这张卡有问题 -----------------------------------------------------------------------------------------------------------------

  K.on('card:report', () => {
    if (st.play) st.play.reportSheet = true;
  });
  ['unsuitable', 'ambiguous', 'typo'].forEach((reason) => {
    K.on('report:' + reason, async () => {
      const p = st.play;
      if (!p) return;
      p.reportSheet = false;
      const card = p.cards[p.mode === 'bonus' ? 0 : p.idx];
      const r = await api.reportCard({ itemId: card.itemId, reason, dateKey: p.mode === 'daily' ? p.dateKey : undefined });
      if (r.ok) {
        K.track('card_report', { itemId: card.itemId, reason });
        K.toast('谢谢，我们会尽快查看');
      } else K.toast(K.copy(r.code, 'reportCard'));
    });
  });
  K.on('report:cancel', () => {
    if (st.play) st.play.reportSheet = false;
  });

  // ---- day result -------------------------------------------------------------------------------------------------------------------

  function resultFromDaily(d, prev) {
    return {
      source: 'daily',
      dateKey: d.dateKey,
      issueNo: d.issueNo,
      cards: d.cards,
      positions: d.mine.pos.slice(),
      refs: d.refs.slice(),
      scores: d.mine.cardScores.slice(),
      total: d.mine.total,
      final: !!d.frozen,
      pct: null,
      divisiveIdx: d.divisiveIdx,
      streak: d.myStreak.current,
      groupStats: prev ? prev.groupStats : null,
      stale: false,
      enteredAt: prev ? prev.enteredAt : K.now(),
    };
  }

  function resultFromArchive(a, prev) {
    return Object.assign({}, prev, {
      source: 'archive',
      dateKey: a.dateKey,
      issueNo: a.issueNo,
      cards: a.cards,
      positions: a.mine.pos.slice(),
      refs: a.finals.slice(),
      scores: a.mine.cardScores.slice(),
      total: a.mine.total,
      final: true,
      pct: a.mine.pct,
      stale: false,
    });
  }

  function recordPos(dateKey, idx, pos) {
    if (!st.dayPos) st.dayPos = {};
    if (!st.dayPos[dateKey]) st.dayPos[dateKey] = new Array(5).fill(null);
    st.dayPos[dateKey][idx] = pos;
  }

  /** Result built from the 5th submit's completion block (it carries the references of that very moment). */
  function resultFromCompletion(p) {
    const c = p.completion;
    const pos = st.dayPos && st.dayPos[p.dateKey];
    if (!c || !pos || pos.some((x) => x === null)) return null;
    return {
      source: 'daily',
      dateKey: p.dateKey,
      issueNo: p.issueNo,
      cards: p.cards,
      positions: pos.slice(),
      refs: c.refs.slice(),
      scores: c.cardScores.slice(),
      total: c.total,
      final: false,
      pct: null,
      divisiveIdx: c.divisiveIdx,
      streak: c.streak ? c.streak.current : 0,
      groupStats: null,
      stale: false,
      enteredAt: K.now(),
    };
  }

  /** Open the day result. userTap = the player tapped 看结果 / the done card (the marker write may then prompt). */
  function showResult(userTap, p) {
    const d = st.daily;
    let res = p ? resultFromCompletion(p) : null;
    if (!res) {
      if (!d || !d.mine.complete) return K.goHome();
      res = resultFromDaily(d, null);
    }
    st.result = res;
    st.play = null;
    ruler.reset();
    K.go('result');
    K.track('daily_result_view', { dateKey: res.dateKey, final: false });
    if (userTap) writeMarkerOnce(res.dateKey, res.total);
    loadResultGroup();
    return K.refreshResult();
  }

  /** The presence marker (spec 8.2): after a completed daily, from the 看结果 tap, once per day. */
  function writeMarkerOnce(dateKey, total) {
    const pv = store.state.privacy;
    if (pv.markerDay === dateKey || total === null || total === undefined) return;
    K.privacy.writeMarker(dateKey, total);
  }

  async function loadResultGroup() {
    if (st.group.status !== 'ok' || !st.result) return;
    const rs = st.result;
    const r = await api.getGroupDay({ groupRef: st.group.groupRef, dateKey: rs.dateKey });
    if (!r.ok || st.result !== rs) return;
    const mine = r.rows.find((x) => x[0] === r.selfHash);
    rs.groupStats = mine ? { gs: mine[1], mq: r.mq, n: r.n } : null;
    K.invalidate();
  }

  /** onShow on the result: new numbers; if the day closed meanwhile, switch to the frozen 定分 view (spec 6.4). */
  K.refreshResult = async function refreshResult() {
    const rs = st.result;
    if (!rs) return;
    const tok = st.nav;
    let r;
    if (W.dayClosed(rs.dateKey, K.srvNow())) {
      r = await api.getArchiveDay({ dateKey: rs.dateKey });
      if (!K.live(tok)) return;
      if (r.ok && r.mine && r.mine.complete) st.result = resultFromArchive(r, st.result);
      else st.result.stale = true;
    } else if (rs.dateKey === K.todayKey()) {
      r = await K.loadDaily();
      if (!K.live(tok)) return;
      if (r.ok && r.mine.complete) st.result = resultFromDaily(st.daily, st.result);
      else st.result.stale = true;
    } else {
      r = await api.getDaily({ dateKey: rs.dateKey });
      if (!K.live(tok)) return;
      if (r.ok && r.mine.complete) st.result = resultFromDaily(r, st.result);
      else st.result.stale = true;
    }
    K.invalidate();
  };

  K.on('result:back', () => K.goHome());
  K.on('result:scroll', () => {});
  K.on('result:share', async () => {
    const rs = st.result;
    if (!rs) return;
    const labels = rs.positions.map((pos, i) => S.scoreAt(pos, rs.refs[i]).label);
    await K.share.shareDaily({ dateKey: rs.dateKey, issueNo: rs.issueNo, cards: rs.cards, labels, total: rs.total, band: S.dayBand(rs.total) });
  });
  K.on('result:group', () => K.openGroupPage());
  K.on('result:friends', () => K.openFriendBoard());
  K.on('result:host', () => K.startCreate());
  K.on('result:archive', () => K.openArchive());

  // ---- 加一题 (rewarded) -------------------------------------------------------------------------------------------------------------

  K.on('result:bonus', async () => {
    const d = st.daily;
    if (!d || !d.mine.complete) return; // only after a complete daily (AC 39)
    if (VM.bonusLeft(K.ctx(0)) === 0) return K.toast(K.copy('RATE_LIMITED', 'getBonusCard'));
    if (st.adState.bonus === 'loading' || st.adState.bonus === 'playing') return;
    st.adState.bonus = 'loading';
    K.invalidate();
    const out = await ads.rewarded('bonus');
    if (!out.granted) {
      st.adState.bonus = out.reason === 'noFillBlocked' ? 'error' : 'idle';
      if (out.toast) K.toast(out.toast);
      K.invalidate();
      return;
    }
    if (out.toast) K.toast(out.toast);
    st.adState.bonus = 'idle';
    const r = await api.getBonusCard({ exclude: store.state.playedItems.slice(-60) });
    if (!r.ok) {
      if (r.code === 'RATE_LIMITED' && r.scope !== 'minute') { // the per-day limit; a per-minute refusal (M3) says nothing about today's allowance
        store.state.bonus = { day: K.todayKey(), used: 3 };
        store.save();
      }
      K.toast(r.scope === 'minute' ? K.copy('RATE_LIMITED') : K.copy(r.code, 'getBonusCard'));
      K.invalidate();
      return;
    }
    const b = store.state.bonus;
    if (b.day !== K.todayKey()) {
      b.day = K.todayKey();
      b.used = 0;
    }
    b.used += 1;
    K.rememberItem(r.card.itemId);
    store.save();
    startBonus(r);
  });

  K.rememberItem = function rememberItem(itemId) {
    const list = store.state.playedItems;
    if (list.indexOf(itemId) < 0) list.push(itemId);
    while (list.length > 60) list.shift();
  };

  function startBonus(r) {
    ruler.reset();
    st.play = newPlay({ mode: 'bonus', dateKey: r.dateKey, issueNo: r.issueNo, cards: [r.card], finals: [r.final], idx: 0 });
    K.go('card');
  }

  // ---- 全国分布 (rewarded) -------------------------------------------------------------------------------------------------------------

  /** key = the date key of the set. Shared by the result, the archive review and the archive set end. */
  K.distributionTap = async function distributionTap(key) {
    const today = K.todayKey();
    const un = store.state.unlocks;
    if (un.day !== today) {
      un.day = today;
      un.keys = {};
    }
    const openSheet = () => {
      st.sheet = 'distribution';
      st.sheetScroll = 0;
      K.invalidate();
    };
    if (un.keys[key]) {
      if (!st.dist[key]) {
        const r = await api.unlockDistribution({ dateKey: key });
        if (r.ok) st.dist[key] = r.hist;
        else return K.toast(K.copy(r.code, 'unlockDistribution'));
      }
      return openSheet();
    }
    if (st.adState.distribution === 'loading') return;
    st.adState.distribution = 'loading';
    K.invalidate();
    const out = await ads.rewarded('distribution');
    if (!out.granted) {
      st.adState.distribution = out.reason === 'noFillBlocked' ? 'error' : 'idle';
      if (out.toast) K.toast(out.toast);
      K.invalidate();
      return;
    }
    if (out.toast) K.toast(out.toast);
    const r = await api.unlockDistribution({ dateKey: key });
    st.adState.distribution = 'idle';
    if (!r.ok) {
      K.toast(K.copy(r.code, 'unlockDistribution'));
      K.invalidate();
      return;
    }
    un.keys[key] = true;
    store.save();
    st.dist[key] = r.hist;
    K.track('distribution_unlock', { dateKey: key, via: out.reason === 'noFillGrant' ? 'nofill' : 'ad' });
    openSheet();
  };
  K.on('result:distribution', () => st.result && K.distributionTap(st.result.dateKey));
};
