/**
 * Game controller: the state machine behind every screen. Renderer-agnostic: it builds view
 * models (js/vm.js), the renderers draw them and return hit areas, and touches come back
 * here as hit ids (see js/HOOKS.md for the full list of ids, view-model extras and events).
 *
 *   const ctl = createController(deps)
 *   ctl.start(enterOptions)        cold start
 *   ctl.view(now)                  -> { screen, vm, overlay }   (what to draw)
 *   ctl.onHit(id)                  a tap landed on hit id
 *   ctl.onDrag(scrollId, dy)       a drag on a scroll area
 *   ctl.setScrollMax(map)          hitAreas.scrollMax from the last draw
 *   ctl.onShow(options) / ctl.onHide()
 *   ctl.animating(now)             true while something moves (keeps repainting)
 *
 * Screens: home, play, reveal, challenge, board, archive (sheets: howto, settings on home;
 * menu, howto on play; theirWords on reveal).
 *
 * THE CLIENT NEVER HOLDS THE ANSWER OR RANK LISTS. Every guess goes to the server
 * (api.guess); the controller shows what it returns. Only vocabulary words are ever sent
 * (typed text that is not a vocabulary word is rejected locally, PO-2).
 */

const { createDict } = require('../core/dict');
const vocabText = require('../core/vocab');
const t2sMap = require('../core/t2s');
const { normalizeInput } = require('../core/normalize');
const { beijingDateKey } = require('../core/date');
const { hintStatus, newlyUnlocked, atBest } = require('../core/hints');
const { rankLabel } = require('../core/temp');
const P = require('../core/play');
const CARD = require('../core/card');
const { parseEnter } = require('./share');
const { createKeyboard } = require('./keyboard');
const V = require('./vm');
const { uuid } = require('./util');

const COACH_LAST = 3;
const WINDOW_CLOSED_TEXT = '今日一词已结束，本局不计入榜单';

