/**
 * The reveal (spec 8.8-8.10, F-5, PO-45): overview (a live room), step-through (a live chain or a 慢慢传 chain) and the teasers.
 *
 * OVERVIEW: one card per chain showing ONLY its final step (no prompt, no intermediate step, AC 156). `getRoomReveal` gives the finals as text /
 * marker / placeholder and says which are drawings; the drawings arrive per chain through `getReveal`, in order (a skeleton until then), and the
 * answers are kept for the step-through.
 * STEP-THROUGH: opens on the FINAL step and goes back toward the 起点 (往前一棒, a swipe right, the left half of the note); 往后一棒 comes back.
 * A drawing replays in 2.5 s the first time it is shown and on 重播; a tap during the replay completes it. At the 起点: 下一条 › or 看完了.
 * Navigation is never automatic (AC 157-159).
 * REMATCH: 再来一局 -> `rematch` returns the ONE new room for everyone who presses it (AC 151).
 */

const strokesLib = require('../core/strokes');
const { CONFIG } = require('../core/config');
const V = require('./vm');

module.exports = function install(X) {
  const { c, api, S, store, ads } = X;
  const reveal = {};

  c.overview = null;
  c.step = null;
  c.teaser = null;
  c.revealCache = {}; // chainId -> getReveal answer (kept while a reveal is open)

  const lifetime = () => S.lifetimeReveals || 0;

  /** a reveal counts once toward the interstitial gate (11): by room id or chain id */
  function countOnce(id) {
    if (S.revealsSeen[id]) return;
    S.revealsSeen[id] = true;
    S.lifetimeReveals = lifetime() + 1;
    store.save();
  }

  // ---------------------------------------------------------------------------------------------------------------- overview

  reveal.openOverview = async function openOverview(roomId, o) {
    o = o || {};
    c.revealCache = {};
    c.overview = { roomId, state: 'loading', resp: null, cards: [], loaded: {}, scrollY: 0, rematchRoomId: null, startedAt: X.now(), chainsOpened: {}, stepsViewed: 0, seq: 0, from: o.from || 'home' };
    X.go('overview', o.from || 'home');
    return loadOverview();
  };

  async function loadOverview() {
    const ov = c.overview;
    if (!ov) return undefined;
    ov.state = 'loading';
    X.invalidate();
    const r = await api.getRoomReveal({ roomId: ov.roomId });
    if (c.overview !== ov) return undefined;
    if (r && r.ok) {
      X.noteServerTime(r);
      ov.resp = r;
      ov.cards = r.cards;
      ov.rematchRoomId = r.rematchRoomId || ov.rematchRoomId;
      const paused = r.cards.length > 0 && r.cards.every((x) => x.placeholder === 'paused');
      ov.state = paused ? 'paused' : 'ready';
      countOnce(ov.roomId);
      X.track('reveal_open', { mode: 'live', role: 'member', chains: r.cards.length });
      c.home.fetchedAt = 0;
      X.invalidate();
      return loadFinals(ov);
    }
    const code = r ? r.code : 'NETWORK';
    if (code === 'NOT_MEMBER' && r.teaser) {
      c.overview = null;
      c.teaser = { kind: 'room', id: ov.roomId, state: 'ready', teaser: r.teaser, scrollY: 0 };
      X.track('reveal_open', { mode: 'live', role: 'teaser', chains: r.teaser.n || 0 });
      return X.go('teaser', c.from.overview || 'home');
    }
    if (code === 'BAD_REQUEST') {
      // not over yet: the room screen decides
      c.overview = null;
      return X.room.open(ov.roomId, { from: 'home', quiet: true });
    }
    if (code === 'ROOM_CLOSED' || code === 'ROOM_NOT_FOUND') {
      c.overview = null;
      c.teaser = { kind: 'room', id: ov.roomId, state: code === 'ROOM_NOT_FOUND' ? 'notFound' : 'removed', teaser: null, scrollY: 0 };
      return X.go('teaser', c.from.overview || 'home');
    }
    ov.state = X.isNet(r) ? 'offline' : 'error';
    if (ov.state === 'error') X.track('error', { where: 'getRoomReveal', code });
    return X.invalidate();
  }

  /** the final drawings, one chain after the other (in order); a failure leaves that card a skeleton and the tap retries */
  async function loadFinals(ov) {
    const seq = ++ov.seq;
    for (const card of ov.cards) {
      if (c.overview !== ov || ov.seq !== seq) return;
      if (card.finalKind !== 'draw' || card.placeholder || ov.loaded[card.chainId]) continue;
      const got = await fetchChain(card.chainId);
      if (c.overview !== ov || ov.seq !== seq) return;
      if (got && got.ok) {
        const last = got.steps.length ? got.steps[got.steps.length - 1] : null;
        ov.loaded[card.chainId] = last && last.strokes && !last.placeholder ? { strokes: last.strokes } : { placeholder: (last && last.placeholder) || 'reported' };
        X.invalidate();
      } else if (got && got.code === 'NOT_PARTICIPANT') ov.loaded[card.chainId] = { placeholder: 'paused' };
    }
  }

  /** getReveal with the cache */
  async function fetchChain(chainId) {
    if (c.revealCache[chainId]) return c.revealCache[chainId];
    const r = await api.getReveal({ chainId });
    if (r && r.ok) c.revealCache[chainId] = r;
    return r;
  }

  reveal.onRoomUpdate = function onRoomUpdate(resp) {
    const ov = c.overview;
    if (!ov || ov.roomId !== resp.roomId) return;
    if (resp.rematchRoomId && ov.rematchRoomId !== resp.rematchRoomId) {
      ov.rematchRoomId = resp.rematchRoomId;
      X.invalidate();
    }
  };

  reveal.overviewVm = function overviewVm(t) {
    const ov = c.overview;
    return V.overviewVm(
      {
        state: ov.state, roomId: ov.roomId, n: ov.resp ? ov.resp.n : 0, rounds: ov.resp ? ov.resp.rounds : 0,
        cards: ov.cards.map((card) => ({ card, loaded: ov.loaded[card.chainId] || null, unseen: !S.revealsSeen[card.chainId] && !ov.chainsOpened[card.chainId] })),
        rematchBanner: !!ov.rematchRoomId && !ov.rematching, rematchRoomId: ov.rematchRoomId || undefined, canShare: ov.state === 'ready', interstitialDue: ads.interstitialDue({ lifetimeReveals: lifetime() }),
        scrollY: ov.scrollY,
      },
      X.cm(t)
    );
  };

  reveal.overviewHit = function overviewHit(id) {
    const ov = c.overview;
    if (!ov) return undefined;
    if (id === 'overview:back') return leave();
    if (id === 'overview:retry') return loadOverview();
    if (ov.state !== 'ready' && ov.state !== 'paused') return undefined;
    if (id.indexOf('overview:chain:') === 0) {
      const chainId = id.slice('overview:chain:'.length);
      const card = ov.cards.find((x) => x.chainId === chainId);
      return card ? openLiveChain(card, 'overview') : undefined;
    }
    if (id === 'overview:rematch' || id === 'overview:joinNew') return rematch(id === 'overview:joinNew');
    if (id === 'overview:share') return shareRoom();
    return undefined;
  };

  async function rematch(joining) {
    const ov = c.overview;
    if (!ov || ov.rematching) return undefined;
    ov.rematching = true;
    const r = await api.rematch({ roomId: ov.roomId });
    if (c.overview !== ov) return undefined;
    ov.rematching = false;
    if (r && r.ok) {
      X.noteServerTime(r);
      const created = !!r.created;
      X.track('rematch', { role: created ? 'host' : 'member', result: created ? 'created' : 'joined' });
      c.overview = null;
      c.revealCache = {};
      c.step = null;
      X.room.enter(r, { from: 'home' });
      return r;
    }
    const code = r ? r.code : 'NETWORK';
    X.track('rematch', { role: joining ? 'member' : 'host', result: 'error' });
    if (code === 'RULES_REQUIRED') {
      c.me.rulesVersion = 0;
      return X.openRules('createRoom');
    }
    if (code === 'IN_OTHER_ROOM' && r.otherRoomId) {
      X.toast(X.codeText(code));
      return X.room.open(r.otherRoomId, { from: 'home' });
    }
    X.toast(X.codeText(X.isNet(r) ? 'NETWORK' : code));
    X.track('error', { where: 'rematch', code });
    return X.invalidate();
  }

  /**
   * 分享揭晓卡 of a room (QA-R2-6, AC 95). A share leaves our control (chat history), so the title may only hold text that is
   * passed RIGHT NOW: the overview cards are refetched and the chain read fresh (no cache) before any text is picked, and the
   * sentence is only used when the fresh chain still shows it as the visible final sentence. Any doubt (a failed fetch, a hidden
   * step, a hidden prompt) gives the text-free title.
   */
  async function shareRoom() {
    const ov = c.overview;
    if (!ov) return undefined;
    let promptText;
    let finalText;
    let chainCount = ov.resp ? ov.resp.n : ov.cards.length;
    const fresh = await api.getRoomReveal({ roomId: ov.roomId });
    if (c.overview === ov && fresh && fresh.ok) {
      ov.resp = fresh;
      ov.cards = fresh.cards;
      chainCount = fresh.n;
      X.invalidate();
      const card = fresh.cards.find((x) => x.finalKind === 'describe' && !x.placeholder && !x.finalMarker && x.finalText);
      if (card) {
        delete c.revealCache[card.chainId];
        const got = await fetchChain(card.chainId);
        if (c.overview === ov && got && got.ok && got.prompt && got.prompt.text) {
          const last = V.finalSentence(got.steps.filter((s) => !s.marker));
          if (last && last === card.finalText) {
            promptText = got.prompt.text;
            finalText = last;
          }
        }
      }
    }
    return X.share.shareRoomReveal({ roomId: ov.roomId, chainCount, promptText, finalText });
  }

  /** leaving a reveal: the interstitial rule (never blocks), then where it was opened from */
  function leave() {
    const due = ads.interstitialDue({ lifetimeReveals: lifetime() });
    const ov = c.overview;
    const st = c.step;
    if (ov) X.track('reveal_done', { mode: 'live', chainsOpened: Object.keys(ov.chainsOpened).length, stepsViewed: ov.stepsViewed, durationSec: Math.max(0, Math.round((X.now() - ov.startedAt) / 1000)) });
    else if (st) X.track('reveal_done', { mode: st.mode, chainsOpened: 1, stepsViewed: st.viewed, durationSec: Math.max(0, Math.round((X.now() - st.startedAt) / 1000)) });
    const from = (ov && ov.from) || (st && st.from) || 'home';
    c.overview = null;
    c.step = null;
    c.revealCache = {};
    X.room.stop();
    X.navTo(from);
    if (due) ads.interstitial({ lifetimeReveals: lifetime() }); // never blocks the navigation
    return undefined;
  }

  // ------------------------------------------------------------------------------------------------------------ step-through

  function openLiveChain(card, from) {
    const ov = c.overview;
    ov.chainsOpened[card.chainId] = true;
    S.revealsSeen[card.chainId] = true;
    store.save();
    return openStep({ mode: 'live', roomId: ov.roomId, chainId: card.chainId, chainNo: card.chainNo, chainCount: ov.resp.n, mineStarted: card.mineStarted, from });
  }

  /** a 慢慢传 reveal (also from a subscribe notice or a card) */
  reveal.openChain = function openChain(chainId, o) {
    o = o || {};
    c.revealCache = {};
    return openStep({ mode: 'chain', chainId, from: o.from || 'home' });
  };

  function openStep(o) {
    c.step = {
      mode: o.mode, roomId: o.roomId, chainId: o.chainId, chainNo: o.chainNo, chainCount: o.chainCount, mineStarted: !!o.mineStarted, state: 'loading', resp: null, steps: [],
      index: 0, replay: null, seen: {}, from: o.from || 'home', viewed: 0, startedAt: X.now(), scrollY: 0,
    };
    X.go('stepthrough', o.from || 'home');
    return loadStep();
  }

  async function loadStep(quiet) {
    const st = c.step;
    if (!st) return undefined;
    if (!quiet || !st.resp) {
      st.state = 'loading';
      X.invalidate();
    }
    if (quiet) delete c.revealCache[st.chainId];
    const r = await fetchChain(st.chainId);
    if (c.step !== st) return undefined;
    if (r && r.ok) {
      X.noteServerTime(r);
      const keep = quiet && st.resp ? st.index : -1;
      st.resp = r;
      st.steps = V.stepsOf(r);
      st.state = 'ready';
      if (st.mode === 'live') {
        st.chainNo = st.chainNo || r.chainNo;
        st.chainCount = st.chainCount || r.chainCount;
        if (r.mineStarted !== undefined) st.mineStarted = !!r.mineStarted;
      } else {
        countOnce(st.chainId);
        X.track('reveal_open', { mode: 'chain', role: 'member', chains: 1 });
        c.home.fetchedAt = 0;
        if (c.features.updatableCard) c.activity[st.chainId] = undefined;
        X.syncShareMenu();
      }
      st.index = keep >= 0 ? Math.min(keep, st.steps.length - 1) : st.steps.length - 1;
      if (keep < 0) shown(st);
      return X.invalidate();
    }
    const code = r ? r.code : 'NETWORK';
    if (code === 'NOT_PARTICIPANT' && r.teaser) {
      c.step = null;
      c.teaser = { kind: 'chain', id: st.chainId, state: 'ready', teaser: r.teaser, scrollY: 0 };
      X.track('reveal_open', { mode: st.mode, role: 'teaser', chains: 1 });
      return X.go('teaser', st.from || 'home');
    }
    if (code === 'CHAIN_NOT_FOUND') {
      c.step = null;
      c.teaser = { kind: 'chain', id: st.chainId, state: 'notFound', teaser: null, scrollY: 0 };
      return X.go('teaser', st.from || 'home');
    }
    if (code === 'CHAIN_CLOSED') {
      if (r.state === 'removed') {
        c.step = null;
        c.teaser = { kind: 'chain', id: st.chainId, state: 'removed', teaser: null, scrollY: 0 };
        return X.go('teaser', st.from || 'home');
      }
      c.step = null; // not revealed (yet): the chain entry says what is going on
      return X.chain.openEntry(st.chainId, { from: st.from || 'home' });
    }
    st.state = X.isNet(r) ? 'offline' : 'error';
    if (st.state === 'error') X.track('error', { where: 'getReveal', code });
    return X.invalidate();
  }

  /** the step at `index` is on screen: a drawing replays the first time it is shown (AC 159) */
  function shown(st) {
    const s = st.steps[st.index];
    st.viewed++;
    if (st.mode === 'live' && c.overview) c.overview.stepsViewed++;
    if (s && s.kind === 'draw' && !s.placeholder && !st.seen[st.index]) st.replay = { start: X.now() };
    else st.replay = null;
    st.seen[st.index] = true;
  }

  function goIndex(i, via) {
    const st = c.step;
    if (!st || st.state !== 'ready') return undefined;
    const to = Math.max(0, Math.min(st.steps.length - 1, i));
    if (to === st.index) return undefined;
    st.index = to;
    X.track('reveal_step', { mode: st.mode, chainNo: st.chainNo >= 1 && st.chainNo <= 10 ? st.chainNo : undefined, index: to, of: st.steps.length, via });
    shown(st);
    return X.invalidate();
  }

  const playT = (st, t) => {
    if (!st.replay) return 1;
    const p = (t - st.replay.start) / strokesLib.REPLAY_MS;
    return p >= 1 ? 1 : p < 0 ? 0 : p;
  };

  reveal.stepVm = function stepVm(t) {
    const st = c.step;
    const ov = c.overview;
    const order = ov ? ov.cards.map((x) => x.chainId) : [];
    const pos = order.indexOf(st.chainId);
    return V.stepthroughVm(
      {
        state: st.state, mode: st.mode, roomId: st.roomId, chainId: st.chainId, chainNo: st.chainNo, chainCount: st.chainCount, mineStarted: st.mineStarted, resp: st.resp, steps: st.steps,
        index: st.index, playT: playT(st, t), nextChain: st.mode === 'live' && pos >= 0 && pos < order.length - 1, canShare: st.mode === 'chain' && st.state === 'ready',
        interstitialDue: st.mode === 'chain' ? ads.interstitialDue({ lifetimeReveals: lifetime() }) : false,
      },
      X.cm(t)
    );
  };

  reveal.stepHit = function stepHit(id) {
    const st = c.step;
    if (!st) return undefined;
    if (id === 'stepthrough:back') return st.mode === 'live' && c.overview ? backToOverview() : leave();
    if (id === 'stepthrough:retry') return loadStep();
    if (st.state !== 'ready') return undefined;
    const s = st.steps[st.index];
    switch (id) {
      case 'stepthrough:share':
        return st.mode === 'chain' ? X.share.shareReveal(chainShareCtx(st)) : undefined;
      case 'stepthrough:skip':
        st.replay = null;
        return X.invalidate();
      case 'stepthrough:replay':
        if (s && s.kind === 'draw') {
          st.replay = { start: X.now() };
          X.invalidate();
        }
        return undefined;
      case 'stepthrough:prevHalf':
        return goIndex(st.index - 1, 'tap');
      case 'stepthrough:nextHalf':
        return goIndex(st.index + 1, 'tap');
      case 'stepthrough:prev':
        return goIndex(st.index - 1, 'button');
      case 'stepthrough:next':
        return goIndex(st.index + 1, 'button');
      case 'stepthrough:nextChain':
        return nextChain();
      case 'stepthrough:done':
        return st.mode === 'live' && c.overview ? backToOverview() : leave();
      case 'stepthrough:laugh':
        return s && s.canLaugh ? laugh(st, s) : undefined;
      case 'stepthrough:report':
        return s && s.canReport ? X.openReport({ chainId: st.chainId, step: s.n, roomId: st.roomId }) : undefined;
      default:
        if (id.indexOf('stepthrough:dot:') === 0) return goIndex(parseInt(id.slice('stepthrough:dot:'.length), 10), 'dot');
        return undefined;
    }
  };

  /** a horizontal swipe on the note (app.js tracks the touch): right = earlier, left = later */
  reveal.onSwipe = function onSwipe(dir) {
    const st = c.step;
    if (!st || c.screen !== 'stepthrough' || st.state !== 'ready') return;
    goIndex(st.index + (dir === 'prev' ? -1 : 1), 'swipe');
  };

  function backToOverview() {
    c.step = null;
    X.go('overview', c.overview.from);
    return X.invalidate();
  }

  function nextChain() {
    const st = c.step;
    const ov = c.overview;
    if (!st || !ov) return undefined;
    const i = ov.cards.findIndex((x) => x.chainId === st.chainId);
    const next = ov.cards[i + 1];
    if (!next) return backToOverview();
    return openLiveChain(next, c.step.from);
  }

  async function laugh(st, s) {
    const was = !!s.myLaugh;
    s.myLaugh = !was; // optimistic; the server toggles and answers with the truth
    s.laughs = Math.max(0, (s.laughs || 0) + (was ? -1 : 1));
    X.invalidate();
    const r = await api.laugh({ chainId: st.chainId, step: s.n });
    if (c.step !== st) return;
    if (r && r.ok) {
      s.laughs = r.laughs;
      s.myLaugh = !!r.mine;
      const raw = c.revealCache[st.chainId] && c.revealCache[st.chainId].steps.find((x) => x.n === s.n);
      if (raw) {
        raw.laughs = r.laughs;
        raw.myLaugh = !!r.mine;
      }
      X.track('laugh', { chainId: st.chainId, step: s.n, on: !!r.mine });
    } else {
      s.myLaugh = was;
      s.laughs = Math.max(0, (s.laughs || 0) + (was ? 1 : -1));
      X.toast(X.codeText(r ? r.code : 'NETWORK'));
    }
    X.invalidate();
  }

  function chainShareCtx(st) {
    const resp = st.resp;
    const stepsRaw = resp.steps.map((s) => ({ n: s.n, kind: s.kind, placeholder: s.placeholder, text: s.text, marker: s.marker }));
    return { kind: 'reveal', chainId: resp.chainId, promptText: resp.prompt && resp.prompt.text, finalText: V.finalSentence(stepsRaw.filter((s) => !s.marker)), passed: resp.passed, participantCount: resp.participantCount };
  }
  reveal.shareContext = function shareContext() {
    if (c.screen === 'stepthrough' && c.step && c.step.mode === 'chain' && c.step.resp) return chainShareCtx(c.step);
    if (c.screen === 'overview' && c.overview && c.overview.resp) return { kind: 'roomReveal', roomId: c.overview.roomId, chainCount: c.overview.resp.n };
    if (c.screen === 'teaser' && c.teaser && c.teaser.kind === 'chain' && c.teaser.teaser && c.teaser.teaser.promptText) {
      const k = c.teaser.teaser;
      return { kind: 'reveal', chainId: c.teaser.id, promptText: k.promptText, finalText: k.finalText, passed: k.passed, participantCount: 0 };
    }
    return null;
  };

  /** after a report in the reveal: the hidden step is a placeholder now */
  reveal.afterReport = function afterReport() {
    if (c.screen === 'stepthrough' && c.step) return loadStep(true);
    if (c.screen === 'teaser' && c.teaser && c.teaser.kind === 'chain') {
      const k = c.teaser;
      return api.getReveal({ chainId: k.id }).then((rr) => {
        if (c.teaser !== k) return;
        if (rr && rr.code === 'NOT_PARTICIPANT' && rr.teaser) k.teaser = rr.teaser;
        else if (rr && rr.code === 'CHAIN_CLOSED') k.state = 'removed';
        X.invalidate();
      });
    }
    return undefined;
  };

  reveal.tick = function tick(t) {
    const st = c.step;
    if (st && st.replay && t - st.replay.start >= strokesLib.REPLAY_MS + 50) {
      st.replay = null;
      X.invalidate();
    }
  };
  reveal.animating = function animating() {
    if (c.screen === 'stepthrough' && c.step) return c.step.state === 'loading' || !!c.step.replay;
    if (c.screen === 'overview' && c.overview) return c.overview.state === 'loading' || c.overview.cards.some((x) => x.finalKind === 'draw' && !x.placeholder && !c.overview.loaded[x.chainId]);
    return false;
  };

  // ---------------------------------------------------------------------------------------------------------------- teaser

  reveal.openRoomTeaser = async function openRoomTeaser(roomId, o) {
    c.teaser = { kind: 'room', id: roomId, state: 'loading', teaser: null, scrollY: 0 };
    X.go('teaser', (o && o.from) || 'home');
    return loadTeaser();
  };

  async function loadTeaser() {
    const k = c.teaser;
    if (!k) return undefined;
    k.state = 'loading';
    X.invalidate();
    if (k.kind === 'room') {
      const r = await api.getRoomReveal({ roomId: k.id });
      if (c.teaser !== k) return undefined;
      if (r && r.code === 'NOT_MEMBER' && r.teaser) {
        k.teaser = r.teaser;
        k.state = 'ready';
        X.track('reveal_open', { mode: 'live', role: 'teaser', chains: r.teaser.n || 0 });
      } else if (r && r.ok) {
        c.teaser = null;
        return reveal.openOverview(k.id, { from: 'home' });
      } else k.state = r && r.code === 'ROOM_NOT_FOUND' ? 'notFound' : r && r.code === 'ROOM_CLOSED' ? 'removed' : X.isNet(r) ? 'offline' : 'error';
      return X.invalidate();
    }
    const r = await api.getReveal({ chainId: k.id });
    if (c.teaser !== k) return undefined;
    if (r && r.code === 'NOT_PARTICIPANT' && r.teaser) {
      k.teaser = r.teaser;
      k.state = 'ready';
    } else if (r && r.ok) {
      c.teaser = null;
      return reveal.openChain(k.id, { from: 'home' });
    } else k.state = r && r.code === 'CHAIN_NOT_FOUND' ? 'notFound' : r && r.code === 'CHAIN_CLOSED' ? 'removed' : X.isNet(r) ? 'offline' : 'error';
    return X.invalidate();
  }

  reveal.teaserVm = function teaserVm(t) {
    const k = c.teaser;
    return V.teaserVm({ state: k.state === 'error' ? 'offline' : k.state, kind: k.kind, teaser: k.teaser, scrollY: 0 }, X.cm(t));
  };

  reveal.teaserHit = function teaserHit(id) {
    const k = c.teaser;
    if (!k) return undefined;
    switch (id) {
      case 'teaser:home':
        return X.goHome();
      case 'teaser:newRoom':
        return X.startRoomFlow();
      case 'teaser:group':
        return X.openGroup('home');
      case 'teaser:retry':
        return loadTeaser();
      case 'teaser:report':
        if (k.kind === 'room') return X.toast('这一局的内容只有群友能看到，可以用右上角菜单里的投诉');
        return X.openReport({ chainId: k.id, step: 0 });
      default:
        return undefined;
    }
  };

  void CONFIG;
  return reveal;
};
