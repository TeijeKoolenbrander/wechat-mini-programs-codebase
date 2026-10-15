/**
 * Game controller: the state machine behind every screen. Renderer-agnostic:
 * it builds view models (js/vm.js), the renderers draw them and return hit
 * areas, and touches come back here as hit ids (js/HOOKS.md).
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
 * Screens: home, play, result, challenge, board, history, issue.
 *
 * Free play (and free-seed challenges) run entirely on the client from the
 * bundled free pool; they are submitted best-effort. Every run on a daily deck
 * is server-stepped: the client only ever holds the current question and the
 * values the server has already revealed (api.startRun / api.answer).
 * No ad is ever requested for a daily-deck run.
 */

const J = require('../core/judge');
const { buildFreeDeck } = require('../core/deck');
const { questionPayload, revealOf, segmentBannerText, pairText } = require('../core/question');
const { randomSeed } = require('../core/rng');
const { beijingDateKey } = require('../core/date');
const { countByGroup, offeredGroups } = require('../core/content');
const { FREE_GROUPS, BY_KEY } = require('../core/measures');
const { parseEnter } = require('./share');
const V = require('./vm');
const { uuid } = require('./util');

const REVEAL_MS = 600;
const CORRECT_MS = 600;
const SEGMENT_MS = 800;
const MISS_MS = 1200;
const CLEARED_MS = 1200;
const ANSWER_DEBOUNCE_MS = 300;
const TOAST_MS = 2400;

