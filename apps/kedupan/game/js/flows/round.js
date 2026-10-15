/**
 * Round flow (spec 2.2, 6.6, 6.7): a guesser places and submits, waits, sees the reveal (or 先猜再看 after it);
 * the host waits and reveals. Guessers never see other guesses or the target before the reveal (the server never
 * sends them). The reveal's names are drawn by the open data domain only; with privacy or the friend scope
 * refused the rows render anonymously ("群友 A/B/C"). No ad appears in this flow (PD-28).
 */

const V = require('../vm');
const Sh = require('../share');
const { clamp } = require('../util');

module.exports = function createRound(c) {
  const { S, api, track, privacy } = c;
  const f = {};
  let s = null;

  function fresh(roundId, source, auto) {
    return {
      roundId,
      source,
      auto: !!auto,
      status: 'loading',
      data: null,
      phase: 'empty',
      needle: null,
      lateMode: false,
      viewOnly: false,
      namesState: null, // null (names allowed) | 'privacyDenied' | 'unauthorized'
      sub: null,
      declined: false,
      offered: false,
      reveal: null,
      error: null,
      lastBin: -1,
    };
  }

  f.state = () => s;

  // ---------------------------------------------------------------- loading

  function mapStatus(r) {
    if (r.status === 'noGuesses') return 'noGuesses';
    if (r.isHost) return r.status === 'revealed' ? 'revealed' : 'hostWaiting';
    if (r.status === 'revealed') return r.myGuess || s.viewOnly ? 'revealed' : 'revealedUnplayed';
    return r.myGuess ? 'submitted' : 'open';
  }

  function buildReveal(r) {
    return {
      target: r.target,
      mq: r.mq,
      rows: r.rows,
      markers: V.roundMarkers(r.target, r.rows, r.selfHash),
      salt: r.salt,
      selfHash: r.selfHash,
      best: r.bestHash || null,
    };
  }

  async function renderNames(allowPrompt) {
    if (!s.reveal) return;
    let ok = privacy.friendDataEnabled();
    if (!ok && allowPrompt) {
      const g = await c.gateNames(false, 'round_reveal');
      ok = g === 'ok';
      s.namesState = ok ? null : g;
    } else if (!ok) {
      s.namesState = S.privacy.privacy === 'agreed' ? 'unauthorized' : 'privacyDenied';
    } else s.namesState = null;
    const rc = c.odcRect();
    const msg = V.odcMessage('round', {
      salt: s.reveal.salt,
      selfHash: s.reveal.selfHash,
      viewerDone: true,
      rows: s.reveal.rows,
      width: rc.w,
      height: rc.h,
      dpr: rc.dpr,
      palette: c.display().palette,
      scale: c.display().scale,
      anon: !ok,
      shareTicket: c.group.status === 'ok' ? c.group.shareTicket : undefined,
    });
    c.odc.render(msg);
    c.invalidate();
  }

  function apply(r, allowPrompt) {
    s.data = r;
    s.status = mapStatus(r);
    s.reveal = r.status === 'revealed' && r.rows ? buildReveal(r) : null;
    if (s.status === 'open' && s.phase !== 'placing') s.phase = 'empty';
    if (s.reveal && (s.status === 'revealed' || s.status === 'revealedUnplayed' || s.status === 'hostWaiting')) {
      if (s.status === 'revealed') renderNames(!!allowPrompt);
    }
    offerSubscribe();
  }

  async function load(allowPrompt, quiet) {
    if (!quiet) {
      s.status = 'loading';
      c.invalidate();
    }
    const r = await api.getRound({ roundId: s.roundId, groupRef: c.group.status === 'ok' ? c.group.groupRef : undefined });
    if (r && r.ok) {
      apply(r, allowPrompt);
    } else if (!quiet) {
      const code = r && r.code;
      s.status = code === 'ROUND_NOT_FOUND' ? 'notFound' : 'offline';
      if (code !== 'ROUND_NOT_FOUND') track('error', { where: 'getRound', code: code || 'none' });
    }
    if (!quiet) track('round_view', { roundId: s.roundId, status: s.status, isHost: !!(s.data && s.data.isHost) });
    c.invalidate();
  }

  /**
   * Open a round. source: 'entry' (a card) | 'host' (just shared) | 'group' (from the group page).
   * auto = true when no in-game tap led here (card entry): privacy is never prompted for names.
   */
  f.open = async function (roundId, source, auto, replace) {
    s = fresh(roundId, source, auto);
    c.go('round', { replace: !!replace || c.screen === 'round' });
    await load(false);
    // the host's own round: if it was just shared, offer the reminder
    return undefined;
  };

  // ---------------------------------------------------------------- the ruler

  function setNeedle(pos) {
    s.needle = clamp(Math.round(pos), 0, 100);
    s.phase = 'placing';
    const bin = Math.floor(s.needle / 5);
    if (bin !== s.lastBin) {
      s.lastBin = bin;
      c.audio('tick');
    }
  }
  const placing = () => s && (s.status === 'open' || (s.status === 'revealedUnplayed' && s.lateMode)) && (s.phase === 'empty' || s.phase === 'placing');

  f.ruler = function (pos) {
    if (!placing()) return;
    setNeedle(pos);
  };

  function nudge(dir) {
    if (!placing()) return;
    setNeedle((s.needle === null ? 50 : s.needle) + dir);
  }

  // ---------------------------------------------------------------- actions

  async function submit() {
    if (!placing() || s.needle === null) return;
    const wasLate = s.status === 'revealedUnplayed';
    const pos = s.needle;
    s.phase = 'submitting';
    c.invalidate();
    const r = await api.submitGuess({ roundId: s.roundId, pos, groupRef: c.group.status === 'ok' ? c.group.groupRef : undefined });
    if (!s) return;
    if (r && r.ok) {
      track('round_guess', { roundId: s.roundId, late: !!r.late, isFirstSession: S.firstDate === c.todayKey() });
      s.phase = 'empty';
      if (r.reveal) {
        // revealed already (late guess, or the 8th guess): show the reveal with my guess marked
        const merged = Object.assign({}, s.data, r.reveal, { status: 'revealed', myGuess: { pos, late: !!r.late }, guessCount: r.guessCount });
        s.lateMode = false;
        apply(merged, true);
      } else {
        s.data = Object.assign({}, s.data, { myGuess: { pos, late: false }, guessCount: r.guessCount });
        s.status = 'submitted';
        offerSubscribe();
      }
      maybeMarker();
      c.invalidate();
      return;
    }
    const code = r && r.code;
    track('error', { where: 'submitGuess', code: code || 'none' });
    s.phase = 'placing';
    if (code === 'ALREADY_GUESSED' || code === 'OWN_ROUND') return load(false, true);
    if (code === 'ROUND_EXPIRED') {
      s.status = 'expired';
      return c.invalidate();
    }
    c.toast(wasLate ? '网络不稳，再点一次就这儿' : '网络不稳，答案没发出去，再点一次');
    return undefined;
  }

  function maybeMarker() {
    // spec 8.2: on the first round guess of a day if no daily marker was written
    if (S.markerDay !== c.todayKey()) privacy.writeMarker(c.todayKey(), S.daily && S.daily.total ? S.daily.total : 0).then(() => c.invalidate());
  }

  async function revealByHost() {
    if (s.status !== 'hostWaiting') return;
    if (!(s.data.guessCount >= c.config.rounds.revealMinGuesses)) return c.toast('至少 2 人作答后可揭晓');
    s.phase = 'revealing';
    c.invalidate();
    const r = await api.revealRound({ roundId: s.roundId });
    s.phase = 'empty';
    if (r && r.ok) {
      const merged = Object.assign({}, s.data, r.reveal, { status: 'revealed', guessCount: r.guessCount });
      apply(merged, true);
    } else if (r && r.code === 'TOO_FEW_GUESSES') {
      c.toast('至少 2 人作答后可揭晓');
      await load(false, true);
    } else {
      track('error', { where: 'revealRound', code: (r && r.code) || 'none' });
      c.toast('网络不稳，再点一次揭晓');
    }
    c.invalidate();
  }

  function late() {
    if (s.status !== 'revealedUnplayed' || s.data.expired) return;
    s.lateMode = true;
    s.phase = 'empty';
    s.needle = null;
  }

  function viewAnswer() {
    if (s.status !== 'revealedUnplayed') return;
    s.viewOnly = true;
    s.status = 'revealed';
    renderNames(true);
  }

  // ---------------------------------------------------------------- subscribe message (7.4)

  function subscribeState() {
    const tmpl = c.features.subscribe && c.features.subscribe.tmplId;
    if (!tmpl) return 'hidden';
    if (S.subscribeBanned) return 'unavailable';
    if (!s) return 'hidden';
    if (s.sub === 'requesting') return 'requesting';
    if (S.subscribedRounds[s.roundId] || s.sub === 'granted') return 'granted';
    if (s.sub === 'declined') return 'declined';
    const where = (s.data && s.data.isHost && s.status === 'hostWaiting') || s.status === 'submitted';
    return where ? 'offer' : 'hidden';
  }

  function offerSubscribe() {
    if (s && !s.offered && subscribeState() === 'offer') {
      s.offered = true;
      track('subscribe_offer', { where: s.data && s.data.isHost ? 'host' : 'guess' });
    }
  }

  async function subscribe() {
    const tmpl = c.features.subscribe && c.features.subscribe.tmplId;
    if (!tmpl || subscribeState() !== 'offer' || !c.wx.requestSubscribeMessage) return;
    const where = s.data && s.data.isHost ? 'host' : 'guess';
    s.sub = 'requesting';
    c.invalidate();
    const res = await new Promise((resolve) => {
      c.wx.requestSubscribeMessage({
        tmplIds: [tmpl],
        success: (r) => resolve({ result: r && r[tmpl] }),
        fail: (e) => resolve({ errCode: e && (e.errCode !== undefined ? e.errCode : e.errno) }),
      });
    });
    if (!s) return;
    if (res.result === 'accept') {
      const r = await api.subscribeRound({ roundId: s.roundId });
      if (r && r.ok) {
        S.subscribedRounds[s.roundId] = true;
        c.store.save();
        s.sub = 'granted';
        track('subscribe_result', { where, result: 'accept' });
      } else {
        s.sub = null;
        track('subscribe_result', { where, result: 'error', errCode: r && r.code });
      }
    } else if (res.result === 'ban' || res.errCode === 20004) {
      S.subscribeBanned = true;
      c.store.save();
      s.sub = 'declined';
      track('subscribe_result', { where, result: 'ban', errCode: res.errCode });
    } else {
      s.sub = 'declined';
      track('subscribe_result', { where, result: res.result === 'reject' ? 'reject' : 'error', errCode: res.errCode });
    }
    c.invalidate();
  }

  // ---------------------------------------------------------------- hits and view

  f.shareContext = function () {
    if (c.screen !== 'round' || !s || !s.data) return null;
    const d = s.data;
    if (s.status === 'hostWaiting' || (d.isHost && s.status !== 'revealed')) return { kind: 'round', roundId: s.roundId, left: d.left, right: d.right, clueText: d.clueText, card: Sh.roundCardVm(d.left, d.right, d.clueText) };
    if (s.reveal) {
      const dots = s.reveal.rows.filter((r) => r[1] !== null && !r[3]).map((r) => r[1]);
      return { kind: 'reveal', roundId: s.roundId, mq: s.reveal.mq, card: Sh.revealCardVm(d.left, d.right, s.reveal.target, dots, s.reveal.mq) };
    }
    return null;
  };

  f.onShow = function () {
    if (c.screen === 'round' && s && (s.status === 'hostWaiting' || s.status === 'submitted' || s.status === 'open')) load(false, true);
  };

  f.hit = function (id) {
    if (!s) return undefined;
    switch (id) {
      case 'back':
        return c.back();
      case 'round:left':
        return nudge(-1);
      case 'round:right':
        return nudge(1);
      case 'round:primary':
        if (s.status === 'hostWaiting') return revealByHost();
        return submit();
      case 'round:late':
        return late();
      case 'round:view':
        return viewAnswer();
      case 'round:refresh':
        return load(false, true);
      case 'round:retry':
        return load(false);
      case 'round:names':
        return renderNames(true);
      case 'round:settings':
        return privacy.openSetting().then(() => renderNames(false));
      case 'round:share': {
        const ctx = f.shareContext();
        if (!ctx) return undefined;
        if (ctx.kind === 'round') c.share.shareRound(ctx);
        else c.share.shareReveal(ctx);
        return undefined;
      }
      case 'round:host':
        return c.flows.host.open();
      case 'round:home':
        return c.goHome();
      case 'round:daily':
        c.goHome();
        return c.flows.home.hit('home:daily');
      case 'round:subscribe':
        return subscribe();
    }
    return undefined;
  };

  f.animating = () => !!s && (s.status === 'loading' || s.phase === 'submitting' || s.phase === 'revealing');

  f.vm = function () {
    if (!s) return V.roundVm({ status: 'loading' }, c.display(), c.featuresVm());
    const d = s.data || {};
    const late = !!(d.myGuess && d.myGuess.late);
    let markers;
    let reveal = s.status === 'revealed' ? s.reveal : null; // nothing shows before 先猜再看 / 直接看答案
    if (reveal) markers = reveal.markers;
    const phase = s.status === 'open' || s.lateMode ? (s.needle === null && s.phase !== 'submitting' ? 'empty' : s.phase) : s.phase;
    return V.roundVm(
      {
        status: s.status,
        isHost: d.isHost,
        left: d.left,
        right: d.right,
        clueText: d.clueText,
        guessCount: d.guessCount || 0,
        myGuess: d.myGuess ? d.myGuess.pos : null,
        late,
        canReveal: s.status === 'hostWaiting' && (d.guessCount || 0) >= c.config.rounds.revealMinGuesses,
        reveal: reveal ? Object.assign({}, reveal, { markers }) : null,
        needle: s.needle,
        phase,
        subscribe: { state: subscribeState() },
        lateMode: s.lateMode,
        namesNote: s.status === 'revealed' ? s.namesState : null,
        expiredForGuess: !!d.expired,
        hostBand: d.isHost && typeof d.target === 'number' ? { from: Math.max(0, d.target - c.config.rounds.targetBand), to: Math.min(100, d.target + c.config.rounds.targetBand) } : null,
        errorText: s.status === 'offline' ? '题目需联网展开' : s.status === 'notFound' ? '找不到这道题' : null,
        sharedCanvas: c.odc.sharedCanvas(),
      },
      c.display(),
      c.featuresVm()
    );
  };

  return f;
};