function createController(deps) {
  const { wx, api, store, analytics, ads, share, privacy, odc, config } = deps;
  const now = deps.now || (() => Date.now());
  const invalidate = deps.invalidate || (() => {});
  const getLayout = deps.getLayout || (() => ({ board: { x: 16, y: 120, w: 343, h: 400 }, s: 1, dpr: 1 }));
  const dict = deps.dict || createDict(vocabText);
  const t2s = deps.t2s || t2sMap;
  const S = store.state;
  const UI = config.ui;

  const c = {
    screen: 'home',
    prev: 'home',
    home: { daily: { state: 'loading' }, sheet: null, streak: { current: 0, best: 0 } },
    group: { status: 'none', groupRef: null, shareTicket: null, groupid: null, errCode: undefined },
    p: null, // current play context
    rv: null, // reveal context
    challenge: null,
    board: null,
    archive: null,
    ui: { toast: null, dialog: null, ladderScroll: 0 },
    session: { finished: 0, firstSource: null },
    pendingEntry: null,
    scrollMax: {},
    lastGuessTapAt: 0,
    dailyOffsetMs: 0,
    kb: null,
  };

  // ---------------------------------------------------------------- helpers

  const track = (n, p) => analytics.track(n, p);
  const toast = (text) => {
    c.ui.toast = { text, until: now() + UI.toastMs };
    invalidate();
  };
  const go = (screen) => {
    c.prev = c.screen;
    c.screen = screen;
    invalidate();
  };
  const todayKey = () => beijingDateKey(now() + c.dailyOffsetMs);
  const display = () => S.display;

  function closeKeyboard() {
    if (c.kb && c.kb.isOpen) c.kb.close();
    if (c.p) {
      c.p.kb.open = false;
      c.p.kb.text = '';
      c.p.kb.suggestions = [];
      c.p.kb.heightPx = c.p.kb.heightPx;
    }
  }

  // ---------------------------------------------------------------- daily / home

  function dailyStateFrom(cache) {
    const my = cache.my || { status: 'none' };
    const base = { issueNo: cache.issueNo, dateKey: cache.dateKey, puzzleId: cache.puzzleId, steps: my.steps, best: my.best };
    if (my.status === 'solved') return Object.assign(base, { state: 'solved' });
    if (my.status === 'gaveup') return Object.assign(base, { state: 'gaveup' });
    if (my.status === 'playing' && my.steps > 0) return Object.assign(base, { state: 'inProgress' });
    return Object.assign(base, { state: 'available' });
  }

  function setDailyFromState() {
    if (S.dailyCache) c.home.daily = dailyStateFrom(S.dailyCache);
  }

  async function refreshDaily() {
    c.home.daily = Object.assign({}, c.home.daily, { state: 'loading' });
    invalidate();
    const r = await api.getDaily({});
    if (r && r.ok) {
      c.dailyOffsetMs = r.serverNow - now();
      S.dailyCache = { dateKey: r.dateKey, issueNo: r.issueNo, puzzleId: r.puzzleId, warmups: r.warmups, my: r.my };
      c.home.streak = { current: (r.myStreak && r.myStreak.current) || 0, best: (r.myStreak && r.myStreak.best) || 0 };
      if (r.features && r.features.ads) ads.applyRemote(r.features.ads);
      store.save();
      setDailyFromState();
      if (c.home.streak.current >= 2) track('streak_shown', { current: c.home.streak.current, where: 'home' });
    } else {
      const code = r && r.code;
      const net = !r || code === 'NETWORK' || code === 'TIMEOUT';
      const issue = S.dailyCache ? S.dailyCache.issueNo : 0;
      c.home.daily = { state: code === 'DAILY_UNAVAILABLE' ? 'unavailable' : net ? 'offline' : 'error', issueNo: issue, dateKey: todayKey(), puzzleId: '' };
      if (code !== 'DAILY_UNAVAILABLE') track('error', { where: 'getDaily', code: code || 'none' });
    }
    invalidate();
  }

  // ---------------------------------------------------------------- play: open

  function newPlay(o) {
    return {
      token: uuid(),
      puzzleId: o.puzzleId || null,
      req: o, // the request, kept for 重试
      kind: 'daily',
      ranked: false,
      issueNo: null,
      practiceNo: null,
      dateKey: null,
      source: o.source || 'home',
      challengeId: o.challengeId || null,
      state: 'starting',
      status: 'playing',
      warmups: [],
      guesses: [],
      hintsUsed: [],
      adHints: 0,
      firstChar: null,
      answer: null,
      solvedBy: null,
      latestWord: null,
      selectedWord: null,
      chips: [],
      pending: null,
      kb: { open: false, text: '', suggestions: [], heightPx: null },
      banner: null,
      bannerShown: false,
      coach: 0,
      flashWord: null,
      flashUntil: 0,
      sheet: null,
      adBusy: false,
      hintBusy: false,
      openedAt: now(),
      lastGuessAt: 0,
      started: false,
      solvedAt: 0,
    };
  }

  const LOCAL_V = 30000;

  function hydrate(p, r) {
    p.puzzleId = r.puzzleId;
    p.kind = r.kind;
    p.ranked = !!r.ranked;
    p.issueNo = r.issueNo;
    p.practiceNo = r.practiceNo;
    p.dateKey = r.dateKey;
    p.warmups = r.warmups || [];
    const play = r.play || {};
    p.guesses = (play.guesses || []).map((g) => P.toEntry(g, LOCAL_V));
    p.hintsUsed = (play.hintsUsed || []).slice();
    p.adHints = play.adHints || 0;
    p.firstChar = play.firstChar || null;
    p.status = play.status || 'playing';
    p.started = p.guesses.length > 0;
    p.answer = r.answer || null;
    const last = p.guesses.filter((e) => e.word).pop();
    p.latestWord = last ? last.word : null;
    p.selectedWord = p.latestWord;
    const syn = p.guesses.find((e) => e.isSyn);
    if (syn) p.solvedBy = 'synonym';
  }

  async function openPuzzle(o) {
    closeKeyboard();
    const p = newPlay(o);
    c.p = p;
    c.rv = null;
    c.ui.ladderScroll = 0;
    if (!c.session.firstSource) c.session.firstSource = p.source;
    go('play');
    const r = await api.startPuzzle(o.next ? { next: true, pool: o.pool } : { puzzleId: o.puzzleId });
    if (c.p !== p) return;
    if (!r || !r.ok) {
      const code = r && r.code;
      track('error', { where: 'startPuzzle', code: code || 'none' });
      if (code === 'PUZZLE_NOT_FOUND') {
        c.p = null;
        toast(o.next ? '暂时没有新题了' : '这道题找不到了');
        return goHome();
      }
      p.state = !r || code === 'NETWORK' || code === 'TIMEOUT' ? 'offline' : 'error';
      p.loadFailed = true;
      return invalidate();
    }
    hydrate(p, r);
    p.loadFailed = false;
    if (o.next && o.fromKind) track('next_puzzle', { fromKind: o.fromKind, toKind: p.kind });
    track('puzzle_open', { puzzleId: p.puzzleId, kind: p.kind, ranked: p.ranked, source: o.source === 'card' ? 'card' : o.next ? 'next' : o.source || 'home' });
    if (p.status !== 'playing') {
      p.state = 'result';
      return enterReveal(p);
    }
    p.state = p.guesses.length ? 'result' : 'ready';
    p.coach = !S.coachSeen && p.guesses.length === 0 ? 1 : 0;
    if (p.latestWord) await loadChips(p, p.latestWord);
    invalidate();
  }

  async function loadChips(p, word) {
    const r = await api.near({ puzzleId: p.puzzleId, word });
    if (c.p !== p) return;
    if (r && r.ok && p.selectedWord === word) p.chips = P.chipsFrom(r.near, p.guesses, config.input.assocChips);
    else if (!r || !r.ok) p.chips = [];
    invalidate();
  }

  // ---------------------------------------------------------------- play: guessing

  function endCoachIf(n) {
    const p = c.p;
    if (p && p.coach === n) {
      p.coach = n >= COACH_LAST ? 0 : n + 1;
      if (!p.coach) {
        S.coachSeen = true;
        store.save();
      }
    }
  }

  function endCoach() {
    if (c.p) c.p.coach = 0;
    S.coachSeen = true;
    store.save();
    invalidate();
  }

  function submitGuess(word, src) {
    const p = c.p;
    if (!p || p.status !== 'playing') return;
    if (p.state === 'waiting' || p.state === 'starting' || p.state === 'solvedAnim') return;
    if (P.hasWord(p.guesses, word)) {
      const row = P.rowFor(p.guesses, word, p.latestWord);
      p.flashWord = word;
      p.flashUntil = now() + UI.flashMs;
      p.selectedWord = word;
      toast('已经猜过「' + word + '」了 · ' + rankLabel(row.rank));
      track('guess_rejected', { reason: 'duplicate', len: Array.from(word).length });
      loadChips(p, word);
      return invalidate();
    }
    p.pending = { word, src, clientGuessId: uuid() };
    p.state = 'waiting';
    invalidate();
    return sendGuess(p);
  }

  async function sendGuess(p) {
    const pend = p.pending;
    if (!pend) return;
    p.state = 'waiting';
    invalidate();
    const r = await api.guess({ puzzleId: p.puzzleId, word: pend.word, clientGuessId: pend.clientGuessId, src: pend.src });
    if (c.p !== p || p.pending !== pend) return;
    if (r && r.ok) return onGuessOk(p, pend, r);
    const code = r && r.code;
    if (!r || code === 'NETWORK' || code === 'TIMEOUT') {
      p.state = 'offline';
      track('error', { where: 'guess', code: code || 'none' });
      return invalidate();
    }
    p.pending = null;
    p.state = p.guesses.length ? 'result' : 'ready';
    if (code === 'NOT_IN_VOCAB') {
      toast('词库里没有「' + pend.word + '」，换个常用词试试');
      track('guess_rejected', { reason: 'server_oov', len: Array.from(pend.word).length });
    } else if (code === 'RATE_LIMITED') {
      toast('猜得太快了，歇一下');
      track('guess_rejected', { reason: 'rate', len: Array.from(pend.word).length });
    } else if (code === 'GUESS_LIMIT') {
      toast('这一题猜得够多了，试试提示或看答案');
      track('guess_rejected', { reason: 'limit', len: Array.from(pend.word).length });
    } else if (code === 'FINISHED') {
      toast('这一题已经结束了');
      openPuzzle({ puzzleId: p.puzzleId, source: p.source, challengeId: p.challengeId });
      return;
    } else if (code === 'PUZZLE_NOT_FOUND') {
      c.p = null;
      toast('这道题找不到了');
      return goHome();
    } else {
      toast('出错了，请重试');
      track('error', { where: 'guess', code: code || 'none' });
    }
    invalidate();
  }

  function onGuessOk(p, pend, r) {
    p.pending = null;
    const word = r.word || pend.word;
    if (r.dup) {
      p.state = p.guesses.length ? 'result' : 'ready';
      p.flashWord = word;
      p.flashUntil = now() + UI.flashMs;
      toast('已经猜过「' + word + '」了 · ' + rankLabel(r.r));
      track('guess_rejected', { reason: 'duplicate', len: Array.from(word).length });
      return invalidate();
    }
    const before = p.guesses.length;
    const solved = !!r.solved;
    const syn = solved && r.solvedBy === 'synonym';
    p.guesses.push({ word, r: r.r, t: r.t, src: pend.src, isHint: false, isSyn: syn, ch: undefined });
    if (r.ranked === false && p.ranked) {
      p.ranked = false;
      if (!p.bannerShown) {
        p.bannerShown = true;
        p.banner = WINDOW_CLOSED_TEXT;
      }
    }
    const t = now();
    const msSince = p.lastGuessAt ? t - p.lastGuessAt : t - p.openedAt;
    p.lastGuessAt = t;
    if (!p.started) {
      p.started = true;
      track('puzzle_start', { puzzleId: p.puzzleId, kind: p.kind, ranked: p.ranked });
    }
    track('guess', { puzzleId: p.puzzleId, step: p.guesses.length, band: r.band, src: pend.src, msSinceLast: msSince });
    for (const k of newlyUnlocked(config, before, p.guesses.length)) track('hint_unlock', { puzzleId: p.puzzleId, k });
    p.latestWord = word;
    p.selectedWord = word;
    p.chips = P.chipsFrom(r.near, p.guesses, config.input.assocChips);
    if (p.coach) endCoachIf(p.coach);
    if (deps.audio) deps.audio.play('tap');
    if (solved) return onSolved(p, r, syn);
    syncDailyCache(p);
    p.state = 'result';
    invalidate();
  }

  function onSolved(p, r, syn) {
    p.status = 'solved';
    p.answer = r.answer || p.answer;
    p.solvedBy = syn ? 'synonym' : 'answer';
    p.state = 'solvedAnim';
    p.solvedAt = now();
    p.chips = [];
    closeKeyboard();
    if (syn) toast('意思一样！');
    if (wx.vibrateShort) wx.vibrateShort({ type: 'medium' });
    if (deps.audio) deps.audio.play('chime');
    track('solve', {
      puzzleId: p.puzzleId,
      kind: p.kind,
      ranked: p.ranked,
      steps: p.guesses.length,
      hints: p.hintsUsed.length,
      adHints: p.adHints,
      durationMs: now() - p.openedAt,
      solvedBy: p.solvedBy,
      srcMix: P.srcMix(p.guesses),
    });
    finishPuzzle(p, 'solved');
    invalidate();
  }

  /** Keep the home card in step with an unfinished daily (the server holds the truth; this is the cache). */
  function syncDailyCache(p) {
    if (S.dailyCache && p.puzzleId === S.dailyCache.puzzleId && p.status === 'playing') {
      S.dailyCache.my = { status: 'playing', steps: p.guesses.length, best: P.bestRank(p.guesses), hints: p.hintsUsed.length + p.adHints };
      store.save();
    }
  }

  /** Bookkeeping when a puzzle ends (solved or gave up): counters, caches, marker. */
  function finishPuzzle(p, outcome) {
    S.lifetimeFinished++;
    c.session.finished++;
    const steps = p.guesses.length;
    const hints = p.hintsUsed.length + p.adHints;
    S.finished[p.puzzleId] = { outcome, steps, hints, best: P.bestRank(p.guesses), kind: p.kind, issueNo: p.issueNo, practiceNo: p.practiceNo, answer: p.answer };
    if (S.dailyCache && p.puzzleId === S.dailyCache.puzzleId) {
      S.dailyCache.my = { status: outcome, steps, best: P.bestRank(p.guesses), hints };
      setDailyFromState();
    }
    store.save();
    if (p.ranked && p.kind === 'daily') {
      privacy.writeMarker(p.dateKey, { s: steps, h: hints, st: outcome }).then((res) => {
        if (res === 'privacyDenied' && c.rv && c.rv.p === p) {
          c.rv.privacyNote = true;
          invalidate();
        }
      });
    }
  }

  // ---------------------------------------------------------------- play: hints, give up

  function hintInfo(p) {
    return hintStatus(config, p.guesses.length, p.hintsUsed);
  }

  async function useHint() {
    const p = c.p;
    if (!p || p.status !== 'playing' || p.hintBusy || p.state === 'waiting' || p.state === 'starting' || p.state === 'solvedAnim' || p.state === 'offline') return;
    const hs = hintInfo(p);
    if (hs.state !== 'available') return toast(hs.label);
    if (config.hints.kinds[hs.next - 1] === 'word' && atBest(P.bestRank(p.guesses))) return toast('已经只差一步了');
    p.hintBusy = true;
    const r = await api.useHint({ puzzleId: p.puzzleId, k: hs.next, source: 'ladder' });
    p.hintBusy = false;
    if (c.p !== p) return;
    if (!r || !r.ok) return hintError(r);
    applyHint(p, r, hs.next, 'ladder');
  }

  function hintError(r) {
    const code = r && r.code;
    if (code === 'AT_BEST') toast('已经只差一步了');
    else if (code === 'HINT_LOCKED') toast('提示还没解锁');
    else if (code === 'HINT_LIMIT') toast('提示已用完');
    else if (code === 'RANKED_NO_AD') toast('今日一词不能看视频提示');
    else if (!r || code === 'NETWORK' || code === 'TIMEOUT') toast('网络开小差了');
    else toast('出错了，请重试');
    if (code && code !== 'AT_BEST' && code !== 'NETWORK' && code !== 'TIMEOUT') track('error', { where: 'useHint', code });
    invalidate();
  }

  function applyHint(p, r, k, source) {
    const before = p.guesses.length;
    if (r.kind === 'firstChar') {
      p.guesses.push({ word: null, r: null, t: null, src: 'hint', isHint: true, isSyn: false, ch: r.ch });
      p.firstChar = r.ch;
    } else {
      p.guesses.push({ word: r.word, r: r.r, t: r.t, src: source === 'ad' ? 'adhint' : 'hint', isHint: true, isSyn: false });
      p.latestWord = r.word;
      p.selectedWord = r.word;
      p.chips = P.chipsFrom(r.near, p.guesses, config.input.assocChips);
    }
    if (source === 'ad') p.adHints++;
    else p.hintsUsed.push(k);
    p.lastGuessAt = now();
    track('hint_use', { puzzleId: p.puzzleId, k: source === 'ad' ? undefined : k, source, step: p.guesses.length, rank: r.r });
    for (const kk of newlyUnlocked(config, before, p.guesses.length)) track('hint_unlock', { puzzleId: p.puzzleId, k: kk });
    syncDailyCache(p);
    p.state = 'result';
    invalidate();
  }

  async function adHint() {
    const p = c.p;
    if (!p || p.ranked || p.status !== 'playing' || p.adBusy || p.state === 'waiting' || p.state === 'offline' || p.state === 'solvedAnim') return;
    if (p.adHints >= config.hints.adMaxPerPuzzle) return toast('这一题的视频提示用完了');
    if (atBest(P.bestRank(p.guesses))) return toast('已经只差一步了');
    p.adBusy = true;
    invalidate();
    const out = await ads.rewarded('hint', p.puzzleId);
    p.adBusy = false;
    if (out.toast) toast(out.toast);
    if (c.p !== p) return;
    if (!out.granted) return invalidate();
    const r = await api.useHint({ puzzleId: p.puzzleId, source: 'ad' });
    if (c.p !== p) return;
    if (!r || !r.ok) return hintError(r);
    applyHint(p, r, null, 'ad');
  }

  function askGiveUp() {
    const p = c.p;
    p.sheet = null;
    if (p.guesses.length === 0) {
      toast('先猜一个词再放弃');
      return invalidate();
    }
    c.ui.dialog = {
      text: p.ranked && p.kind === 'daily' ? '放弃后会显示答案。今日一词将记为未猜中，连续猜中天数会中断。' : '放弃后会显示答案。',
      confirmLabel: '放弃并看答案',
      cancelLabel: '再想想',
      danger: true,
      action: 'giveUp',
    };
    invalidate();
  }

  async function doGiveUp() {
    const p = c.p;
    if (!p || p.status !== 'playing') return;
    const r = await api.giveUp({ puzzleId: p.puzzleId });
    if (c.p !== p) return;
    if (!r || !r.ok) {
      toast(!r || r.code === 'NETWORK' || r.code === 'TIMEOUT' ? '网络开小差了' : '出错了，请重试');
      return invalidate();
    }
    p.status = 'gaveup';
    p.answer = r.answer;
    closeKeyboard();
    track('give_up', { puzzleId: p.puzzleId, kind: p.kind, steps: p.guesses.length, best: P.bestRank(p.guesses) });
    finishPuzzle(p, 'gaveup');
    enterReveal(p);
  }

  function dialogConfirm() {
    const d = c.ui.dialog;
    c.ui.dialog = null;
    if (!d) return;
    if (d.action === 'giveUp') doGiveUp();
    invalidate();
  }

  // ---------------------------------------------------------------- keyboard

  function suggestionsFor(text) {
    return dict.suggest(normalizeInput(text, t2s), config.input.suggestMax);
  }

  function clearTyped() {
    const p = c.p;
    p.kb.text = '';
    p.kb.suggestions = [];
    if (c.kb) c.kb.clear();
  }

  function onKbInput(text) {
    const p = c.p;
    if (!p) return;
    p.kb.text = text;
    p.kb.suggestions = suggestionsFor(text);
    invalidate();
  }

  function onKbConfirm(text) {
    const p = c.p;
    if (!p || c.screen !== 'play') return;
    if (p.state === 'waiting' || p.status !== 'playing') return;
    const norm = normalizeInput(text !== undefined && text !== '' ? text : p.kb.text, t2s);
    if (!norm) return;
    if (dict.has(norm)) {
      clearTyped();
      return submitGuess(norm, 'typed');
    }
    toast('词库里没有「' + norm + '」，换个常用词试试'); // nothing is sent (PO-2)
    track('guess_rejected', { reason: 'oov', len: Array.from(norm).length });
    invalidate();
  }

  function openKeyboard() {
    const p = c.p;
    if (!p || p.status !== 'playing' || p.state === 'starting' || p.state === 'solvedAnim') return;
    p.sheet = null;
    if (!c.kb || !c.kb.available) return toast('当前无法使用键盘，请点联想词');
    p.kb.open = true;
    p.kb.text = '';
    p.kb.suggestions = [];
    c.kb.open();
    track('keyboard_open', { puzzleId: p.puzzleId, step: p.guesses.length });
    invalidate();
  }

  // ---------------------------------------------------------------- reveal

  function revealCtx(p) {
    return {
      p,
      top: { state: 'loading', items: [] },
      stats: null,
      streak: null,
      compare: null,
      sheet: null,
      scrollY: 0,
      maxFrac: 0,
      privacyNote: false,
      nextBusy: false,
      tracked: false,
    };
  }

  function enterReveal(p) {
    closeKeyboard();
    const rv = revealCtx(p);
    c.rv = rv;
    p.state = 'result';
    go('reveal');
    loadRevealList(rv);
    if (p.ranked && p.kind === 'daily' && p.status === 'solved') loadStreak(rv);
    if (p.challengeId) loadCompare(rv);
    analytics.flush();
  }

  async function loadRevealList(rv) {
    const p = rv.p;
    rv.top = { state: 'loading', items: [] };
    invalidate();
    const r = await api.getReveal({ puzzleId: p.puzzleId });
    if (c.rv !== rv) return;
    if (r && r.ok) {
      if (r.answer) p.answer = r.answer;
      rv.top = { state: 'ready', items: (r.top || []).map((it) => ({ rank: it[1], word: it[0], mine: P.hasWord(p.guesses, it[0]), synonym: !!it[2] })) };
      rv.stats = r.stats || null;
    } else {
      rv.top = { state: 'error', items: [] };
      track('error', { where: 'getReveal', code: (r && r.code) || 'none' });
    }
    invalidate();
  }

  async function loadStreak(rv) {
    const r = await api.getDaily({});
    if (c.rv !== rv) return;
    if (r && r.ok && r.myStreak) {
      rv.streak = { current: r.myStreak.current, best: r.myStreak.best };
      c.home.streak = rv.streak;
      if (S.dailyCache) S.dailyCache.my = r.my;
      if (rv.streak.current >= 2) track('streak_shown', { current: rv.streak.current, where: 'reveal' });
      invalidate();
    }
  }

  async function loadCompare(rv) {
    const p = rv.p;
    const r = await api.getChallenge({ challengeId: p.challengeId });
    if (c.rv !== rv) return;
    if (r && r.ok && !r.own && r.ownerWords) {
      rv.compare = { theirSteps: r.owner.steps, theirStatus: r.owner.status, theirTemps: r.owner.temps, theirWords: r.ownerWords };
      track('challenge_finish', { challengeId: p.challengeId, puzzleKind: p.kind, mySteps: p.guesses.length, theirSteps: r.owner.steps });
      invalidate();
    }
  }

  function leaveReveal() {
    const rv = c.rv;
    if (rv && !rv.tracked) {
      rv.tracked = true;
      track('reveal_view', { puzzleId: rv.p.puzzleId, maxListRank: Math.min(100, Math.round(10 + rv.maxFrac * 90)) });
    }
  }

  function revealCard() {
    const p = c.rv.p;
    const outcome = p.status === 'solved' ? 'solved' : 'gaveup';
    const input = { kind: p.kind, issueNo: p.issueNo, practiceNo: p.practiceNo, outcome, steps: p.guesses.length, hints: p.hintsUsed.length + p.adHints, best: P.bestRank(p.guesses), temps: P.stepTemps(p.guesses), bands: P.stepBands(p.guesses) };
    return { input, card: CARD.cardVm(input, config.card.maxColumns), puzzleId: p.puzzleId };
  }

  function nextPuzzleTap() {
    const rv = c.rv;
    if (!rv || rv.nextBusy) return;
    const p = rv.p;
    const ctx = { sessionFinished: c.session.finished, lifetimeFinished: S.lifetimeFinished, firstFromCard: c.session.firstSource === 'card', blocked: !!(c.ui.dialog || rv.sheet) };
    ads.interstitial(ctx); // never awaited: does not delay the next puzzle
    leaveReveal();
    openPuzzle({ next: true, source: 'next', fromKind: p.kind });
  }

  // ---------------------------------------------------------------- challenge entry

  async function openChallenge(id) {
    c.challenge = { id, status: 'loading' };
    go('challenge');
    track('challenge_open', { challengeId: id });
    const r = await api.getChallenge({ challengeId: id });
    if (!c.challenge || c.challenge.id !== id) return;
    if (r && r.ok) {
      if (r.alreadyFinished && !r.own) {
        // already finished this puzzle: straight to the comparison (spec 8.6/8.7)
        return openPuzzle({ puzzleId: r.puzzleId, source: 'card', challengeId: id });
      }
      c.challenge = Object.assign({ id, status: r.own ? 'own' : 'ready' }, { puzzleId: r.puzzleId, kind: r.kind, issueNo: r.issueNo, practiceNo: r.practiceNo, owner: r.owner, own: r.own || undefined, countsAsToday: r.countsAsToday, alreadyFinished: r.alreadyFinished });
    } else if (r && (r.code === 'CHALLENGE_NOT_FOUND' || r.code === 'PUZZLE_NOT_FOUND')) {
      c.challenge = { id, status: 'notFound' };
    } else {
      c.challenge = { id, status: !r || r.code === 'NETWORK' || r.code === 'TIMEOUT' ? 'offline' : 'notFound' };
      track('error', { where: 'getChallenge', code: (r && r.code) || 'none' });
    }
    invalidate();
  }

  // ---------------------------------------------------------------- boards

  function selfLine() {
    const my = S.dailyCache && S.dailyCache.my;
    if (!my) return { status: 'none', steps: 0 };
    return { status: my.status === 'playing' && !my.steps ? 'none' : my.status, steps: my.steps || 0 };
  }

  async function openBoard(kind) {
    const dateKey = S.dailyCache ? S.dailyCache.dateKey : todayKey();
    const b = { kind, dateKey, issueNo: S.dailyCache ? S.dailyCache.issueNo : 0, state: 'loading', mode: null, self: selfLine(), sharedCanvas: null, rowCount: 0 };
    c.board = b;
    c.ui.boardScroll = 0;
    closeKeyboard();
    if (c.screen !== 'board') go('board');
    const view = (state) => {
      b.state = state;
      track('board_view', { kind, state, mode: b.mode || undefined });
      invalidate();
    };
    if (kind === 'group') {
      if (c.group.status === 'checking') return view('checkingGroup');
      if (c.group.status !== 'ok') return view('noGroup');
    }
    invalidate();
    const gate = await privacy.ensureForBoard();
    if (c.board !== b) return;
    if (gate.state === 'privacyDenied') return view('privacyDenied');
    if (gate.state === 'unauthorized') return view('scopeDenied');
    const r = await api.getBoard({ kind, dateKey, groupRef: kind === 'group' ? c.group.groupRef : undefined });
    if (c.board !== b) return;
    if (!r || !r.ok) {
      track('error', { where: 'getBoard', code: (r && r.code) || 'none' });
      return view('error');
    }
    b.mode = r.mode;
    b.dateKey = r.dateKey;
    b.issueNo = r.issueNo;
    b.rowCount = r.rows.length;
    if (!r.rows.length) return view('empty');
    const L = getLayout();
    odc.render(V.boardMessage(kind, r, { groupid: c.group.groupid, shareTicket: c.group.shareTicket, board: L.board, dpr: L.dpr }));
    b.sharedCanvas = odc.sharedCanvas();
    view('ready');
  }

  // ---------------------------------------------------------------- archive

  async function openArchive() {
    c.archive = { state: 'loading', items: [], cursor: null, hasMore: false, bestStreak: 0, practice: { done: 0, total: 0 }, loadingMore: false, scrollY: 0 };
    go('archive');
    await loadArchive(false);
  }

  async function loadArchive(more) {
    const a = c.archive;
    if (more) a.loadingMore = true;
    invalidate();
    const r = await api.getHistory(more ? { cursor: a.cursor } : {});
    if (c.archive !== a) return;
    a.loadingMore = false;
    if (!r || !r.ok) {
      if (!more) a.state = 'error';
      track('error', { where: 'getHistory', code: (r && r.code) || 'none' });
      return invalidate();
    }
    const tk = todayKey();
    const items = (r.items || []).map((it) => Object.assign({}, it, { today: it.dateKey === tk }));
    a.items = more ? a.items.concat(items) : items;
    a.cursor = r.nextCursor;
    a.hasMore = !!r.nextCursor;
    a.bestStreak = r.bestStreak || 0;
    a.practice = r.practice || a.practice;
    a.state = a.items.length || a.practice.total ? 'ready' : 'empty';
    if (!more) track('archive_view', { items: a.items.length, state: a.state });
    invalidate();
  }

  // ---------------------------------------------------------------- navigation

  function goHome() {
    closeKeyboard();
    leaveReveal();
    c.ui.dialog = null;
    c.home.sheet = null;
    c.screen = 'home';
    c.p = null;
    c.rv = null;
    setDailyFromState();
    if (c.pendingEntry) {
      const e = c.pendingEntry;
      c.pendingEntry = null;
      routeEntry(e);
    }
    invalidate();
  }

  // ---------------------------------------------------------------- entry routing (9.3)

  async function routeEntry(e) {
    if (e.join) joinGroupFor(e);
    if (e.kind === 'challenge') return openChallenge(e.challengeId);
    if (e.kind === 'puzzle') return openPuzzle({ puzzleId: e.puzzleId, source: 'card' });
    if (e.kind === 'menu') return;
    if (e.kind === 'fallbackShare') return track('error', { where: 'entry', code: 'wxad_fallback_share' });
    if (e.kind === 'malformed') return track('error', { where: 'entry', code: 'malformed' });
  }

  async function joinGroupFor(e) {
    c.group = { status: 'checking', groupRef: null, shareTicket: e.shareTicket, groupid: null, errCode: undefined };
    invalidate();
    const r = await share.enterGroup(e);
    c.group.status = r.status;
    c.group.groupRef = r.groupRef;
    c.group.errCode = r.errCode;
    invalidate();
  }

  function handleEntry(options, cold) {
    const e = parseEnter(options);
    if (e.kind === 'none') return e;
    // the launch options and the first onShow can be the same entry: count it once
    const key = JSON.stringify([options.query, options.shareTicket, options.scene]);
    if (key === c.lastEntryKey && now() - c.lastEntryAt < 3000) return e;
    c.lastEntryKey = key;
    c.lastEntryAt = now();
    if (e.kind === 'challenge' || e.kind === 'puzzle' || e.kind === 'menu') {
      track('card_open', { cardKind: e.kind === 'challenge' ? 'challenge' : e.kind === 'puzzle' ? 'puzzle' : 'menu', hasShareTicket: e.hasShareTicket, challengeId: e.challengeId });
    }
    if (!cold && c.screen === 'play' && c.p && (c.p.kb.open || c.p.pending) && (e.kind === 'challenge' || e.kind === 'puzzle')) {
      // a card arrives mid-guess: wait until the player is back home (edge case 22)
      c.pendingEntry = e;
      toast('收到一张新的分享卡片');
      return e;
    }
    routeEntry(e);
    return e;
  }

  // ---------------------------------------------------------------- lifecycle

  function fontSettingIsLarge() {
    try {
      const info = wx.getSystemInfoSync ? wx.getSystemInfoSync() : null;
      return !!(info && typeof info.fontSizeSetting === 'number' && info.fontSizeSetting >= 20);
    } catch (e) {
      return false;
    }
  }

  c.start = function (options) {
    const t = now();
    if (!S.installId) S.installId = uuid();
    if (!S.firstDate) {
      S.firstDate = beijingDateKey(t);
      if (fontSettingIsLarge()) {
        S.display.largeText = true; // [SPIKE] first-launch default from the system font size
        track('display_setting', { largeText: true, highContrast: false, source: 'system' });
      }
    }
    S.lastSessionAt = t;
    const e = parseEnter(options);
    analytics.startSession({ scene: options && options.scene, fromCard: e.kind === 'challenge' ? 'challenge' : e.kind === 'puzzle' ? 'puzzle' : e.kind === 'menu' ? 'menu' : 'none', hasShareTicket: e.hasShareTicket });
    analytics.startTimer();
    if (!S.howtoSeen) c.home.sheet = 'howto';
    store.save();
    c.kb = createKeyboard(wx, { onInput: onKbInput, onConfirm: onKbConfirm, onComplete: () => c.p && ((c.p.kb.open = false), invalidate()), onHeight: (h) => c.p && ((c.p.kb.heightPx = h), invalidate()) }, config.input.maxLength);
    share.register();
    handleEntry(options || {}, true);
    return refreshDaily();
  };

  c.onShow = function (options) {
    analytics.onShow({ scene: options && options.scene, fromCard: 'none', hasShareTicket: !!(options && options.shareTicket) });
    privacy.refreshOnShow().then(() => invalidate());
    if (S.dailyCache && todayKey() !== S.dailyCache.dateKey && c.screen === 'home') refreshDaily();
    if (options && (options.query || options.shareTicket)) handleEntry(options, false);
    invalidate();
  };

  c.onHide = function () {
    analytics.onHide();
  };

  // ---------------------------------------------------------------- touches

  c.setScrollMax = (m) => {
    c.scrollMax = m || {};
    const rv = c.rv;
    if (rv && c.screen === 'reveal' && c.scrollMax['reveal:scroll'] > 0) rv.maxFrac = Math.max(rv.maxFrac, Math.min(1, rv.scrollY / c.scrollMax['reveal:scroll']));
  };

  c.onDrag = function (id, dy) {
    const max = (c.scrollMax && c.scrollMax[id]) || 0;
    const clampTo = (v) => Math.max(0, Math.min(max, v));
    if (id === 'play:ladder') c.ui.ladderScroll = clampTo(c.ui.ladderScroll - dy);
    else if (id === 'reveal:scroll' && c.rv) {
      c.rv.scrollY = clampTo(c.rv.scrollY - dy);
      if (max > 0) c.rv.maxFrac = Math.max(c.rv.maxFrac, Math.min(1, c.rv.scrollY / max));
    } else if (id === 'archive:scroll' && c.archive) c.archive.scrollY = clampTo(c.archive.scrollY - dy);
    else if (id === 'board:list' && c.board) {
      const L = getLayout();
      const cap = (c.board.rowCount || 0) * 66 * (L.s || 1);
      c.ui.boardScroll = Math.max(0, Math.min(cap, (c.ui.boardScroll || 0) - dy));
      odc.scroll(c.ui.boardScroll);
    }
    invalidate();
  };

  c.onHit = function (id) {
    // overlays first
    if (ads.overlay) {
      if (id === 'adstub:complete') ads.stubComplete();
      else if (id === 'adstub:skip') ads.stubSkip();
      return invalidate();
    }
    if (c.ui.dialog) {
      if (id === 'dialog:confirm') dialogConfirm();
      else if (id === 'dialog:cancel') c.ui.dialog = null;
      return invalidate();
    }
    if (id === 'adstub:complete' || id === 'adstub:skip' || id === 'dialog:confirm' || id === 'dialog:cancel') return;
    switch (c.screen) {
      case 'home':
        return homeHit(id);
      case 'play':
        return playHit(id);
      case 'reveal':
        return revealHit(id);
      case 'challenge':
        return challengeHit(id);
      case 'board':
        return boardHit(id);
      case 'archive':
        return archiveHit(id);
    }
  };

  function setDisplay(key) {
    S.display[key] = !S.display[key];
    store.save();
    track('display_setting', { largeText: S.display.largeText, highContrast: S.display.highContrast, source: 'settings' });
    invalidate();
  }

  function homeHit(id) {
    const d = c.home.daily;
    switch (id) {
      case 'home:daily':
        if (d.state === 'available' || d.state === 'inProgress' || d.state === 'solved' || d.state === 'gaveup') return openPuzzle({ puzzleId: d.puzzleId, source: 'home' });
        return;
      case 'home:retry':
        return refreshDaily();
      case 'home:practice':
        return openPuzzle({ next: true, pool: 'practice', source: 'next' });
      case 'home:next':
        return openPuzzle({ next: true, source: 'next', fromKind: 'daily' });
      case 'home:groupBoard':
      case 'home:groupBanner':
        return openBoard('group');
      case 'home:friendBoard':
        return openBoard('friend');
      case 'home:archive':
        return openArchive();
      case 'home:howto':
        c.home.sheet = 'howto';
        return invalidate();
      case 'home:settings':
        c.home.sheet = 'settings';
        return invalidate();
      case 'home:sound':
      case 'settings:sound':
        S.muted = !S.muted;
        if (deps.audio) deps.audio.setMuted(S.muted);
        store.save();
        return invalidate();
      case 'settings:largeText':
        return setDisplay('largeText');
      case 'settings:highContrast':
        return setDisplay('highContrast');
      case 'settings:openSetting':
        return privacy.openSetting().then(() => invalidate());
      case 'settings:privacy':
        if (wx.openPrivacyContract) wx.openPrivacyContract({});
        return;
      case 'settings:feedback':
        return; // native overlay button, positioned by main.js
      case 'sheet:close':
        if (c.home.sheet === 'howto' && !S.howtoSeen) {
          S.howtoSeen = true;
          store.save();
        }
        c.home.sheet = null;
        return invalidate();
    }
  }

  function guessTapAllowed() {
    const t = now();
    if (t - c.lastGuessTapAt < UI.tapDebounceMs) return false;
    c.lastGuessTapAt = t;
    return true;
  }

  function playHit(id) {
    const p = c.p;
    if (!p) return;
    const idx = (prefix) => (id.indexOf(prefix) === 0 ? parseInt(id.slice(prefix.length), 10) : -1);
    if (id === 'back') {
      closeKeyboard();
      c.p = null;
      return goHome();
    }
    if (id === 'play:retry') {
      if (p.loadFailed) return openPuzzle(p.req);
      if (p.pending) return sendGuess(p);
      p.state = p.guesses.length ? 'result' : 'ready';
      return invalidate();
    }
    if (id === 'coach:next') {
      endCoachIf(p.coach);
      return invalidate();
    }
    if (id === 'coach:skip') return endCoach();
    if (id === 'sheet:close') {
      p.sheet = null;
      return invalidate();
    }
    if (id === 'menu:open') {
      p.sheet = p.sheet === 'menu' ? null : 'menu';
      return invalidate();
    }
    if (id === 'menu:giveup') return askGiveUp();
    if (id === 'menu:howto') {
      p.sheet = 'howto';
      return invalidate();
    }
    if (p.state === 'starting' || p.state === 'solvedAnim') return;
    if (id === 'key:open') return openKeyboard();
    if (id === 'key:close') {
      closeKeyboard();
      return invalidate();
    }
    if (id === 'hint:use') return useHint();
    if (id === 'hint:ad') return adHint();
    let i = idx('warmup:');
    if (i >= 0) return p.guesses.length === 0 && p.warmups[i] && guessTapAllowed() ? submitGuess(p.warmups[i], 'warmup') : undefined;
    i = idx('chip:');
    if (i >= 0) return p.chips[i] && guessTapAllowed() ? submitGuess(p.chips[i], 'chip') : undefined;
    i = idx('sugg:');
    if (i >= 0) {
      const w = p.kb.suggestions[i];
      if (!w || !guessTapAllowed()) return;
      clearTyped();
      return submitGuess(w, 'suggest');
    }
    i = idx('row:');
    if (i >= 0) {
      const rows = P.ladderRows(p.guesses, p.latestWord);
      const row = rows[i];
      if (!row || p.state === 'waiting') return;
      track('chips_select', { puzzleId: p.puzzleId, fromRow: row.word === p.latestWord ? 'latest' : 'older' });
      p.selectedWord = row.word;
      p.chips = [];
      loadChips(p, row.word);
      return invalidate();
    }
  }

  function revealHit(id) {
    const rv = c.rv;
    if (!rv) return;
    if (id === 'sheet:close') {
      rv.sheet = null;
      return invalidate();
    }
    if (rv.sheet) return;
    switch (id) {
      case 'reveal:back':
        c.p = null;
        return goHome();
      case 'reveal:share': {
        const rc = revealCard();
        return share.shareResult({ puzzleId: rc.puzzleId, kind: rc.input.kind, issueNo: rc.input.issueNo, practiceNo: rc.input.practiceNo, outcome: rc.input.outcome, steps: rc.input.steps, hints: rc.input.hints, best: rc.input.best, card: rc.card });
      }
      case 'reveal:board':
        return openBoard(c.group.status === 'ok' ? 'group' : 'friend');
      case 'reveal:next':
        return nextPuzzleTap();
      case 'reveal:retryList':
        return loadRevealList(rv);
      case 'reveal:theirWords':
        rv.sheet = 'theirWords';
        return invalidate();
    }
  }

  function challengeHit(id) {
    const ch = c.challenge;
    switch (id) {
      case 'challenge:accept':
        if (ch && (ch.status === 'ready' || ch.status === 'own')) return openPuzzle({ puzzleId: ch.puzzleId, source: 'card', challengeId: ch.status === 'own' ? undefined : ch.id });
        return;
      case 'challenge:home':
        return goHome();
      case 'challenge:retry':
        return openChallenge(ch.id);
    }
  }

  function boardHit(id) {
    const b = c.board;
    switch (id) {
      case 'board:back':
        if (c.prev === 'reveal' && c.rv) {
          c.screen = 'reveal';
          return invalidate();
        }
        if (c.prev === 'play' && c.p && c.p.status === 'playing') {
          c.screen = 'play';
          return invalidate();
        }
        return goHome();
      case 'board:retry':
        return openBoard(b.kind);
      case 'board:goPlay':
        goHome();
        return homeHit('home:daily');
      case 'board:share':
        share.shareGroupInvite();
        return;
      case 'board:contract':
        if (wx.openPrivacyContract) wx.openPrivacyContract({});
        return;
      case 'board:agree':
        return privacy.requestPrivacy('board_open').then(async (r) => {
          if (r === 'agreed') {
            await privacy.flushPending();
            return openBoard(b.kind);
          }
          invalidate();
        });
      case 'board:openSetting':
        return privacy.openSetting().then(() => openBoard(b.kind));
    }
  }

  function archiveHit(id) {
    const a = c.archive;
    if (id === 'archive:back') return goHome();
    if (id === 'archive:retry') return openArchive();
    if (id === 'archive:more') return a.hasMore && !a.loadingMore ? loadArchive(true) : undefined;
    if (id === 'archive:practice') return openPuzzle({ next: true, pool: 'practice', source: 'next' });
    if (id.indexOf('archive:item:') === 0) {
      const it = a.items[parseInt(id.slice(13), 10)];
      if (it) return openPuzzle({ puzzleId: it.puzzleId, source: 'archive' });
    }
  }

  // ---------------------------------------------------------------- rendering state

  c.tick = function (t) {
    const p = c.p;
    if (c.ui.toast && t >= c.ui.toast.until) c.ui.toast = null;
    if (p) {
      if (p.flashWord && t >= p.flashUntil) p.flashWord = null;
      if (c.screen === 'play' && p.state === 'solvedAnim' && t - p.solvedAt >= UI.solvedAnimMs) enterReveal(p);
    }
  };

  c.animating = function (t) {
    if (ads.overlay) return true;
    if (c.ui.toast) return true;
    const p = c.p;
    if (c.screen === 'play' && p && (p.state === 'waiting' || p.state === 'starting' || p.state === 'solvedAnim' || p.flashWord || p.adBusy)) return true;
    if (c.screen === 'reveal' && c.rv && c.rv.top.state === 'loading') return true;
    if (c.screen === 'home' && c.home.daily.state === 'loading') return true;
    if (c.screen === 'board' && c.board && (c.board.state === 'loading' || c.board.state === 'checkingGroup')) return true;
    if (c.screen === 'challenge' && c.challenge && c.challenge.status === 'loading') return true;
    if (c.screen === 'archive' && c.archive && c.archive.state === 'loading') return true;
    void t;
    return false;
  };

  c.view = function (t) {
    t = t === undefined ? now() : t;
    c.tick(t);
    let vm;
    const toastText = c.ui.toast ? c.ui.toast.text : null;
    switch (c.screen) {
      case 'home':
        vm = V.homeVm(c.home.daily, { streak: c.home.streak, hasGroupContext: c.group.status === 'ok', muted: S.muted, showHowToOnce: c.home.sheet === 'howto' && !S.howtoSeen, friendBoardEnabled: privacy.friendBoardEnabled(), sheet: c.home.sheet, display: display(), t });
        break;
      case 'play': {
        const p = c.p;
        vm = V.playVm({
          cfg: config, puzzleId: p.puzzleId, kind: p.kind, ranked: p.ranked, issueNo: p.issueNo, practiceNo: p.practiceNo, state: p.state, status: p.status,
          guesses: p.guesses, hintsUsed: p.hintsUsed, adHints: p.adHints, firstChar: p.firstChar, warmups: p.warmups, latestWord: p.latestWord,
          selectedWord: p.selectedWord, chips: p.chips, pending: p.pending, kb: p.kb, toast: toastText, banner: p.banner, coach: p.coach,
          flashWord: p.flashWord, sheet: p.sheet, adBusy: p.adBusy, ladderScroll: c.ui.ladderScroll, display: display(), t,
        });
        break;
      }
      case 'reveal': {
        const rv = c.rv;
        const p = rv.p;
        vm = V.revealVm({
          puzzleId: p.puzzleId, kind: p.kind, ranked: p.ranked, issueNo: p.issueNo, practiceNo: p.practiceNo, answer: p.answer,
          outcome: p.status === 'solved' ? 'solved' : 'gaveup', guesses: p.guesses, hintsUsed: p.hintsUsed, adHints: p.adHints,
          stats: rv.stats, streak: rv.streak || c.home.streak, top: rv.top, compare: rv.compare, sheet: rv.sheet, scrollY: rv.scrollY, nextBusy: rv.nextBusy, display: display(), t,
        });
        vm.privacyNote = !!rv.privacyNote;
        break;
      }
      case 'challenge':
        vm = V.challengeVm(c.challenge, display(), t);
        break;
      case 'board':
        vm = V.boardVm(c.board, { bannerEnabled: ads.bannerEnabled(), display: display(), t });
        break;
      case 'archive':
        vm = V.archiveVm(c.archive, display(), t);
        break;
    }
    const overlay = {};
    if (c.ui.dialog) overlay.dialog = { text: c.ui.dialog.text, confirmLabel: c.ui.dialog.confirmLabel, cancelLabel: c.ui.dialog.cancelLabel, danger: !!c.ui.dialog.danger };
    if (c.ui.toast) overlay.toast = { text: c.ui.toast.text };
    if (ads.overlay) overlay.adStub = { kind: ads.overlay.kind, secondsLeft: Math.max(0, Math.ceil((ads.overlay.durationMs - (t - ads.overlay.startedAt)) / 1000)) };
    return { screen: c.screen, vm, overlay };
  };

  c.state = c;
  c.dict = dict;
  return c;
}

module.exports = { createController, WINDOW_CLOSED_TEXT };