function createController(deps) {
  const { wx, api, store, analytics, ads, share, privacy, odc, config, content } = deps;
  const now = deps.now || (() => Date.now());
  const invalidate = deps.invalidate || (() => {});
  const getLayout = deps.getLayout || (() => ({ board: { x: 16, y: 120, w: 343, h: 400 }, s: 1, dpr: 1, W: 375, H: 812, x0: 16, contentW: 343 }));
  const cvNum = content.contentVersion;
  const cfgNum = config.configVersion;
  const S = store.state;

  const c = {
    screen: 'home',
    prev: 'home',
    home: { daily: { state: 'loading' } },
    sheets: [], // stack of open sheet kinds for the current screen
    group: { status: 'none', groupRef: null, shareTicket: null, groupid: null, errCode: undefined },
    features: { subscribe: null, banner: { enabled: false, adUnitId: null }, interstitial: null },
    r: null, // current run context
    res: null, // current result
    ui: { toast: null, dialog: null, scrollY: 0, sheetScroll: 0, report: null, source: null, saveState: 'idle', adState: 'idle', subscribe: { state: 'hidden', challengeId: null }, boardScroll: 0 },
    challenge: null,
    board: null,
    history: { state: 'loading', items: [], bestDays: 0, bestDaily: 0 },
    issue: null,
    sessionFreeRuns: 0,
    sessionFromCard: false,
    pendingEntry: null,
    scrollMax: {},
    lastAnswerAt: 0,
    submits: {},
    dailyOffsetMs: 0,
    dayStreakTracked: {},
    lastEntryKey: null,
    lastEntryAt: 0,
    coach: 0,
  };

  // ---------------------------------------------------------------- helpers

  const track = (n, p) => analytics.track(n, p);
  const toast = (text) => {
    c.ui.toast = { text, until: now() + TOAST_MS };
    invalidate();
  };
  function go(screen) {
    c.prev = c.screen;
    if (c.screen === 'board' && screen !== 'board') ads.destroyBanner();
    c.screen = screen;
    c.sheets = [];
    c.ui.scrollY = 0;
    c.ui.sheetScroll = 0;
    c.ui.playScroll = null;
    c.ui.report = null;
    c.ui.source = null;
    invalidate();
  }
  const todayKey = () => beijingDateKey(now() + c.dailyOffsetMs);
  /** The saved free-play category, or 全部 when it is not offered (small categories, or a changed content set). */
  const offeredFreeGroup = () => (offeredGroups(content, config.freeGroupMinFacts).indexOf(S.freeGroup) >= 0 ? S.freeGroup : 'all');
  const groupLabel = (key) => (FREE_GROUPS.find((g) => g.key === key) || FREE_GROUPS[0]).label;
  const topSheet = () => c.sheets[c.sheets.length - 1] || null;
  const openSheet = (kind) => {
    c.ui.sheetScroll = 0;
    c.sheets.push(kind);
    invalidate();
  };
  const choiceLabel = (measureKey, choice) => (choice === 'hi' ? BY_KEY[measureKey].hi : BY_KEY[measureKey].lo);
  const strip = (x) => JSON.parse(JSON.stringify(x));

  function persistActive() {
    const r = c.r;
    if (!r) return;
    if (r.server) S.active = { server: true, mode: r.mode, clientRunId: r.clientRunId, dateKey: r.dateKey, challengeId: r.challengeId || null, pendingChoice: r.pendingChoice || null, startedAt: r.startedAt };
    else
      S.active = {
        server: false, mode: r.mode, clientRunId: r.clientRunId, seed: r.seed, group: r.group, cv: cvNum, cfg: cfgNum, answers: r.run.answers.map((a) => ({ k: a.k, c: a.c })),
        lifeAtK: r.run.lifeAtK, streak: r.run.streak, challengeId: r.challengeId || null, ownerStreak: r.challengeInfo ? r.challengeInfo.ownerStreak : null, startedAt: r.startedAt, source: r.source,
      };
    store.save();
  }

  // ---------------------------------------------------------------- daily / home

  function setDailyFromCache() {
    const cache = S.dailyCache;
    if (!cache) return;
    const key = cache.dateKey;
    const base = { issueNo: cache.issueNo, dateKey: key, themeLabel: cache.themeLabel, dayCurrent: cache.myDays ? cache.myDays.current : 0 };
    const stored = S.results[key];
    if (cache.myStatus === 'done' && cache.myResult) {
      const res = cache.myResult;
      const byWindow = res.endReason === 'window' && !S.notes.finalizedSeen[key];
      if (byWindow) {
        S.notes.finalizedSeen[key] = true;
        store.save();
      }
      c.home.daily = Object.assign(base, { state: 'done', streak: res.n, rarityShare: res.rarity ? res.rarity.share : null, finalizedByWindow: byWindow });
    } else if (cache.myStatus === 'open' && cache.myRun) {
      c.home.daily = Object.assign(base, { state: 'inProgress', progressText: '已连对 ' + cache.myRun.streak + ' · 第 ' + cache.myRun.k + ' 题', streak: cache.myRun.streak });
    } else if (stored && stored.ranked) {
      c.home.daily = Object.assign(base, { state: 'done', streak: stored.streak, rarityShare: stored.rarityShare });
    } else c.home.daily = Object.assign(base, { state: 'available' });
    if (base.dayCurrent >= 2 && !c.dayStreakTracked.home) {
      c.dayStreakTracked.home = true;
      track('day_streak_shown', { current: base.dayCurrent, where: 'home' });
    }
  }

  async function refreshDaily() {
    c.home.daily = Object.assign({}, c.home.daily, { state: 'loading' });
    invalidate();
    const r = await api.getDaily({});
    if (r && r.ok) {
      c.dailyOffsetMs = r.serverNow - now();
      c.features = r.features || c.features;
      ads.setRemote(c.features);
      if (r.bests && r.bests.free > S.bestFree) S.bestFree = r.bests.free;
      S.dailyCache = { dateKey: r.dateKey, issueNo: r.issueNo, themeLabel: r.theme.label, myStatus: r.myStatus, myRun: r.myRun || null, myResult: r.myResult || null, myDays: r.myDays, bests: r.bests };
      store.save();
      setDailyFromCache();
    } else {
      const net = !r || r.code === 'NETWORK' || r.code === 'TIMEOUT';
      c.home.daily = { state: net ? 'offline' : 'error', issueNo: S.dailyCache ? S.dailyCache.issueNo : 0, dateKey: todayKey(), themeLabel: '' };
      track('error', { where: 'getDaily', code: r ? r.code : 'none' });
    }
    invalidate();
  }

  // ---------------------------------------------------------------- run contexts

  function baseRun(o) {
    return {
      mode: o.mode, // 'daily' | 'free' | 'challenge'
      deckKind: o.deckKind, // 'daily' | 'free'
      server: !!o.server,
      ranked: !!o.ranked,
      friendly: !!o.friendly,
      clientRunId: o.clientRunId || uuid(),
      source: o.source || 'home',
      dateKey: o.dateKey || null,
      issueNo: o.issueNo || null,
      themeLabel: o.themeLabel || '',
      challengeId: o.challengeId || null,
      challengeInfo: o.challengeInfo || null,
      passed: false,
      seed: o.seed,
      group: o.group || 'all',
      deck: null,
      run: null,
      deckLength: o.deckLength,
      q: null,
      nextQ: null,
      k: 1,
      streak: 0,
      history: [],
      phase: 'loading',
      phaseAt: now(),
      chosen: null,
      correct: null,
      reveal: null,
      pendingChoice: null,
      banner: null,
      lifeUsed: false,
      missInfo: null,
      missText: '',
      startedAt: now(),
      startLogged: false,
      serverEnded: false,
      result: null,
      adState: 'idle',
    };
  }

  function beginPlay(r) {
    c.r = r;
    c.res = null;
    c.ui.adState = 'idle';
    c.ui.dialog = null;
    c.coach = !S.coachSeen && S.lifetimeRuns === 0 && r.mode !== 'challenge' ? 1 : 0;
    go('play');
  }

  function logRunStart(r) {
    if (r.startLogged) return;
    r.startLogged = true;
    track('run_start', { runId: r.clientRunId, mode: r.mode, ranked: r.ranked, source: r.source, group: r.mode === 'daily' ? undefined : r.group, theme: r.themeLabel || undefined });
  }

  function setPhase(r, phase) {
    r.phase = phase;
    r.phaseAt = now();
    c.ui.playScroll = null; // the card viewport follows the phase again (large text on a small screen)
    invalidate();
  }

  // ---- free / free-seed runs (client side)

  function showFreeQuestion(r) {
    r.q = questionPayload(r.deck.questions[r.run.k - 1], content.byId);
    r.k = r.run.k;
  }

  function startFree(source, seedInfo) {
    const info = seedInfo || {};
    const seed = info.seed !== undefined ? info.seed >>> 0 : randomSeed();
    const group = info.group || offeredFreeGroup();
    const r = baseRun({
      mode: info.challengeId ? 'challenge' : 'free', deckKind: 'free', friendly: !!info.challengeId, seed, group, source: source || 'home', deckLength: config.deckLen.free,
      challengeId: info.challengeId, challengeInfo: info.challengeId ? { ownerStreak: info.ownerStreak, kind: 'free' } : null,
    });
    r.deck = buildFreeDeck(seed, cvNum, cfgNum, group, content);
    r.run = J.createRun(r.deck.length);
    showFreeQuestion(r);
    r.phase = 'awaitAnswer';
    beginPlay(r);
    logRunStart(r);
    persistActive();
  }

  function restoreFree(a) {
    const r = baseRun({
      mode: a.mode, deckKind: 'free', friendly: a.mode === 'challenge', seed: a.seed, group: a.group, clientRunId: a.clientRunId, source: a.source, deckLength: config.deckLen.free,
      challengeId: a.challengeId, challengeInfo: a.challengeId ? { ownerStreak: a.ownerStreak, kind: 'free' } : null,
    });
    r.startedAt = a.startedAt;
    r.startLogged = true;
    r.deck = buildFreeDeck(a.seed, a.cv, a.cfg, a.group, content);
    r.run = J.createRun(r.deck.length);
    a.answers.forEach((ans) => {
      const q = questionPayload(r.deck.questions[r.run.k - 1], content.byId);
      const res = J.applyAnswer(r.run, r.deck, content.byId, ans.c);
      const rev = revealOf(content.byId[q.bottom.factId]);
      const hist = { k: ans.k, top: q.top, bottom: V.revealedFace(q.bottom, rev), correct: res.correct, choice: ans.c, choiceLabel: choiceLabel(q.measure, ans.c), subLabel: q.subLabel, measure: q.measure };
      r.history.push(hist);
      if (!res.correct) r.missInfo = { k: ans.k, top: q.top, bottom: hist.bottom, chosenLabel: hist.choiceLabel, subLabel: q.subLabel, measure: q.measure };
      if (a.lifeAtK === ans.k && J.canUseLife(r.run)) {
        J.useLife(r.run);
        r.lifeUsed = true;
      }
    });
    r.streak = r.run.streak;
    if (r.challengeInfo && r.streak > r.challengeInfo.ownerStreak) r.passed = true;
    return r;
  }

  // ---- daily-deck runs (server-stepped)

  function applyRunView(r, x) {
    r.clientRunId = x.clientRunId || r.clientRunId;
    r.ranked = !!x.ranked;
    r.friendly = !x.ranked;
    r.dateKey = x.dateKey;
    r.issueNo = x.issueNo;
    r.themeLabel = x.themeLabel;
    r.deckLength = config.deckLen.daily;
    r.streak = x.streak;
    r.k = x.k;
    if (x.challenge) r.challengeInfo = { ownerStreak: x.challenge.ownerStreak, kind: 'daily' };
    r.history = (x.answered || []).map((a) => ({ k: a.k, top: a.top, bottom: a.bottom, correct: a.correct, choice: a.choice, choiceLabel: choiceLabel(a.top.measure, a.choice), subLabel: a.bottom.info ? a.bottom.info.subLabel : '', measure: a.top.measure }));
    const lastMiss = r.history.filter((h) => !h.correct).pop();
    if (lastMiss) r.missInfo = { k: lastMiss.k, top: lastMiss.top, bottom: lastMiss.bottom, chosenLabel: lastMiss.choiceLabel, subLabel: lastMiss.subLabel, measure: lastMiss.measure };
    if (r.challengeInfo && r.streak > r.challengeInfo.ownerStreak) r.passed = true;
  }

  async function serverStart(r, body) {
    const t0 = now();
    const x = await api.startRun(body);
    track('q_fetch', { runId: r.clientRunId, k: 1, result: x && x.ok ? 'ok' : fetchResult(x), ms: now() - t0 });
    if (c.r !== r) return;
    if (x && x.ok) {
      applyRunView(r, x);
      if (x.result) {
        r.result = x.result;
        r.serverEnded = true;
        r.phase = 'miss';
        return endRun(x.result.endReason);
      }
      r.q = x.question;
      r.k = x.question.k;
      r.startLogged = r.startLogged || x.resumed;
      logRunStart(r);
      setPhase(r, 'awaitAnswer');
      // a kept tap from before a kill or a network drop is re-sent (idempotent per k)
      const a = S.active;
      if (a && a.server && a.clientRunId === r.clientRunId && a.pendingChoice && a.pendingChoice.k === r.q.k) {
        r.chosen = a.pendingChoice.choice;
        r.pendingChoice = a.pendingChoice;
        setPhase(r, 'sending');
        sendAnswer(r);
      } else persistActive();
      return;
    }
    const code = x && x.code;
    if (code === 'ALREADY_PLAYED') {
      toast('今日一比已完成');
      c.r = null;
      await refreshDaily();
      return goHome();
    }
    if (code === 'CHALLENGE_EXPIRED') {
      toast('这个挑战已经过期了');
      c.r = null;
      return goHome();
    }
    if (code === 'DAILY_UNAVAILABLE') {
      toast('今日一比需联网');
      c.r = null;
      await refreshDaily();
      return goHome();
    }
    track('error', { where: 'startRun', code: code || 'none' });
    r.q = null;
    setPhase(r, 'netError');
  }

  function fetchResult(x) {
    const code = x && x.code;
    if (code === 'TIMEOUT') return 'timeout';
    if (code === 'NETWORK') return 'offline';
    return 'error';
  }

  function startDaily() {
    const cache = S.dailyCache;
    if (!cache) return;
    const a = S.active;
    const resumeId = a && a.server && a.mode === 'daily' && a.dateKey === cache.dateKey ? a.clientRunId : null;
    const r = baseRun({ mode: 'daily', deckKind: 'daily', server: true, ranked: true, clientRunId: resumeId, dateKey: cache.dateKey, issueNo: cache.issueNo, themeLabel: cache.themeLabel, deckLength: config.deckLen.daily, source: 'home' });
    beginPlay(r);
    serverStart(r, { mode: 'daily', clientRunId: r.clientRunId, dateKey: cache.dateKey });
  }

  function retryLoad() {
    const r = c.r;
    if (!r || r.phase !== 'netError') return;
    if (r.pendingChoice && r.q) {
      setPhase(r, 'sending');
      return sendAnswer(r);
    }
    setPhase(r, 'loading');
    serverStart(r, r.challengeId ? { mode: 'challenge', clientRunId: r.clientRunId, challengeId: r.challengeId } : { mode: 'daily', clientRunId: r.clientRunId, dateKey: r.dateKey });
  }

  async function sendAnswer(r) {
    const p = r.pendingChoice;
    if (!p) return;
    const t0 = now();
    const x = await api.answer({ clientRunId: r.clientRunId, k: p.k, choice: p.choice, ms: p.ms });
    track('q_fetch', { runId: r.clientRunId, k: p.k, result: x && x.ok ? 'ok' : fetchResult(x), ms: now() - t0 });
    if (c.r !== r || r.phase !== 'sending') return;
    if (x && x.ok) {
      r.pendingChoice = null;
      r.correct = x.correct;
      r.reveal = x.reveal;
      r.serverStreak = x.streak;
      r.nextQ = x.next || null;
      r.serverEnded = !!x.ended;
      r.result = x.result || null;
      if (r.audio !== false && deps.audio) deps.audio.play('turn');
      setPhase(r, 'revealing');
      persistActive();
      return;
    }
    const code = x && x.code;
    if (code === 'WINDOW_CLOSED') {
      toast('今日一比已结束，按当前连对记入');
      r.pendingChoice = null;
      r.result = x.result;
      if (typeof x.streak === 'number') r.streak = x.streak;
      r.serverEnded = true;
      return endRun('window');
    }
    if (code === 'INVALID_ORDER') {
      // out of step with the server: resync from the open question
      r.pendingChoice = null;
      r.chosen = null;
      setPhase(r, 'loading');
      return serverStart(r, r.challengeId ? { mode: 'challenge', clientRunId: r.clientRunId, challengeId: r.challengeId } : { mode: 'daily', clientRunId: r.clientRunId, dateKey: r.dateKey });
    }
    track('error', { where: 'answer', code: code || 'none' });
    setPhase(r, 'netError'); // the tap is kept; 重试 re-sends the same k and choice
  }

  // ---------------------------------------------------------------- answering

  function onAnswer(choice) {
    const r = c.r;
    if (!r || r.phase !== 'awaitAnswer') return;
    const t = now();
    if (t - c.lastAnswerAt < ANSWER_DEBOUNCE_MS) return;
    c.lastAnswerAt = t;
    if (c.coach) endCoach();
    r.chosen = choice;
    if (r.server) {
      r.pendingChoice = { k: r.q.k, choice, ms: t - r.phaseAt };
      setPhase(r, 'sending');
      persistActive();
      sendAnswer(r);
      return;
    }
    const res = J.applyAnswer(r.run, r.deck, content.byId, choice);
    if (!res.ok) return;
    r.correct = res.correct;
    r.reveal = revealOf(content.byId[r.q.bottom.factId]);
    if (deps.audio) deps.audio.play('turn');
    setPhase(r, 'revealing');
    persistActive();
  }

  /** The reveal finished (or was skipped): record the pair and show the outcome. */
  function finishReveal() {
    const r = c.r;
    if (!r || r.phase !== 'revealing') return;
    const q = r.q;
    const bottom = V.revealedFace(q.bottom, r.reveal);
    r.history.push({ k: q.k, top: q.top, bottom, correct: r.correct, choice: r.chosen, choiceLabel: choiceLabel(q.measure, r.chosen), subLabel: q.subLabel, measure: q.measure });
    if (r.correct) {
      r.streak = r.server ? r.serverStreak : r.run.streak;
      if (r.challengeInfo && !r.passed && r.streak > r.challengeInfo.ownerStreak) r.passed = true;
      const cleared = r.server ? r.serverEnded : r.run.status === 'ended';
      if (deps.audio) deps.audio.play('ok');
      setPhase(r, cleared ? 'cleared' : 'correct');
    } else {
      r.missInfo = { k: q.k, top: q.top, bottom, chosenLabel: choiceLabel(q.measure, r.chosen), subLabel: q.subLabel, measure: q.measure };
      r.missText = '差一点！' + pairText(q.top, q.bottom, r.reveal);
      if (deps.audio) {
        deps.audio.play('miss');
        deps.audio.vibrate();
      }
      setPhase(r, 'miss');
    }
  }

  function advance() {
    const r = c.r;
    if (!r || r.phase !== 'correct') return;
    if (r.server) r.q = r.nextQ;
    else showFreeQuestion(r);
    r.k = r.q.k;
    r.chosen = null;
    r.correct = null;
    r.reveal = null;
    persistActive();
    if (r.q.segmentStart) {
      r.banner = segmentBannerText(r.q);
      setPhase(r, 'segmentChange');
    } else setPhase(r, 'awaitAnswer');
  }

  function afterMiss() {
    const r = c.r;
    if (!r || r.phase !== 'miss') return;
    // 再答一次: free runs (incl. free-seed challenges) only, once per run, never on a daily deck
    if (!r.server && J.canUseLife(r.run)) {
      r.adState = 'idle';
      c.ui.adState = 'idle';
      track('continue_offer', { runId: r.clientRunId });
      if (topSheet() !== 'continue') openSheet('continue');
      return;
    }
    endRun(r.server ? (r.result ? r.result.endReason : 'miss') : r.run.endReason || 'miss');
  }

  async function continueVideo() {
    const r = c.r;
    if (!r || r.server || topSheet() !== 'continue' || c.ui.adState !== 'idle' || !J.canUseLife(r.run)) return;
    c.ui.adState = 'loading';
    invalidate();
    const out = await ads.rewarded('continue', r.clientRunId);
    c.ui.adState = 'idle';
    if (c.r !== r) return;
    if (out.toast) toast(out.toast);
    if (out.granted) {
      track('continue_result', { runId: r.clientRunId, result: out.reason === 'noFillGrant' ? 'noFillGrant' : 'completed' });
      grantLife(r);
    } else {
      track('continue_result', { runId: r.clientRunId, result: out.reason === 'closedEarly' ? 'closedEarly' : 'error' });
      c.sheets = [];
      endRun('miss');
    }
    invalidate();
  }

  function declineContinue() {
    const r = c.r;
    if (!r || topSheet() !== 'continue') return;
    track('continue_result', { runId: r.clientRunId, result: 'declined' });
    c.sheets = [];
    endRun('miss');
  }

  function grantLife(r) {
    c.sheets = [];
    J.useLife(r.run);
    r.lifeUsed = true;
    r.chosen = null;
    r.correct = null;
    r.reveal = null;
    if (r.run.status === 'ended') {
      // the forgiven miss was the last question
      return endRun('cleared');
    }
    r.phase = 'correct';
    advance();
    persistActive();
  }

  function endCoach() {
    c.coach = 0;
    S.coachSeen = true;
    store.save();
  }

  // ---------------------------------------------------------------- end of run and result

  function bestBackup(streak) {
    if (streak > S.bestFree) S.bestFree = streak;
  }

  function buildResult(r, o) {
    const res = {
      mode: r.mode,
      ranked: !!r.ranked,
      friendly: !!r.friendly,
      status: o.status || 'done',
      runId: r.clientRunId,
      dateKey: r.dateKey,
      issueNo: r.issueNo,
      themeLabel: r.themeLabel,
      deckKind: r.deckKind,
      headerText: V.headerOf(r, groupLabel(r.group)),
      streak: o.streak,
      lifeUsed: !!r.lifeUsed,
      cleared: o.endReason === 'cleared',
      endReason: o.endReason,
      deckLength: r.deckLength,
      rarityShare: o.rarityShare === undefined ? null : o.rarityShare,
      dayStreak: o.dayStreak || 0,
      finalizedByWindow: o.endReason === 'window',
      miss: o.endReason === 'miss' ? r.missInfo : null,
      questions: r.history.slice(),
      challengeId: r.challengeId,
      challengeCompare: r.challengeInfo ? { ownerStreak: r.challengeInfo.ownerStreak } : null,
      seed: r.mode === 'daily' ? undefined : r.seed,
      group: r.group,
      privacyNote: false,
      interstitialDue: false,
      tracked: false,
      startedAt: r.startedAt,
    };
    return res;
  }

  function showResult(res) {
    c.res = res;
    c.ui.scrollY = 0;
    c.ui.sheetScroll = 0;
    c.ui.saveState = 'idle';
    c.ui.subscribe = { state: 'hidden', challengeId: null };
    go('result');
  }

  function trackComplete(res, r) {
    if (res.tracked) return;
    res.tracked = true;
    track('run_complete', {
      runId: res.runId, mode: res.mode, ranked: res.ranked, streak: res.streak, endReason: res.endReason, lifeUsed: res.lifeUsed,
      durationMs: res.startedAt ? now() - res.startedAt : 0, answers: res.questions.length,
    });
    if (r && r.challengeId) {
      track('challenge_answered', { challengeId: r.challengeId, kind: r.deckKind, ownerStreak: r.challengeInfo ? r.challengeInfo.ownerStreak : undefined, myStreak: res.streak, countsAsDaily: res.ranked });
    }
    if (res.dayStreak >= 2) track('day_streak_shown', { current: res.dayStreak, where: 'result' });
    analytics.flush();
  }

  /** The run is over: result screen, bookkeeping, best-effort submit. */
  function endRun(endReason) {
    const r = c.r;
    if (!r) return;
    S.lifetimeRuns++;
    let res;
    if (r.server) {
      const result = r.result;
      if (!result) {
        // should not happen: the server finalizes in the answer that ends the run; fetch the state once more
        res = buildResult(r, { status: 'pendingNetwork', streak: r.streak, endReason });
        showResult(res);
        return;
      }
      r.streak = result.n;
      res = buildResult(r, { streak: result.n, endReason: result.endReason || endReason, rarityShare: result.rarity ? result.rarity.share : null, dayStreak: result.dayStreak });
      if (result.challengeCompare) res.challengeCompare = { ownerStreak: result.challengeCompare.ownerStreak };
      if (r.ranked) {
        S.results[r.dateKey] = Object.assign(strip(res), { ranked: true });
        if (S.dailyCache && S.dailyCache.dateKey === r.dateKey) {
          S.dailyCache.myStatus = 'done';
          S.dailyCache.myResult = { n: result.n, endReason: result.endReason || endReason, rarity: result.rarity || null, clientRunId: r.clientRunId };
          if (result.dayStreak) S.dailyCache.myDays = { current: result.dayStreak, best: Math.max(result.dayStreak, S.dailyCache.myDays ? S.dailyCache.myDays.best : 0) };
          setDailyFromCache();
        }
        privacy.writeMarker(r.dateKey, result.n).then((out) => {
          if (out === 'privacyDenied') {
            res.privacyNote = true;
            invalidate();
          }
        });
      }
      if (r.challengeId) S.results['c_' + r.challengeId] = strip(res);
    } else {
      const run = r.run;
      res = buildResult(r, { streak: run.streak, endReason: run.endReason });
      res.cleared = run.endReason === 'cleared';
      bestBackup(run.streak);
      if (r.mode === 'free') c.sessionFreeRuns++;
      res.interstitialDue = ads.interstitialDue({ mode: r.mode, sessionFreeRuns: c.sessionFreeRuns, lifetimeRuns: S.lifetimeRuns, fromCardFirstRun: c.sessionFromCard && S.lifetimeRuns <= 1 });
      c.submits[r.clientRunId] = submitFree(r, res);
      if (r.challengeId) S.results['c_' + r.challengeId] = strip(res);
    }
    S.active = null;
    pruneResults();
    store.save();
    c.r = r;
    showResult(res);
    trackComplete(res, r);
  }

  /** Keep the stored result views bounded: the last 30 issues and the last 20 challenges. */
  function pruneResults() {
    const keys = Object.keys(S.results);
    const days = keys.filter((k) => /^[0-9]{8}$/.test(k)).sort();
    days.slice(0, Math.max(0, days.length - 30)).forEach((k) => delete S.results[k]);
    const chs = keys.filter((k) => k.indexOf('c_') === 0);
    chs.slice(0, Math.max(0, chs.length - 20)).forEach((k) => delete S.results[k]);
  }

  /** Best-effort submit of a finished free run; failures wait in S.pendingSubmits. */
  function submitFree(r, res) {
    const body = {
      clientRunId: r.clientRunId, seed: r.seed, group: r.group, contentVersion: cvNum, configVersion: cfgNum, answers: r.run.answers.map((a) => ({ k: a.k, c: a.c })),
      lifeAtK: r.run.lifeAtK, clientStreak: r.run.streak, challengeId: r.challengeId || undefined,
    };
    return api.submitRun(body).then((x) => {
      if (x && x.ok) {
        if (x.challengeCompare && res) res.challengeCompare = { ownerStreak: x.challengeCompare.ownerStreak };
        invalidate();
        return x;
      }
      const code = x && x.code;
      if (code === 'NETWORK' || code === 'TIMEOUT' || !code) {
        if (S.pendingSubmits.length < 20) S.pendingSubmits.push(body);
        store.save();
      } else track('error', { where: 'submitRun', code });
      return x;
    });
  }

  async function flushPending() {
    if (!S.pendingSubmits.length) return;
    const list = S.pendingSubmits.splice(0, S.pendingSubmits.length);
    store.save();
    for (const body of list) {
      const x = await api.submitRun(body);
      if (!x || (!x.ok && (x.code === 'NETWORK' || x.code === 'TIMEOUT'))) {
        S.pendingSubmits.push(body);
      }
    }
    store.save();
  }

  // ---------------------------------------------------------------- back / dialogs

  function back() {
    const r = c.r;
    if (!r) return goHome();
    if (r.phase === 'loading' || (!r.q && r.phase === 'netError')) {
      c.r = null;
      return goHome();
    }
    c.ui.dialog = r.server
      ? { text: '进度会保留，可稍后继续', confirmLabel: '先回首页', cancelLabel: '继续答', action: 'leave' }
      : { text: '结束本局？', confirmLabel: '结束', cancelLabel: '继续答', danger: true, action: 'abandon' };
    invalidate();
  }

  function dialogConfirm() {
    const d = c.ui.dialog;
    c.ui.dialog = null;
    if (!d) return;
    if (d.action === 'abandon') {
      const r = c.r;
      if (r) track('run_abandon', { runId: r.clientRunId, mode: r.mode, k: r.q ? r.q.k : r.k });
      S.active = null;
      store.save();
      c.r = null;
      goHome();
    } else if (d.action === 'leave') {
      persistActive();
      c.r = null;
      goHome();
      refreshDaily();
    }
    invalidate();
  }

  function goHome() {
    c.sheets = [];
    c.ui.dialog = null;
    if (c.screen !== 'home') go('home');
    c.screen = 'home';
    if (c.home.daily.state !== 'offline' && c.home.daily.state !== 'error') setDailyFromCache();
    if (c.pendingEntry) {
      const e = c.pendingEntry;
      c.pendingEntry = null;
      routeEntry(e);
    }
    invalidate();
  }

  // ---------------------------------------------------------------- reports and sources

  function faceForRef(ref) {
    const p = ref.split(':');
    const r = c.r;
    if (c.screen === 'play' && r && r.q) {
      if (p[0] === 'top') return { face: r.q.top, where: 'reveal' };
      if (p[0] === 'bottom' && r.reveal && (r.phase === 'correct' || r.phase === 'miss' || r.phase === 'cleared')) return { face: V.revealedFace(r.q.bottom, r.reveal), where: 'reveal' };
      return null;
    }
    if (c.screen === 'result' && c.res) {
      if (p[0] === 'miss' && c.res.miss) return { face: c.res.miss[p[1]], where: 'result' };
      if (p[0] === 'q') {
        const q = c.res.questions.find((x) => x.k === +p[1]);
        return q ? { face: q[p[2]], where: 'list' } : null;
      }
    }
    if (c.screen === 'issue' && c.issue && c.issue.data && c.issue.data.deck && p[0] === 'issue') {
      const row = c.issue.data.deck.find((x) => x.k === +p[1]);
      return row ? { face: p[2] === 'top' ? row.a : row.b, where: 'history' } : null;
    }
    return null;
  }

  function openSource(ref) {
    const f = faceForRef(ref);
    if (!f) return;
    c.ui.source = f;
    track('source_view', { where: 'sheet' });
    openSheet('source');
  }

  function openReport(ref) {
    const f = faceForRef(ref);
    if (!f) return;
    const prior = S.reported[f.face.factId];
    const selected = {};
    (prior || []).forEach((k) => {
      selected[k] = true;
    });
    c.ui.report = { factId: f.face.factId, face: f.face, where: f.where, state: 'idle', selected, alreadyReported: !!prior };
    openSheet('report');
  }

  async function submitReport() {
    const rep = c.ui.report;
    if (!rep || rep.state !== 'idle') return;
    const reasons = Object.keys(rep.selected).filter((k) => rep.selected[k]);
    if (!reasons.length) return;
    rep.state = 'sending';
    invalidate();
    const r = c.r;
    const res = await api.reportFact({ factId: rep.factId, reasons, where: rep.where, dateKey: c.res ? c.res.dateKey || undefined : r ? r.dateKey || undefined : undefined, runId: r ? r.clientRunId : undefined });
    if (c.ui.report !== rep) return;
    if (res && res.ok) {
      S.reported[rep.factId] = reasons;
      store.save();
      track('fact_report', { factId: rep.factId, reasons, where: rep.where, result: res.limited ? 'rateLimited' : 'ok' });
      toast(V.REPORT_THANKS);
      c.ui.report = null;
      c.sheets = c.sheets.filter((k) => k !== 'report');
    } else {
      track('fact_report', { factId: rep.factId, reasons, where: rep.where, result: 'offline' });
      toast('网络不太好，稍后再试');
      rep.state = 'idle';
    }
    invalidate();
  }

  // ---------------------------------------------------------------- challenges

  async function openChallenge(id) {
    c.challenge = { id, status: 'loading' };
    go('challenge');
    const r = await api.getChallenge({ challengeId: id });
    if (r && r.ok) {
      const ch = Object.assign({ id }, r);
      if (r.kind === 'free') ch.categoryLabel = groupLabel(r.group);
      if (r.status === 'own' && c.features.subscribe) {
        ch.subscribe = { state: S.subscribeBanned ? 'hidden' : 'offer' };
        if (!S.subscribeBanned) track('subscribe_offer', { where: 'own', challengeId: id });
      }
      c.challenge = ch;
    } else if (r && (r.status === 'expired' || r.code === 'CHALLENGE_EXPIRED')) {
      c.challenge = { id, status: 'expired', ownerStreak: 0, kind: 'daily' };
    } else {
      const net = !r || r.code === 'NETWORK' || r.code === 'TIMEOUT';
      c.challenge = { id, status: net ? 'offline' : 'error', ownerStreak: 0, kind: 'daily' };
      track('error', { where: 'getChallenge', code: r ? r.code : 'none' });
    }
    invalidate();
  }

  function acceptChallenge() {
    const ch = c.challenge;
    if (!ch || ch.status !== 'ready') return;
    if (ch.kind === 'daily') {
      const r = baseRun({
        mode: 'challenge', deckKind: 'daily', server: true, ranked: !!ch.countsAsDaily, friendly: !ch.countsAsDaily, dateKey: ch.dateKey, issueNo: ch.issueNo, themeLabel: ch.themeLabel,
        deckLength: config.deckLen.daily, source: 'challenge', challengeId: ch.id, challengeInfo: { ownerStreak: ch.ownerStreak, kind: 'daily' },
      });
      beginPlay(r);
      serverStart(r, { mode: 'challenge', clientRunId: r.clientRunId, challengeId: ch.id });
      return;
    }
    if (ch.contentVersion !== cvNum || ch.configVersion !== cfgNum) {
      c.challenge = Object.assign({}, ch, { status: 'retired' });
      return invalidate();
    }
    startFree('challenge', { seed: ch.seed, group: ch.group, challengeId: ch.id, ownerStreak: ch.ownerStreak });
  }

  function compareFromChallenge() {
    const ch = c.challenge;
    const st = S.results['c_' + ch.id];
    const res = st ? strip(st) : { mode: ch.kind === 'daily' ? 'challenge' : 'challenge', ranked: false, friendly: true, status: 'done', headerText: '挑战', streak: ch.myStreak || 0, lifeUsed: false, cleared: false, questions: [], miss: null, deckLength: 40, challengeCompare: { ownerStreak: ch.ownerStreak }, tracked: true };
    res.status = 'done';
    res.tracked = true;
    showResult(res);
  }

  async function startChallengeShare(res) {
    if (c.submits[res.runId]) await c.submits[res.runId];
    const out = await share.shareChallenge({ mode: res.mode === 'daily' ? 'daily' : res.deckKind === 'daily' ? 'daily' : 'free', streak: res.streak, dateKey: res.dateKey, runId: res.runId, miss: missForShare(res), card: V.cardVm(res) });
    if (out && out.toast) toast(out.toast);
    if (out && out.kind === 'challenge' && c.features.subscribe && !S.subscribeBanned) {
      c.ui.subscribe = { state: 'offer', challengeId: out.challengeId };
      track('subscribe_offer', { where: 'result', challengeId: out.challengeId });
    }
    invalidate();
  }

  function missForShare(res) {
    if (!res.miss) return null;
    return { bottomLabel: res.miss.bottom.label, topLabel: res.miss.top.label, hi: BY_KEY[res.miss.measure] ? BY_KEY[res.miss.measure].hi : '更多' };
  }

  function requestSubscribe(challengeId, setState) {
    const tmpl = c.features.subscribe && c.features.subscribe.tmplId;
    if (!tmpl || !challengeId || !wx.requestSubscribeMessage) return;
    setState('requesting');
    wx.requestSubscribeMessage({
      tmplIds: [tmpl],
      success: async (r) => {
        if (r && r[tmpl] === 'accept') {
          const g = await api.subscribeChallenge({ challengeId });
          setState(g && g.ok ? 'granted' : 'unavailable');
          track('subscribe_result', { challengeId, result: g && g.ok ? 'accept' : 'error' });
        } else {
          setState('declined');
          track('subscribe_result', { challengeId, result: r && r[tmpl] === 'ban' ? 'ban' : 'reject' });
        }
      },
      fail: (e) => {
        if (e && e.errCode === 20004) S.subscribeBanned = true;
        store.save();
        setState(e && e.errCode === 20004 ? 'unavailable' : 'declined');
        track('subscribe_result', { challengeId, result: 'error', errCode: e && e.errCode });
      },
    });
  }

  // ---------------------------------------------------------------- save image (spec 6.17)

  async function saveImage() {
    const res = c.res;
    if (!res || c.ui.saveState === 'rendering' || c.ui.saveState === 'saving') return;
    c.ui.saveState = 'rendering';
    invalidate();
    let path = null;
    try {
      if (share.cardRenderer) path = await share.cardRenderer(V.cardVm(res), 2);
    } catch (e) {
      path = null;
    }
    if (!path || !wx.saveImageToPhotosAlbum) {
      c.ui.saveState = 'error';
      track('save_image', { mode: res.mode, result: 'error' });
      toast('保存失败，请稍后再试');
      return invalidate();
    }
    c.ui.saveState = 'saving';
    invalidate();
    wx.saveImageToPhotosAlbum({
      filePath: path,
      success: () => {
        c.ui.saveState = 'saved';
        track('save_image', { mode: res.mode, result: 'ok' });
        toast('已保存到相册');
        invalidate();
      },
      fail: (e) => {
        const denied = e && /auth|deny|permission/i.test(String(e.errMsg || ''));
        c.ui.saveState = denied ? 'denied' : 'error';
        track('save_image', { mode: res.mode, result: denied ? 'denied' : 'error' });
        if (denied) openSheet('albumDenied');
        else toast('保存失败，请稍后再试');
        invalidate();
      },
    });
  }

  // ---------------------------------------------------------------- boards

  function selfStreak() {
    const cache = S.dailyCache;
    if (cache && cache.myResult) return cache.myResult.n;
    const st = S.results[cache ? cache.dateKey : todayKey()];
    return st && st.ranked ? st.streak : null;
  }

  function bannerRect() {
    const L = getLayout();
    return { left: L.x0 || 16, top: (L.bottomEdge || L.H || 700) - 70, width: L.contentW || 343 };
  }

  async function openBoard(kind) {
    const cache = S.dailyCache;
    const dateKey = cache ? cache.dateKey : todayKey();
    const b = { kind, dateKey, issueNo: cache ? cache.issueNo : 0, themeLabel: cache ? cache.themeLabel : '', state: 'loading', mode: null, selfStreak: selfStreak(), sharedCanvas: null, rowCount: 0, bannerShow: false, bannerHeight: 0 };
    c.board = b;
    c.ui.boardScroll = 0;
    ads.destroyBanner();
    if (c.screen !== 'board') go('board');
    const view = (state) => {
      b.state = state;
      track('board_view', { kind, state, mode: b.mode || undefined });
      if ((state === 'ready' || state === 'empty') && ads.bannerAllowed()) {
        if (ads.showBanner(bannerRect())) {
          b.bannerShow = true;
          b.bannerHeight = 50;
        }
      }
      invalidate();
    };
    if (kind === 'group') {
      if (c.group.status === 'checking') return view('checkingGroup');
      if (c.group.status !== 'ok') return view('noGroup');
    }
    invalidate();
    const gate = await privacy.ensureForBoard();
    if (gate.state === 'privacyDenied') return view('privacyDenied');
    if (gate.state === 'unauthorized') return view('unauthorized');
    const r = await api.getBoard({ kind, dateKey, groupRef: kind === 'group' ? c.group.groupRef : undefined });
    if (!r || !r.ok) {
      track('error', { where: 'getBoard', code: r ? r.code : 'none' });
      return view('serverError');
    }
    b.mode = r.mode;
    b.dateKey = r.dateKey;
    b.issueNo = r.issueNo;
    b.themeLabel = r.theme || b.themeLabel;
    if (!r.rows.length) return view('empty');
    const L = getLayout();
    const msg = V.boardMessage(kind, r, { groupRef: c.group.groupRef, shareTicket: c.group.shareTicket, groupid: c.group.groupid, board: L.board, dpr: L.dpr, showUnverified: config.showUnverified });
    b.rowCount = r.rows.length;
    odc.render(msg);
    b.sharedCanvas = odc.sharedCanvas();
    view('ready');
  }

  // ---------------------------------------------------------------- history

  async function openHistory() {
    c.history = { state: 'loading', items: [], bestDays: 0, bestDaily: 0 };
    go('history');
    const r = await api.getHistory({});
    if (r && r.ok) c.history = { state: r.items.length ? 'ready' : 'empty', items: r.items, bestDays: r.bestDays, bestDaily: r.bestDaily };
    else c.history = { state: !r || r.code === 'NETWORK' || r.code === 'TIMEOUT' ? 'offline' : 'error', items: [], bestDays: 0, bestDaily: 0 };
    track('history_view', { items: c.history.items.length, state: c.history.state });
    invalidate();
  }

  async function openIssue(dateKey) {
    c.issue = { state: 'loading', dateKey, data: null };
    go('issue');
    const r = await api.getHistory({ dateKey });
    if (r && r.ok) {
      c.issue = { state: 'ready', dateKey, data: r };
      track('history_issue_view', { dateKey, deckShown: !!r.deck });
    } else c.issue = { state: !r || r.code === 'NETWORK' || r.code === 'TIMEOUT' ? 'offline' : 'error', dateKey, data: null };
    invalidate();
  }

  // ---------------------------------------------------------------- entry routing (spec 7)

  async function routeEntry(e) {
    if (e.kind === 'challenge') {
      if (e.join) joinGroupFor(e);
      return openChallenge(e.challengeId);
    }
    if (e.kind === 'result') {
      if (e.join) await joinGroupFor(e);
      return;
    }
    if (e.kind === 'fallbackShare') return track('error', { where: 'entry', code: 'wxad_fallback_share' }); // grants nothing
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

  /** Cold start or warm start with enter options. */
  function handleEntry(options, cold) {
    const e = parseEnter(options);
    if (e.kind === 'none') return e;
    const key = JSON.stringify([options.query, options.shareTicket, options.scene]);
    if (key === c.lastEntryKey && now() - c.lastEntryAt < 3000) return e;
    c.lastEntryKey = key;
    c.lastEntryAt = now();
    if (e.kind === 'result' || e.kind === 'challenge') {
      track('card_open', { cardKind: e.kind, hasShareTicket: e.hasShareTicket, challengeId: e.challengeId });
      if (cold) c.sessionFromCard = true;
    }
    // a warm start never interrupts a run: wait until home and tell the player
    if (!cold && c.screen === 'play' && e.kind === 'challenge') {
      c.pendingEntry = e;
      toast('你有一个新挑战');
      return e;
    }
    routeEntry(e);
    return e;
  }

  // ---------------------------------------------------------------- lifecycle

  c.start = function (options) {
    const t = now();
    if (!S.installId) S.installId = uuid();
    if (!S.firstDate) S.firstDate = beijingDateKey(t);
    S.lastSessionAt = t;
    const e = parseEnter(options);
    analytics.startSession({ scene: options && options.scene, fromCard: e.kind === 'challenge' ? 'challenge' : e.kind === 'result' ? 'result' : 'none', hasShareTicket: e.hasShareTicket, challengeId: e.challengeId });
    analytics.startTimer();
    if (!S.howtoSeen) c.sheets = ['howto'];
    store.save();
    share.register(() => {
      const r = c.res;
      return r && r.status === 'done' ? { mode: r.mode === 'daily' ? 'daily' : 'free', streak: r.streak, dateKey: r.dateKey, miss: missForShare(r) } : null;
    });
    handleEntry(options || {}, true);
    return refreshDaily().then(() => flushPending());
  };

  c.onShow = function (options) {
    analytics.onShow({ scene: options && options.scene, fromCard: 'none', hasShareTicket: !!(options && options.shareTicket) });
    privacy.refreshOnShow().then(() => invalidate());
    if (S.dailyCache && beijingDateKey(now() + c.dailyOffsetMs) !== S.dailyCache.dateKey && c.screen === 'home') refreshDaily();
    flushPending();
    if (c.r && c.r.phase === 'netError') retryLoad();
    if (options && (options.query || options.shareTicket)) handleEntry(options, false);
    invalidate();
  };

  c.onHide = function () {
    persistActive();
    analytics.onHide();
  };

  // ---------------------------------------------------------------- touches

  c.setScrollMax = (m) => {
    c.scrollMax = m || {};
  };

  /** Ids whose drag moves the screen's own scroll offset (vm.scrollY). */
  const SCREEN_SCROLL_IDS = ['result:scroll', 'home:scroll', 'challenge:scroll', 'history:scroll', 'issue:scroll'];

  /** Ids that only swallow taps (a card or scrim under a sheet or dialog). */
  const SWALLOW_ID = /(:block|:card)$|^sheet:body$/;

  c.onDrag = function (id, dy) {
    const max = (c.scrollMax && c.scrollMax[id]) || 0;
    const clampTo = (v) => Math.max(0, Math.min(max, v));
    if (SCREEN_SCROLL_IDS.indexOf(id) >= 0) c.ui.scrollY = clampTo(c.ui.scrollY - dy);
    else if (id === 'sheet:list') c.ui.sheetScroll = clampTo(c.ui.sheetScroll - dy);
    else if (id === 'play:cards') {
      // null = follow the phase; the first drag fixes the offset where the renderer had put it
      const from = c.ui.playScroll === null || c.ui.playScroll === undefined ? (c.r && c.r.phase !== 'awaitAnswer' && c.r.phase !== 'loading' ? max : 0) : c.ui.playScroll;
      c.ui.playScroll = clampTo(from - dy);
    }
    else if (id === 'board:list' && c.board) {
      const L = getLayout();
      const cap = (c.board.rowCount || 0) * 66 * (L.s || 1);
      c.ui.boardScroll = Math.max(0, Math.min(cap, c.ui.boardScroll - dy));
      odc.scroll(c.ui.boardScroll);
    }
    invalidate();
  };

  c.onHit = function (id) {
    const ui = c.ui;
    if (SWALLOW_ID.test(id)) return;
    if (ads.overlay) {
      if (id === 'adstub:complete') ads.stubComplete();
      else if (id === 'adstub:skip') ads.stubSkip();
      return invalidate();
    }
    if (ui.dialog) {
      if (id === 'dialog:confirm') dialogConfirm();
      else if (id === 'dialog:cancel') ui.dialog = null;
      return invalidate();
    }
    if (/^(adstub|dialog):/.test(id)) return;
    // sheets first
    const sheet = topSheet();
    if (sheet && sheetHit(sheet, id)) return;
    switch (c.screen) {
      case 'home':
        return homeHit(id);
      case 'play':
        return playHit(id);
      case 'result':
        return resultHit(id);
      case 'challenge':
        return challengeHit(id);
      case 'board':
        return boardHit(id);
      case 'history':
        return historyHit(id);
      case 'issue':
        return issueHit(id);
    }
  };

  /** Taps that belong to the open sheet. Returns true if consumed. */
  function sheetHit(sheet, id) {
    if (id === 'sheet:close') {
      if (sheet === 'continue') return declineContinue(), true;
      if (sheet === 'howto' && !S.howtoSeen) {
        S.howtoSeen = true;
        store.save();
      }
      c.sheets.pop();
      if (sheet === 'report') c.ui.report = null;
      if (sheet === 'source') c.ui.source = null;
      invalidate();
      return true;
    }
    if (sheet === 'continue') {
      if (id === 'continue:video') continueVideo();
      else if (id === 'continue:result') declineContinue();
      return true;
    }
    if (sheet === 'report') {
      if (id.indexOf('report:reason:') === 0 && c.ui.report && c.ui.report.state === 'idle') {
        const key = id.slice(14);
        c.ui.report.selected[key] = !c.ui.report.selected[key];
      } else if (id === 'report:submit') submitReport();
      else if (id === 'report:cancel') {
        c.sheets.pop();
        c.ui.report = null;
      }
      invalidate();
      return true;
    }
    if (sheet === 'source') {
      if (id === 'source:report' && c.ui.source) {
        const f = c.ui.source;
        c.sheets.pop();
        c.ui.source = null;
        const prior = S.reported[f.face.factId];
        const selected = {};
        (prior || []).forEach((k) => {
          selected[k] = true;
        });
        c.ui.report = { factId: f.face.factId, face: f.face, where: f.where, state: 'idle', selected, alreadyReported: !!prior };
        openSheet('report');
      }
      return true;
    }
    if (sheet === 'albumDenied') {
      if (id === 'save:openSetting') wx.openSetting && wx.openSetting({ success: () => {}, fail: () => {} });
      return true;
    }
    if (sheet === 'questions') {
      if (id.indexOf('report:') === 0) return openReport(id.slice(7)), true;
      if (id.indexOf('source:') === 0) return openSource(id.slice(7)), true;
      return id === 'sheet:list';
    }
    if (sheet === 'category') {
      if (id.indexOf('category:') === 0) {
        S.freeGroup = id.slice(9);
        store.save();
        track('category_select', { group: S.freeGroup });
        c.sheets.pop();
        invalidate();
      }
      return true;
    }
    if (sheet === 'howto') return true;
    if (sheet === 'sources') return true;
    if (sheet === 'settings') return settingsHit(id);
    return false;
  }

  function settingsHit(id) {
    switch (id) {
      case 'settings:sound':
        S.muted = !S.muted;
        if (deps.audio) deps.audio.setMuted(S.muted);
        store.save();
        break;
      case 'settings:largeText':
        S.largeText = !S.largeText;
        store.save();
        track('display_setting', { largeText: S.largeText, highContrast: S.highContrast, source: 'settings' });
        break;
      case 'settings:highContrast':
        S.highContrast = !S.highContrast;
        store.save();
        track('display_setting', { largeText: S.largeText, highContrast: S.highContrast, source: 'settings' });
        break;
      case 'settings:sources':
        track('source_view', { where: 'page' });
        openSheet('sources');
        break;
      case 'settings:openSetting':
        privacy.openSetting().then(() => invalidate());
        break;
      case 'settings:privacy':
        if (wx.openPrivacyContract) wx.openPrivacyContract({});
        break;
      case 'settings:feedback':
        break; // native overlay button, positioned by main.js
      default:
        return false;
    }
    invalidate();
    return true;
  }

  function homeHit(id) {
    const d = c.home.daily;
    switch (id) {
      case 'home:daily':
        if (d.state === 'available' || d.state === 'inProgress') return startDaily();
        if (d.state === 'done') return showStoredDaily();
        return;
      case 'home:retry':
        return refreshDaily();
      case 'home:free':
        return startFree('home');
      case 'home:freeResume': {
        const a = S.active;
        if (a && !a.server) beginPlayRestored(restoreFree(a));
        return;
      }
      case 'home:category':
        return openSheet('category');
      case 'home:groupBoard':
      case 'home:groupBanner':
        return openBoard('group');
      case 'home:friendBoard':
        return openBoard('friend');
      case 'home:history':
        return openHistory();
      case 'home:howto':
        return openSheet('howto');
      case 'home:settings':
        return openSheet('settings');
      case 'home:sound':
        S.muted = !S.muted;
        if (deps.audio) deps.audio.setMuted(S.muted);
        store.save();
        return invalidate();
    }
  }

  function beginPlayRestored(r) {
    c.coach = 0;
    c.r = r;
    c.res = null;
    go('play');
    if (r.run.status === 'ended') {
      // the app was killed during a miss: continue from the miss
      r.phase = 'miss';
      r.phaseAt = now() - MISS_MS;
      r.q = questionPayload(r.deck.questions[r.run.k - 1], content.byId);
      return;
    }
    showFreeQuestion(r);
    r.phase = 'awaitAnswer';
    invalidate();
  }

  function showStoredDaily() {
    const key = S.dailyCache.dateKey;
    const st = S.results[key];
    let res;
    if (st) res = strip(st);
    else if (S.dailyCache.myResult) {
      const m = S.dailyCache.myResult;
      res = { mode: 'daily', ranked: true, friendly: false, status: 'done', headerText: '今日一比 · 第' + S.dailyCache.issueNo + '期' + V.themeSuffix(S.dailyCache.themeLabel), issueNo: S.dailyCache.issueNo, themeLabel: S.dailyCache.themeLabel, dateKey: key, streak: m.n, lifeUsed: false, cleared: m.endReason === 'cleared', endReason: m.endReason, deckLength: config.deckLen.daily, rarityShare: m.rarity ? m.rarity.share : null, dayStreak: S.dailyCache.myDays ? S.dailyCache.myDays.current : 0, questions: [], miss: null, challengeCompare: null, finalizedByWindow: m.endReason === 'window', deckKind: 'daily' };
    } else return;
    res.status = 'done';
    res.tracked = true;
    c.r = null;
    showResult(res);
  }

  function playHit(id) {
    const r = c.r;
    if (!r) return;
    if (id === 'back') return back();
    if (id === 'coach:skip') {
      endCoach();
      return invalidate();
    }
    if (id === 'answer:hi') return onAnswer('hi');
    if (id === 'answer:lo') return onAnswer('lo');
    if (id === 'play:retry') return retryLoad();
    if (id === 'play:cards' || id === 'play:continue') return skipForward();
    if (id.indexOf('report:') === 0) return openReport(id.slice(7));
    if (id.indexOf('source:') === 0) return openSource(id.slice(7));
  }

  /** A tap on the card area skips the count-up / the pause after an outcome. */
  function skipForward() {
    const r = c.r;
    if (!r) return;
    if (r.phase === 'revealing') return finishReveal();
    if (r.phase === 'correct') return advance();
    if (r.phase === 'segmentChange') return setPhase(r, 'awaitAnswer');
    if (r.phase === 'miss') return afterMiss();
    if (r.phase === 'cleared') return endRun('cleared');
  }

  function resultHit(id) {
    const res = c.res;
    if (!res) return;
    switch (id) {
      case 'result:back':
        c.r = null;
        return goHome();
      case 'result:retry':
        return retryResult();
      case 'result:again':
        if (res.mode === 'free') ads.interstitial({ mode: 'free', sessionFreeRuns: c.sessionFreeRuns, lifetimeRuns: S.lifetimeRuns, fromCardFirstRun: c.sessionFromCard && S.lifetimeRuns <= 1 }); // never awaited: does not delay
        c.r = null;
        return startFree('replay');
      case 'result:share':
        return share.shareResult({ mode: res.mode === 'daily' ? 'daily' : 'free', streak: res.streak, dateKey: res.dateKey, runId: res.runId, miss: missForShare(res), card: V.cardVm(res) });
      case 'result:challenge':
        return startChallengeShare(res);
      case 'result:save':
        return saveImage();
      case 'result:questions':
        c.ui.sheetScroll = 0;
        return openSheet('questions');
      case 'result:board':
        return openBoard(c.group.status === 'ok' ? 'group' : 'friend');
      case 'result:subscribe':
        return requestSubscribe(c.ui.subscribe.challengeId, (s) => {
          c.ui.subscribe.state = s;
          invalidate();
        });
    }
    if (id.indexOf('report:') === 0) return openReport(id.slice(7));
    if (id.indexOf('source:') === 0) return openSource(id.slice(7));
  }

  async function retryResult() {
    const res = c.res;
    if (!res || res.status === 'done') return;
    res.status = 'finalizing';
    invalidate();
    await refreshDaily();
    const cache = S.dailyCache;
    if (cache && cache.myStatus === 'done' && cache.myResult) {
      res.status = 'done';
      res.streak = cache.myResult.n;
      res.endReason = cache.myResult.endReason;
      res.rarityShare = cache.myResult.rarity ? cache.myResult.rarity.share : null;
    } else res.status = 'pendingNetwork';
    invalidate();
  }

  function challengeHit(id) {
    const ch = c.challenge;
    switch (id) {
      case 'challenge:accept':
        return acceptChallenge();
      case 'challenge:home':
        return goHome();
      case 'challenge:retry':
        return openChallenge(ch.id);
      case 'challenge:free':
        goHome();
        return startFree('home');
      case 'challenge:daily':
        goHome();
        return c.home.daily.state === 'available' || c.home.daily.state === 'inProgress' ? startDaily() : undefined;
      case 'challenge:compare':
        return compareFromChallenge();
      case 'challenge:subscribe':
        return requestSubscribe(ch.id, (s) => {
          c.challenge.subscribe = { state: s };
          invalidate();
        });
    }
  }

  function boardHit(id) {
    const b = c.board;
    switch (id) {
      case 'board:back':
        ads.destroyBanner();
        c.screen = c.prev === 'board' ? 'home' : c.prev;
        if (c.screen === 'play' || (c.screen === 'result' && !c.res) || c.screen === 'challenge') c.screen = 'home';
        if (c.screen === 'home') goHome();
        c.sheets = [];
        return invalidate();
      case 'board:retry':
        return openBoard(b.kind);
      case 'board:goPlay':
        goHome();
        if (c.home.daily.state === 'available' || c.home.daily.state === 'inProgress') startDaily();
        return;
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

  function historyHit(id) {
    if (id === 'history:back') return goHome();
    if (id === 'history:retry') return openHistory();
    if (id.indexOf('history:item:') === 0) return openIssue(id.slice(13));
  }

  function issueHit(id) {
    if (id === 'issue:back') return openHistory();
    if (id === 'issue:retry') return openIssue(c.issue.dateKey);
    if (id.indexOf('report:') === 0) return openReport(id.slice(7));
    if (id.indexOf('source:') === 0) return openSource(id.slice(7));
  }

  // ---------------------------------------------------------------- rendering state

  /** Called every frame: advances time-driven transitions. */
  c.tick = function (t) {
    const r = c.r;
    if (c.screen === 'play' && r && !c.ui.dialog && !topSheet()) {
      const dt = t - r.phaseAt;
      if (r.phase === 'revealing' && dt >= REVEAL_MS) finishReveal();
      else if (r.phase === 'correct' && dt >= CORRECT_MS) advance();
      else if (r.phase === 'segmentChange' && dt >= SEGMENT_MS) setPhase(r, 'awaitAnswer');
      else if (r.phase === 'miss' && dt >= MISS_MS) afterMiss();
      else if (r.phase === 'cleared' && dt >= CLEARED_MS) endRun('cleared');
    }
    if (c.ui.toast && t >= c.ui.toast.until) c.ui.toast = null;
  };

  c.animating = function () {
    if (ads.overlay || c.ui.toast) return true;
    const r = c.r;
    if (c.screen === 'play' && r && ['loading', 'sending', 'revealing', 'correct', 'segmentChange', 'miss', 'cleared'].indexOf(r.phase) >= 0) return true;
    if (c.screen === 'home' && c.home.daily.state === 'loading') return true;
    if (c.screen === 'result' && c.res && (c.res.status === 'finalizing' || c.res.status === 'pendingNetwork')) return true;
    if (c.screen === 'board' && c.board && (c.board.state === 'loading' || c.board.state === 'checkingGroup')) return true;
    if (c.screen === 'challenge' && c.challenge && c.challenge.status === 'loading') return true;
    if ((c.screen === 'history' && c.history.state === 'loading') || (c.screen === 'issue' && c.issue && c.issue.state === 'loading')) return true;
    return false;
  };

  function sheetVmFor(kind) {
    const r = c.r;
    switch (kind) {
      case 'howto':
        return V.howtoVm();
      case 'sources':
        return V.sourcesVm();
      case 'settings':
        return V.settingsVm(S, { album: c.ui.saveState === 'denied' ? 'denied' : 'unknown', friendBoardEnabled: privacy.friendBoardEnabled() });
      case 'category':
        return V.categoryVm(offeredFreeGroup(), countByGroup(content), config.freeGroupMinFacts);
      case 'continue':
        return V.continueSheetVm(r, c.ui.adState, r && J.canUseLife(r.run));
      case 'source':
        return c.ui.source ? V.sourceSheetVm(c.ui.source.face, true) : null;
      case 'report':
        return c.ui.report ? V.reportVm(c.ui.report, config.reportReasons) : null;
      case 'albumDenied':
        return { text: '保存图片需要相册权限', openLabel: '去设置', cancelLabel: '取消' };
      default:
        return null;
    }
  }

  c.view = function (t) {
    t = t === undefined ? now() : t;
    c.tick(t);
    const display = V.displayVm(S);
    const sheet = topSheet();
    const sheetVm = sheet ? sheetVmFor(sheet) : null;
    let vm;
    switch (c.screen) {
      case 'home': {
        const a = S.active;
        const resume = a && !a.server && a.answers.length ? '继续上局 · 已连对 ' + (a.streak || 0) : null;
        vm = V.homeVm(c.home.daily, {
          free: { categoryKey: offeredFreeGroup(), categoryLabel: groupLabel(offeredFreeGroup()), bestText: S.bestFree > 0 ? '随便比比最佳 ' + S.bestFree : null, resumeText: resume },
          hasGroupContext: c.group.status === 'ok', muted: S.muted, showHowToOnce: sheet === 'howto' && !S.howtoSeen, friendBoardEnabled: privacy.friendBoardEnabled(),
          sheet, sheetVm, display, t,
        });
        vm.scrollY = c.ui.scrollY;
        break;
      }
      case 'play': {
        const r = c.r;
        if (!r) {
          c.screen = 'home';
          return c.view(t);
        }
        const revealT = r && r.phase === 'revealing' ? Math.min(1, (t - r.phaseAt) / REVEAL_MS) : 0;
        vm = V.playVm(r, { revealT, sheet, sheetVm, coach: c.coach, categoryLabel: groupLabel(r.group), display, muted: S.muted, t });
        if (typeof c.ui.playScroll === 'number') vm.scrollY = c.ui.playScroll;
        break;
      }
      case 'result':
        vm = V.resultVm(c.res, { sheet, sheetVm, scrollY: c.ui.scrollY, display, saveState: c.ui.saveState, subscribeState: c.ui.subscribe.state, subscribeChallengeId: c.ui.subscribe.challengeId, t });
        break;
      case 'challenge':
        vm = V.challengeVm(c.challenge, { display, t });
        vm.scrollY = c.ui.scrollY;
        break;
      case 'board':
        vm = V.boardVm(Object.assign({}, c.board, { display, t }));
        break;
      case 'history':
        vm = V.historyVm(c.history, display);
        vm.scrollY = c.ui.scrollY;
        break;
      case 'issue':
        vm = V.issueVm(c.issue, display);
        vm.scrollY = c.ui.scrollY;
        vm.sheet = sheet;
        vm.sheetVm = sheetVm;
        break;
    }
    if (c.screen === 'board') {
      vm.sheet = null;
      vm.sheetVm = null;
    }
    vm.sheetScroll = c.ui.sheetScroll;
    if (sheet === 'questions' && vm.questions) vm.sheetVm = { questions: vm.questions };
    const overlay = {};
    if (c.ui.dialog) overlay.dialog = { text: c.ui.dialog.text, confirmLabel: c.ui.dialog.confirmLabel, cancelLabel: c.ui.dialog.cancelLabel, danger: !!c.ui.dialog.danger };
    if (c.ui.toast) overlay.toast = { text: c.ui.toast.text };
    if (ads.overlay) overlay.adStub = { kind: ads.overlay.kind, secondsLeft: Math.max(0, Math.ceil((ads.overlay.durationMs - (t - ads.overlay.startedAt)) / 1000)) };
    return { screen: c.screen, vm, overlay };
  };

  c.state = c;
  return c;
}

module.exports = { createController, REVEAL_MS, CORRECT_MS, SEGMENT_MS, MISS_MS, CLEARED_MS };
