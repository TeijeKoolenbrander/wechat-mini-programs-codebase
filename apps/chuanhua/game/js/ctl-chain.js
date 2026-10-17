/**
 * 慢慢传 (the async chain, spec 3, 8.6, 8.7): the start flow, the chain entry (a card, 我的接龙 or 本群接龙), the claim, 已传出 and the
 * early reveal. The SERVER decides everything that counts (claims, allowances, moderation, participation); this file shows what it
 * returns. The draw / describe screens are the shared turn (js/ctl-turn.js); the reveal is js/ctl-reveal.js.
 */

const { CONFIG } = require('../core/config');
const V = require('./vm');

const POLL_MS = 15000;
const POLL_MAX_MS = 10 * 60e3;

module.exports = function install(X) {
  const { c, S, store, api, ads, share, subscribe } = X;
  const chain = {};

  c.entry = null;
  c.sent = null;

  // ------------------------------------------------------------------------------------------------------------ start

  /** 慢慢传: the pick screen, or the 公约, or the used-up sheet. `source` = 'slow' | 'home' */
  chain.startFlow = function startFlow(source) {
    if (c.home.state !== 'ready') return X.toast(X.codeText('NETWORK'));
    if (c.me.restriction) return X.toast(X.codeText('RESTRICTED'));
    if (!c.features.ugc.createEnabled) return X.toast(X.codeText('UGC_PAUSED'));
    if (!X.rulesAgreed()) return X.openRules('start');
    if (c.me.startsLeft <= 0) return chain.showLimit();
    return X.pick.openChain(source || 'home');
  };

  /** "今天的 3 条已开完" sheet over home (8.1) */
  chain.showLimit = function showLimit() {
    if (c.screen !== 'home') X.goHome();
    c.home.sheet = 'startLimit';
    c.ui.sheetScroll = 0;
    X.invalidate();
  };

  // ------------------------------------------------------------------------------------------------------------ entry

  chain.openEntry = function openEntry(chainId, o) {
    o = o || {};
    c.entry = { chainId, state: 'loading', resp: null, claiming: false, limitCode: null, sub: { state: 'idle' }, fromCard: o.fromCard || null };
    X.go('entry', o.from || 'home');
    return loadEntry();
  };

  async function loadEntry() {
    const e = c.entry;
    if (!e) return undefined;
    const chainId = e.chainId;
    e.state = 'loading';
    X.invalidate();
    const r = await api.getChain(Object.assign({ chainId }, X.groupData()));
    if (c.entry !== e) return undefined;
    if (r && r.ok) {
      X.noteServerTime(r);
      e.resp = r;
      e.state = r.state;
      if (c.features.updatableCard && r.isParticipant && r.nextStep) prefetchActivity(chainId);
    } else {
      e.resp = null;
      e.state = r && r.code === 'CHAIN_NOT_FOUND' ? 'notFound' : X.isNet(r) ? 'offline' : 'error';
      if (e.state === 'error') X.track('error', { where: 'getChain', code: r ? r.code : 'none' });
    }
    if (e.fromCard) {
      X.track('card_open', { cardKind: e.fromCard === 'invite' ? 'invite' : 'reveal', hasShareTicket: c.group.status === 'ok', chainState: e.state });
      e.fromCard = null;
    }
    X.invalidate();
    return undefined;
  }
  chain.loadEntry = loadEntry;

  function entrySubscribeState(e) {
    const r = e.resp;
    if (!r || !r.isParticipant) return 'hidden';
    if (!['pending', 'taken', 'prevMine', 'capReached'].includes(e.state)) return 'hidden'; // "pending/claimed chain where they are a participant" (10.3)
    return subscribeStateOf(e.sub, e.chainId);
  }

  function subscribeStateOf(holder, chainId) {
    if (holder && (holder.state === 'requesting' || holder.state === 'unavailable')) return holder.state;
    return subscribe.stateFor(c.features, chainId);
  }

  function subscribeTap(holder, chainId) {
    if (!chainId || subscribe.stateFor(c.features, chainId) !== 'offer' || holder.state === 'requesting') return undefined;
    holder.state = 'requesting';
    X.invalidate();
    // wx.requestSubscribeMessage is called right here, inside the tap handler
    return subscribe.request(c.features, chainId).then((out) => {
      holder.state = out === 'granted' ? 'granted' : out === 'declined' ? 'declined' : 'unavailable';
      if (out === 'unavailable') X.toast('提醒未开启');
      else if (out === 'granted') X.toast('揭晓时会提醒你');
      X.invalidate();
    });
  }

  chain.claim = async function claim() {
    const e = c.entry;
    if (!e || e.claiming) return undefined;
    if (c.home.state === 'ready' && !X.rulesAgreed()) return X.openRules('claim'); // before home has loaded the server decides (RULES_REQUIRED below)
    e.claiming = true;
    X.invalidate();
    const r = await api.claimStep(Object.assign({ chainId: e.chainId }, X.groupData()));
    e.claiming = false;
    if (c.entry !== e) return undefined;
    if (r && r.ok) {
      X.track('claim_attempt', { chainId: e.chainId, step: r.step, result: 'ok' });
      return beginClaimed(e.chainId, r);
    }
    const code = r ? r.code : 'NETWORK';
    const RESULT = { TAKEN: 'taken', PENDING: 'pending', PREV_MINE: 'prevMine', CAP_REACHED: 'cap', WRONG_GROUP: 'wrongGroup', NEED_GROUP: 'needGroup', RESTRICTED: 'restricted', CHAIN_CLOSED: 'closed', IN_ROOM: 'inRoom' };
    X.track('claim_attempt', { chainId: e.chainId, step: e.resp ? e.resp.nextStep : undefined, result: RESULT[code] || 'error', inRoom: code === 'IN_ROOM' });
    if (code === 'RULES_REQUIRED') {
      c.me.rulesVersion = 0;
      X.invalidate();
      return X.openRules('claim');
    }
    if (code === 'STEP_LIMIT' || code === 'CLAIM_LIMIT') {
      e.state = 'dailyLimit';
      e.limitCode = code;
      return X.invalidate();
    }
    if (code === 'IN_ROOM') {
      e.state = 'inRoom';
      return X.invalidate();
    }
    if (code === 'TAKEN') X.toast(X.codeText('TAKEN')); // 被群友抢先一步, then the "claimed by someone else" state
    else if (X.isNet(r)) X.toast(X.codeText(r && r.code === 'RATE_LIMITED' ? 'RATE_LIMITED' : 'NETWORK'));
    else if (code !== 'PENDING' && code !== 'PREV_MINE' && code !== 'CAP_REACHED') X.toast(X.codeText(code));
    if (X.isNet(r)) return X.invalidate();
    return loadEntry();
  };

  /** a claim is ours: the draw / describe screen. r = a claimStep answer */
  function beginClaimed(chainId, r) {
    X.noteServerTime(r);
    return X.turn.begin({
      mode: 'chain', kind: r.kind, chainId, claimId: r.claimId, step: r.step, source: r.prev, deadline: r.expiresAt - CONFIG.chain.claimTtlMs + r.timerSec * 1000,
    });
  }

  chain.entryHit = function entryHit(id) {
    const e = c.entry;
    if (!e) return undefined;
    switch (id) {
      case 'entry:claim':
        return chain.claim();
      case 'entry:group':
        return X.openGroup('entry');
      case 'entry:newRoom':
        return X.startRoomFlow();
      case 'entry:room':
        if (c.me.activeRoom) return X.room.resume(c.me.activeRoom.roomId, 'home');
        return X.refreshHome().then(() => (c.me.activeRoom ? X.room.resume(c.me.activeRoom.roomId, 'home') : X.toast(X.codeText('ROOM_NOT_FOUND'))));
      case 'entry:refresh':
      case 'entry:retry':
        return loadEntry();
      case 'entry:reveal':
        X.dialog({ text: '现在揭晓？之后就不能再接了', confirmLabel: '现在揭晓', cancelLabel: '再等等', onConfirm: revealNow });
        return undefined;
      case 'entry:viewReveal':
        return X.reveal.openChain(e.chainId, { from: 'entry' });
      case 'entry:mine':
        return X.openMine(e.chainId, 'entry');
      case 'entry:subscribe':
        return subscribeTap(e.sub, e.chainId);
      case 'entry:share':
        return shareInvite({ chainId: e.chainId, passed: e.resp ? e.resp.passed : 0, nextStep: e.resp ? e.resp.nextStep : null, nextKind: e.resp ? e.resp.nextKind : null, chainState: e.state });
      case 'entry:home':
        return X.goHome();
      default:
        return undefined;
    }
  };

  async function revealNow() {
    const e = c.entry;
    if (!e) return undefined;
    const r = await api.revealNow({ chainId: e.chainId });
    if (r && r.ok) return X.reveal.openChain(e.chainId, { from: 'home' });
    const code = r ? r.code : 'NETWORK';
    X.toast(code === 'TOO_EARLY' && r.busy ? '有群友正在接，稍后再揭晓' : X.codeText(code));
    return loadEntry();
  }

  chain.entryVm = function entryVm(t) {
    const e = c.entry;
    return V.entryVm({ state: e.state, resp: e.resp, claiming: e.claiming, subscribe: entrySubscribeState(e), limitCode: e.limitCode, errorText: null }, X.cm(t));
  };

  // ------------------------------------------------------------------------------------------------------ after a send

  /** a 慢慢传 send went through (r = a submitStep answer; p = what was sent) */
  chain.afterSubmit = function afterSubmit(t, r, p) {
    X.noteServerTime(r);
    X.track('step_result', { mode: 'chain', chainId: t.chainId, step: t.step, kind: t.kind, result: r.state === 'marker' ? 'marker' : r.state === 'pending' ? 'pending' : 'passed' });
    c.home.fetchedAt = 0; // a passed 棒 changes the allowances: refresh them at the next home visit
    if (r.revealed) return X.reveal.openChain(t.chainId, { from: 'home' });
    const marker = r.state === 'marker' ? r.marker || (t.kind === 'draw' ? 'emptyDraw' : 'emptyText') : null;
    openSent(t, marker ? { marker } : X.turn.contentOf(t, p), r.state === 'marker' ? 'marker' : r.state === 'passed' ? 'passed' : 'pending');
    if (c.features.updatableCard) prefetchActivity(t.chainId);
    return undefined;
  };

  /** a forced send that did not pass: the 棒 reopened (5.8): 已传出 says so */
  chain.afterBlocked = function afterBlocked(t, p, code) {
    X.track('step_result', { mode: 'chain', chainId: t.chainId, step: t.step, kind: t.kind, result: code === 'MODERATION_BUSY' ? 'busy' : 'blocked' });
    openSent(t, X.turn.contentOf(t, p), 'blocked');
  };

  function openSent(t, mine, modState) {
    c.sent = {
      chainId: t.chainId, step: t.step, kind: t.kind, mine, modState, revealed: false, sub: { state: 'idle' }, pollAt: X.now() + POLL_MS, pollUntil: X.now() + POLL_MAX_MS, explained: !S.explainerSeen,
    };
    if (!S.explainerSeen) {
      S.explainerSeen = true;
      store.save();
    }
    X.go('sent');
  }

  chain.turnLost = function turnLost(t, code) {
    // the claim went to someone else (or the chain closed): the work is discarded (3.5)
    X.track('step_release', { chainId: t.chainId, step: t.step, reason: 'claimLost' });
    X.toast(X.codeText(code === 'CLAIM_LOST' ? 'CLAIM_LOST' : 'CHAIN_CLOSED'));
    return chain.afterTurnLeft(t);
  };

  /** leave the turn screen after it ended without a send (confirmed quit, claim lost, reported previous 棒) */
  chain.afterTurnLeft = function afterTurnLeft(t) {
    if (c.pendingEntry) return X.goHome();
    if (!t || t.step === 1) return X.goHome(); // 棒 1 released = chain abandoned: nothing to show
    c.entry = { chainId: t.chainId, state: 'loading', resp: null, claiming: false, limitCode: null, sub: { state: 'idle' } };
    X.go('entry');
    return loadEntry();
  };

  function sentPassedCount(s) {
    return s.modState === 'passed' || s.modState === 'marker' ? s.step : s.step - 1;
  }

  chain.sentVm = function sentVm(t) {
    const s = c.sent;
    return V.sentVm(
      {
        chainId: s.chainId, step: s.step, kind: s.kind, mine: s.mine, modState: s.modState, subscribe: s.modState === 'blocked' || s.modState === 'void' ? 'hidden' : subscribeStateOf(s.sub, s.chainId),
        firstTimeExplainer: s.explained, revealed: s.revealed, updatableCard: c.features.updatableCard, scrollY: 0,
      },
      X.cm(t)
    );
  };

  async function pollSent() {
    const s = c.sent;
    if (!s || s.modState !== 'pending') return;
    s.pollAt = X.now() + POLL_MS;
    const r = await api.getMyChains({ chainId: s.chainId });
    if (c.sent !== s || !r || !r.ok) return;
    const rows = (r.mine || []).filter((m) => m.n === s.step);
    const row = rows[rows.length - 1];
    if (row && row.modState !== 'pending') s.modState = ['passed', 'blocked', 'void'].includes(row.modState) ? row.modState : s.modState;
    s.revealed = !!(r.item && r.item.status === 'revealed');
    X.invalidate();
  }
  chain.pollSent = pollSent;

  chain.sentHit = function sentHit(id) {
    const s = c.sent;
    if (!s) return undefined;
    switch (id) {
      case 'sent:home':
        return X.goHome();
      case 'sent:share':
        return shareInvite({ chainId: s.chainId, passed: sentPassedCount(s), nextStep: s.step + 1, nextKind: s.kind === 'draw' ? 'describe' : 'draw', chainState: s.modState });
      case 'sent:subscribe':
        return subscribeTap(s.sub, s.chainId);
      case 'sent:group':
        return X.openGroup('sent');
      case 'sent:again':
        return chain.startFlow('home');
      case 'sent:reveal':
        return X.reveal.openChain(s.chainId, { from: 'home' });
      default:
        return undefined;
    }
  };

  // ---------------------------------------------------------------------------------------------- share (explicit taps)

  /** the activity id for the updatable invite card (9.5); prefetched so the share tap has little to wait for */
  async function prefetchActivity(chainId) {
    const have = c.activity[chainId];
    if (!c.features.updatableCard || (have && X.now() - have.at < 23 * 3600e3) || (have && have.pending)) return;
    c.activity[chainId] = { id: null, at: X.now(), pending: true };
    const r = await api.getChain(Object.assign({ chainId, wantActivity: true }, X.groupData()));
    c.activity[chainId] = { id: r && r.ok && r.activityId ? r.activityId : null, at: X.now(), pending: false };
  }

  function shareInvite(ctx) {
    if (!ctx.chainId || !ctx.nextStep) return undefined;
    const a = c.activity[ctx.chainId];
    return share.shareInvite(Object.assign({}, ctx, { activityId: c.features.updatableCard && a && a.id ? a.id : null }));
  }

  chain.shareContext = function shareContext() {
    if (c.screen === 'sent' && c.sent) {
      const s = c.sent;
      return { kind: 'invite', chainId: s.chainId, passed: sentPassedCount(s), nextStep: s.step + 1, nextKind: s.kind === 'draw' ? 'describe' : 'draw', chainState: s.modState };
    }
    if (c.screen === 'entry' && c.entry && c.entry.resp && c.entry.resp.nextStep && c.entry.resp.state !== 'removed') {
      const r = c.entry.resp;
      return { kind: 'invite', chainId: c.entry.chainId, passed: r.passed, nextStep: r.nextStep, nextKind: r.nextKind, chainState: c.entry.state };
    }
    return null;
  };

  // ------------------------------------------------------------------------------------------------- unsent turn after a kill

  /** an unsent chain turn survived a kill (17.21): take the claim back (same claimId) or carry the work to a fresh claim */
  chain.resumeTurn = async function resumeTurn() {
    const sv = S.turn;
    if (!sv || sv.mode !== 'chain') return undefined;
    const r = await api.claimStep(Object.assign({ chainId: sv.chainId }, X.groupData()));
    if (r && r.ok && r.step === sv.step) return beginClaimed(sv.chainId, r);
    if (X.isNet(r)) return undefined; // keep the saved work; try again at the next onShow
    S.turn = null;
    store.save();
    X.toast(X.codeText(r && r.code === 'TAKEN' ? 'CLAIM_LOST' : r ? r.code : 'INTERNAL'));
    if (c.pendingEntry) {
      const e = c.pendingEntry;
      c.pendingEntry = null;
      return X.routeEntry(e);
    }
    return undefined;
  };

  chain.tick = function tick(t) {
    if (c.screen === 'sent' && c.sent && c.sent.modState === 'pending' && t >= c.sent.pollAt && t < c.sent.pollUntil) X.safe(pollSent)();
  };

  void ads;
  return chain;
};
