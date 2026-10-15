/**
 * Game controller: the state machine behind every screen. Renderer-agnostic:
 * it builds view models (js/vm.js), the renderers draw them and return hit
 * areas, and touches come back here as hit ids (js/render/CONTRACT.md).
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
 * Screens: home, draft, result, challenge, board.
 * Free play runs fully on the client (seed, simulation, 复盘). Daily and
 * challenge runs send actions to the server (api.submitRun) and display what
 * it returns; the daily client never sees a seed.
 */

const { SLOTS } = require('../core/content');
const draft = require('../core/draft');
const { simulate, moraleOf } = require('../core/sim');
const { bestLineup, enumerateSets } = require('../core/search');
const { randomSeed } = require('../core/rng');
const { bandFor } = require('../core/config');
const { beijingDateKey, issueNo: issueNoOf, dateKeyToMs, DAY_MS } = require('../core/date');
const { lineupDetail, commentFor } = require('../core/score');
const { parseEnter } = require('./share');
const V = require('./vm');
const A = require('./core-adapter');
const { normalizeFeatures } = require('./features');
const { uuid } = require('./util');

const FLIP_MS = 1200;
const REVEAL_MS = 700;
const STAMP_MS = 600;
const PRIMARY_DEBOUNCE_MS = 300;
const TOAST_MS = 2400;
const SHIREN_STEP_MS = 300;
const LARGE_FONT_SETTING = 18; // wx font size setting at or above this pre-selects 大字模式 on first launch (spec 8.10, E12)

function createController(deps) {
  const { wx, api, store, analytics, ads, share, privacy, odc, config, content } = deps;
  const subscribe = deps.subscribe;
  const album = deps.album;
  const build = deps.build || {};
  const now = deps.now || (() => Date.now());
  const invalidate = deps.invalidate || (() => {});
  const getLayout = deps.getLayout || (() => ({ board: { x: 16, y: 120, w: 343, h: 400 }, s: 1, dpr: 1 }));
  const cvNum = content.contentVersion;
  // the renderer owns the board / banner geometry (render/layout.js boardRect, bannerRect); fallbacks for the stub renderer
  const boardRectOf = deps.boardRect || ((L) => L.board);
  const bannerRectOf = deps.bannerRect || ((L, b) => (b && b.show && b.reservedHeight > 0 ? { x: 16, y: (L.bottomEdge || L.H || 0) - b.reservedHeight, w: (L.W || 375) - 32, h: b.reservedHeight } : null));
  const S = store.state;
  let audioRevealStart = 0;

  const c = {
    screen: 'home',
    prev: 'home',
    home: { daily: { state: 'loading' }, sheet: null },
    group: { status: 'none', groupRef: null, shareTicket: null, groupid: null, errCode: undefined },
    r: null, // current run context
    ui: { selectedId: null, poolScroll: 0, flipStart: 0, coach: 0, adState: 'idle', dialog: null, toast: null, sheet: null, sheetScroll: 0, scrollY: 0, replayAdState: 'idle', boardScroll: 0 },
    res: null,
    challenge: null,
    board: null,
    sessionFreeRuns: 0,
    pendingEntry: null,
    scrollMax: {},
    lastPrimaryAt: 0,
    submits: {}, // clientRunId -> promise of the free-run submit
    dailyOffsetMs: 0,
    features: normalizeFeatures(null, config, build), // remote app_config via getDaily; safe defaults offline (spec 18.32)
    history: { state: 'loading', items: [], bestStreak: 0 },
    issueKey: null,
    shown: {}, // once-per-session analytics (streak_shown, subscribe_offer)
  };
  ads.setInterstitialConfig(c.features.interstitial);

  // ---------------------------------------------------------------- helpers

  const track = (n, p) => analytics.track(n, p);
  const toast = (text) => {
    c.ui.toast = { text, until: now() + TOAST_MS };
    invalidate();
  };
  const go = (screen) => {
    c.prev = c.screen;
    c.screen = screen;
    invalidate();
  };
  const todayKey = () => beijingDateKey(now() + c.dailyOffsetMs);

  function persistActive() {
    const r = c.r;
    if (!r || r.mode === 'free') return;
    S.active = { mode: r.mode, clientRunId: r.clientRunId, dateKey: r.dateKey, issueNo: r.issueNo, challengeId: r.challengeId || null, rounds: r.rounds, actions: r.run.actions.slice(), startedAt: r.startedAt, started: r.started, startLogged: r.startLogged, countsAsDaily: !!r.countsAsDaily, dailySeed: !!r.dailySeed, progressive: !!r.progressive, variant: r.variant };
    store.save();
  }

  /**
   * opts.progressive: tokens arrive round by round (PO-8); `rounds` then holds only the released ones.
   * opts.variant: 'shiren' hides the 五德 until the verdict (daily and challenge runs on a shiren daily seed only).
   */
  function newRunCtx(opts) {
    const progressive = !!opts.progressive;
    const rounds = opts.rounds ? opts.rounds.slice() : progressive ? [] : null;
    const run = draft.createRun({ seed: opts.seed || 0, contentVersion: cvNum, configVersion: config.configVersion, mode: opts.mode, rounds });
    const variant = opts.mode !== 'free' && opts.variant === 'shiren' ? 'shiren' : 'standard';
    return {
      run,
      mode: opts.mode,
      clientRunId: opts.clientRunId || uuid(),
      seed: opts.seed,
      dateKey: opts.dateKey || null,
      issueNo: opts.issueNo || null,
      challengeId: opts.challengeId || null,
      rounds: run.rounds,
      started: false,
      startLogged: false,
      startedAt: 0,
      source: opts.source || 'home',
      countsAsDaily: !!opts.countsAsDaily,
      dailySeed: !!opts.dailySeed,
      progressive,
      variant,
      hidden: variant === 'shiren',
      roundFetch: 'idle',
    };
  }

  // ---------------------------------------------------------------- display settings (spec 8.10)

  function display() {
    return S.display || { largeText: false, highContrast: false };
  }

  function setDisplay(patch, source) {
    S.display = Object.assign({}, display(), patch);
    store.save();
    track('display_setting', { largeText: S.display.largeText, highContrast: S.display.highContrast, source: source || 'user' });
    if (deps.relayout) deps.relayout();
    invalidate();
  }

  /** First launch only: pre-select 大字模式 when the system font setting is large (no prompt). */
  function initDisplay() {
    if (S.display) return;
    let big = false;
    try {
      const info = (wx.getAppBaseInfo && wx.getAppBaseInfo()) || (wx.getSystemInfoSync && wx.getSystemInfoSync()) || {};
      big = (info.fontSizeSetting || 0) >= LARGE_FONT_SETTING;
    } catch (e) {
      big = false;
    }
    S.display = { largeText: big, highContrast: false };
    store.save();
    if (big) track('display_setting', { largeText: true, highContrast: false, source: 'auto_first_launch' });
    if (deps.relayout) deps.relayout();
  }

  /** Apply getDaily.features (or the safe defaults) everywhere they matter. */
  function applyFeatures(raw) {
    c.features = normalizeFeatures(raw, config, build);
    ads.setInterstitialConfig(c.features.interstitial);
  }

  function beginDraft(r) {
    c.r = r;
    c.ui.selectedId = null;
    c.ui.poolScroll = 0;
    c.ui.flipStart = 0;
    c.ui.adState = 'idle';
    c.ui.dialog = null;
    c.ui.albumDenied = false;
    c.ui.coach = !S.coachSeen && S.lifetimeRuns === 0 && r.mode !== 'challenge' ? 1 : 0;
    c.res = null;
    go('draft');
  }

  function restoreActive() {
    const a = S.active;
    if (!a) return null;
    const r = newRunCtx({ mode: a.mode, rounds: a.rounds, clientRunId: a.clientRunId, dateKey: a.dateKey, issueNo: a.issueNo, challengeId: a.challengeId, countsAsDaily: a.countsAsDaily, dailySeed: a.dailySeed, progressive: a.progressive, variant: a.variant });
    for (const act of a.actions) draft.apply(r.run, act);
    r.started = a.started;
    r.startLogged = a.startLogged;
    r.startedAt = a.startedAt;
    return r;
  }

  // ---------------------------------------------------------------- daily / home

  function bandLabelOf(w) {
    return bandFor(config, w).label;
  }

  function setDailyFromState() {
    const cache = S.dailyCache;
    if (!cache) return;
    const key = cache.dateKey;
    const base = { issueNo: cache.issueNo, dateKey: key, variant: cache.variant || 'standard', streak: cache.myStreak || { current: 0 } };
    const done = S.results[key] && S.results[key].dailyDone;
    if (done) {
      const rec = S.results[key].record;
      c.home.daily = Object.assign(base, { state: 'done', record: rec, bandLabel: S.results[key].band.label });
    } else if (cache.myStatus === 'done' && cache.myRecord) {
      c.home.daily = Object.assign(base, { state: 'done', record: cache.myRecord, bandLabel: bandLabelOf(cache.myRecord.w) });
    } else if (S.pending && S.pending.mode === 'daily' && S.pending.dateKey === key) {
      c.home.daily = Object.assign(base, { state: 'pendingSubmit' });
    } else if (S.active && S.active.mode === 'daily' && S.active.dateKey === key) {
      const rr = c.r && c.r.clientRunId === S.active.clientRunId ? c.r : restoreActive();
      c.home.daily = Object.assign(base, { state: 'inProgress', round: rr ? rr.run.round : 1 });
    } else {
      c.home.daily = Object.assign(base, { state: 'available' });
    }
  }

  async function refreshDaily() {
    c.home.daily = Object.assign({}, c.home.daily, { state: 'loading' });
    invalidate();
    const r = await api.getDaily({});
    if (r && r.ok) {
      c.dailyOffsetMs = r.serverNow - now();
      // v1: no rounds here (progressive delivery); status, variant, streak and the remote feature config
      S.dailyCache = { dateKey: r.dateKey, issueNo: r.issueNo, offsetMs: c.dailyOffsetMs, myStatus: r.myStatus, myRecord: r.myRecord, variant: r.variant === 'shiren' ? 'shiren' : 'standard', myStreak: r.myStreak || { current: 0, best: 0 } };
      applyFeatures(r.features);
      store.save();
      setDailyFromState();
    } else {
      applyFeatures(null); // spec 18.32: config unreadable -> subscribe hidden, banner off, interstitial defaults
      const active = S.active && S.active.mode === 'daily' ? S.active : null;
      const net = !r || r.code === 'NETWORK' || r.code === 'TIMEOUT';
      if (active && active.dateKey === todayKey()) {
        c.home.daily = { state: 'inProgress', issueNo: active.issueNo, dateKey: active.dateKey, round: restoreActive().run.round, variant: active.variant || 'standard', streak: S.dailyCache && S.dailyCache.dateKey === active.dateKey ? S.dailyCache.myStreak : { current: 0 } };
      } else {
        c.home.daily = { state: net ? 'offline' : 'error', issueNo: S.dailyCache ? S.dailyCache.issueNo : 0, dateKey: todayKey() };
      }
      track('error', { where: 'getDaily', code: r ? r.code : 'none' });
    }
    invalidate();
  }

  function startDaily() {
    const cache = S.dailyCache;
    if (!cache) return;
    // the first 翻令 calls startRun, which returns round 1 (progressive delivery)
    const r = newRunCtx({ mode: 'daily', progressive: true, variant: cache.variant, dateKey: cache.dateKey, issueNo: cache.issueNo, source: 'home' });
    beginDraft(r);
  }

  function resumeDaily() {
    const r = restoreActive();
    if (!r) return startDaily();
    beginDraft(r);
    c.ui.coach = 0;
    // a restored run in 'placed' of a non-final round shows the same screen as before
    if (r.progressive && r.startLogged) resyncProgress(r); // best-effort: adopt rounds/actions the server holds (second device, reinstall)
  }

  function startFree(source) {
    const seed = randomSeed();
    const r = newRunCtx({ mode: 'free', seed, rounds: null, source: source || 'home' });
    beginDraft(r);
  }

  // ---------------------------------------------------------------- draft actions

  function act(a) {
    const r = c.r;
    const res = draft.apply(r.run, Object.assign({ round: r.run.round }, a));
    if (res.ok) persistActive();
    return res;
  }

  function onFirstFlip() {
    const r = c.r;
    if (r.started) return;
    r.started = true;
    r.startedAt = now();
    track('run_start', { runId: r.clientRunId, mode: r.mode, source: r.source, variant: r.variant });
    if (r.mode !== 'free' && !r.progressive) {
      api.startRun({ mode: r.mode === 'challenge' ? 'challenge' : 'daily', clientRunId: r.clientRunId, dateKey: r.dateKey, challengeId: r.challengeId || undefined }).then((x) => {
        if (x && x.ok) {
          r.startLogged = true;
          persistActive();
        }
      });
    }
  }

  function finishFlip() {
    const r = c.r;
    const res = act({ type: 'flip' });
    if (!res.ok) return;
    onFirstFlip();
    persistActive();
    c.ui.flipStart = now();
    c.ui.selectedId = null;
    c.ui.poolScroll = 0;
    if (deps.audio) deps.audio.play('flip');
    void r;
    invalidate();
  }

  function doFlip() {
    const r = c.r;
    // progressive delivery (PO-8): the round arrives from the server; only then can it be flipped
    if (r.progressive && r.rounds.length < r.run.round) return fetchRound();
    finishFlip();
  }

  /** Merge what the server holds (rounds released, frozen actions) into the run. Returns true if the run jumped ahead. */
  function adoptProgress(r, resp) {
    if (!resp) return false;
    if (resp.clientRunId && resp.clientRunId !== r.clientRunId && resp.resumed) r.clientRunId = resp.clientRunId;
    const rounds = resp.rounds || [];
    for (let i = 0; i < rounds.length; i++) if (!r.rounds[i]) r.rounds[i] = rounds[i];
    if (resp.actions && resp.actions.length > r.run.actions.length) {
      const rb = A.replayInto({ seed: 0, contentVersion: cvNum, configVersion: config.configVersion, mode: r.mode, rounds: r.rounds.slice() }, resp.actions);
      if (rb.ok) {
        r.run = rb.run;
        r.rounds = rb.run.rounds;
        r.started = true;
        r.startedAt = r.startedAt || now();
        return true;
      }
    }
    return false;
  }

  /** Reconnect resync on resume (spec 18.28). Never blocks play. */
  function resyncProgress(r) {
    api.startRun({ mode: r.mode === 'challenge' ? 'challenge' : 'daily', clientRunId: r.clientRunId, dateKey: r.dateKey, challengeId: r.challengeId || undefined }).then((x) => {
      if (x && x.ok && c.r === r) {
        adoptProgress(r, x);
        persistActive();
        invalidate();
      }
    });
  }

  /**
   * Fetch the next round of a progressive daily: startRun for round 1, getRound afterwards.
   * Failure leaves the tokens face down with 令牌传递中断 + 重试 (roundFetch 'failed').
   */
  async function fetchRound() {
    const r = c.r;
    if (r.roundFetch === 'loading') return;
    const round = r.run.round;
    r.roundFetch = 'loading';
    invalidate();
    const t0 = now();
    const first = round === 1 && !r.startLogged;
    const resp = first
      ? await api.startRun({ mode: r.mode === 'challenge' ? 'challenge' : 'daily', clientRunId: r.clientRunId, dateKey: r.dateKey, challengeId: r.challengeId || undefined })
      : await api.getRound({ clientRunId: r.clientRunId, dateKey: r.dateKey, actions: r.run.actions.slice() });
    const ms = now() - t0;
    if (c.r !== r) return;
    let result = 'ok';
    let ok = !!(resp && resp.ok);
    if (!ok) result = resp && resp.code === 'INVALID_ACTIONS' ? 'invalid' : resp && resp.code === 'TIMEOUT' ? 'timeout' : 'offline';
    track('round_fetch', { runId: r.clientRunId, round, result, ms });
    if (ok) {
      if (first) {
        r.startLogged = true;
        const jumped = adoptProgress(r, resp);
        if (jumped) {
          r.roundFetch = 'idle';
          persistActive();
          return invalidate();
        }
      } else if (resp.data) {
        r.rounds[(resp.round || round) - 1] = resp.data;
      }
      ok = r.rounds.length >= round;
    }
    if (!ok) {
      r.roundFetch = 'failed';
      if (result === 'invalid') resyncProgress(r); // re-sync from the server copy (spec 14.4)
      track('error', { where: first ? 'startRun' : 'getRound', code: resp ? resp.code : 'none' });
      return invalidate();
    }
    r.roundFetch = 'idle';
    persistActive();
    finishFlip();
  }

  function onPrimary() {
    const t = now();
    if (t - c.lastPrimaryAt < PRIMARY_DEBOUNCE_MS) return;
    c.lastPrimaryAt = t;
    const r = c.r;
    if (r.roundFetch === 'loading') return;
    if (r.roundFetch === 'failed') return fetchRound();
    if (r.run.phase === 'awaitFlip') return doFlip();
    if (r.run.phase === 'placed') {
      if (draft.isComplete(r.run)) return march();
      draft.nextRound(r.run);
      persistActive();
      c.ui.selectedId = null;
      invalidate();
    }
  }

  function flipping() {
    return c.ui.flipStart && now() - c.ui.flipStart < FLIP_MS;
  }

  function slotTap(slot) {
    const r = c.r;
    if (!c.ui.selectedId || r.run.phase !== 'flipped') return;
    const gid = c.ui.selectedId;
    const pickFaction = r.run.token ? r.run.token.faction : undefined;
    const poolSize = draft.currentPool(r.run).length;
    const poolTotal = A.poolTotal(r.run);
    const res = act({ type: 'pick', generalId: gid, slot });
    if (!res.ok) return toast('这个位置已有将领');
    const gi = content.indexOf[gid];
    const score = content.roleScores[gi][SLOTS.indexOf(slot)];
    track('draft_pick', { runId: r.clientRunId, round: r.run.round, generalId: gid, slot, fit: score >= 7.5 ? 'good' : score >= 5.5 ? 'ok' : 'bad', pickFaction, poolSize, poolTotal });
    c.ui.selectedId = null;
    if (r.hidden && !S.shirenCoachSeen) {
      S.shirenCoachSeen = true;
      store.save();
    }
    if (c.ui.coach === 3) endCoach();
    invalidate();
  }

  function undo() {
    const r = c.r;
    const rd = r.run.round;
    const res = act({ type: 'undo' });
    if (res.ok) track('draft_undo', { runId: r.clientRunId, round: rd });
    invalidate();
  }

  function respin(dim, source) {
    const r = c.r;
    const res = act({ type: dim === 'faction' ? 'respinFaction' : 'respinEra', source });
    if (!res.ok) {
      if (res.reason === 'NO_ALT') toast('此令无可换');
      return false;
    }
    track('respin', { runId: r.clientRunId, round: r.run.round, dim, src: source });
    c.ui.selectedId = null;
    c.ui.poolScroll = 0;
    invalidate();
    return true;
  }

  async function respinAd(dim) {
    const r = c.r;
    if (r.mode !== 'free' || c.ui.adState !== 'idle' || r.run.phase !== 'flipped') return;
    const info = draft.respinInfo(r.run, dim);
    if (info.nextSource !== 'ad') return toast(info.hint || '此令无可换');
    if (info.target === null) return toast('此令无可换');
    c.ui.adState = 'loading';
    invalidate();
    const out = await ads.rewarded('respin', r.clientRunId);
    c.ui.adState = 'idle';
    if (out.toast) toast(out.toast);
    if (out.granted && c.r === r && r.run.phase === 'flipped') respin(dim, 'ad');
    invalidate();
  }

  function endCoach() {
    c.ui.coach = 0;
    S.coachSeen = true;
    store.save();
  }

  function back() {
    const r = c.r;
    if (!r || !r.started) {
      c.r = null;
      return goHome();
    }
    c.ui.dialog =
      r.mode === 'free'
        ? { text: '放弃本局？', confirmLabel: '放弃', cancelLabel: '继续点将', danger: true, action: 'abandon' }
        : { text: '本局已开始，进度会保留，可稍后继续', confirmLabel: '先回首页', cancelLabel: '继续点将', action: 'leave' };
    invalidate();
  }

  function dialogConfirm() {
    const d = c.ui.dialog;
    c.ui.dialog = null;
    c.ui.albumDenied = false;
    if (!d) return;
    if (d.action === 'abandon') {
      const r = c.r;
      if (r && r.started) track('run_abandon', { runId: r.clientRunId, mode: r.mode, round: r.run.round });
      c.r = null;
      goHome();
    } else if (d.action === 'leave') {
      goHome();
    } else if (d.action === 'retryLate') {
      goHome();
    }
    invalidate();
  }

  function goHome() {
    c.ui.sheet = null;
    c.ui.dialog = null;
    c.ui.albumDenied = false;
    c.ui.homeScroll = 0;
    c.screen = 'home';
    setDailyFromState();
    if (c.pendingEntry) {
      const e = c.pendingEntry;
      c.pendingEntry = null;
      routeEntry(e);
    }
    invalidate();
  }

  // ---------------------------------------------------------------- march / results

  function lineupOfRun(r) {
    return draft.lineupOf(r.run).map((e) => (e.faction ? { slot: e.slot, generalId: e.generalId, faction: e.faction } : { slot: e.slot, generalId: e.generalId }));
  }

  function shareNamesOf(lineup) {
    let hi = null;
    let lo = null;
    for (const e of lineup) {
      const st = content.byId[e.generalId].stats;
      const tot = st.zhi + st.xin + st.ren + st.yong + st.yan;
      if (!hi || tot > hi.tot) hi = { tot, name: content.byId[e.generalId].name };
      if (!lo || tot < lo.tot) lo = { tot, name: content.byId[e.generalId].name };
    }
    return [hi.name, lo.name];
  }

  function moraleFor(lineup) {
    const ids = SLOTS.map((s) => lineup.find((e) => e.slot === s).generalId);
    const gIdx = ids.map((id) => content.indexOf[id]);
    // cohesion counts the faction of the cell each general was drafted from (spec 3.2); old entries have none
    const facs = SLOTS.map((s) => lineup.find((e) => e.slot === s).faction);
    return moraleOf(content, config, gIdx, content.roleScores[gIdx[0]][0], facs.every(Boolean) ? facs : undefined);
  }

  function makeResult(r, o) {
    const lineup = o.lineup;
    const res = {
      mode: r.mode,
      status: o.status,
      runId: r.clientRunId,
      dateKey: r.dateKey,
      issueNo: r.issueNo,
      challengeId: r.challengeId,
      dailySeed: !!r.dailySeed,
      record: o.record || null,
      band: o.band || null,
      battles: o.battles || [],
      events: o.events || [],
      lineup,
      lineupDetail: lineupDetail(content, lineup),
      morale: lineup ? moraleFor(lineup) : null,
      comment: o.record ? commentFor(content, lineup, o.record.w) : '',
      rarity: o.rarity || null,
      ranked: !!o.ranked,
      rarityText: null,
      replay: { unlocked: false, best: null },
      challenge: o.challenge || null,
      finalTokens: r.run.finalTokens.map((t) => (t ? { faction: t.faction, era: t.era } : null)),
      seed: r.mode === 'free' ? r.seed : undefined,
      privacyNote: false,
      interstitialDue: false,
      tracked: false,
      startedAt: r.startedAt,
      shareNames: lineup ? shareNamesOf(lineup) : null,
      // v1
      variant: o.variant || r.variant,
      shiren: (o.variant || r.variant) === 'shiren' && r.mode !== 'free',
      lineupFac: o.lineupFac || A.draftedFactions(r.run),
      multiPicks: o.multiPicks !== undefined ? o.multiPicks : A.multiAppearancePicks(r.run),
      reveal: null,
      streak: null,
      saveState: 'idle',
      subscribe: { state: 'hidden', challengeId: null },
    };
    if (res.record) res.rarityText = V.rarityText(res, config);
    return res;
  }

  function showResult(res, reveal) {
    c.res = res;
    c.ui.sheet = null;
    c.ui.sheetScroll = 0;
    c.ui.scrollY = 0;
    c.ui.replayAdState = 'idle';
    c.ui.revealStart = reveal ? now() : 0;
    c.ui.doneAt = reveal ? 0 : now() - STAMP_MS;
    if (res.status === 'revealing' && !reveal) res.status = 'done';
    go('result');
  }

  /** 出征 */
  async function march() {
    const r = c.r;
    const lineup = lineupOfRun(r);
    if (r.mode === 'free') {
      const sim = simulate(lineup, r.seed, cvNum, config.configVersion);
      const res = makeResult(r, { status: 'revealing', lineup, record: sim.record, band: { key: sim.band.key, label: sim.band.label }, battles: sim.battles, events: sim.events });
      S.lifetimeRuns++;
      c.sessionFreeRuns++;
      res.interstitialDue = ads.interstitialDue({ mode: 'free', sessionFreeRuns: c.sessionFreeRuns, lifetimeRuns: S.lifetimeRuns });
      store.save();
      // best-effort server copy (analytics, and the base for challenges)
      c.submits[r.clientRunId] = api.submitRun({ clientRunId: r.clientRunId, mode: 'free', seed: r.seed, actions: r.run.actions, clientRecord: sim.record });
      showResult(res, true);
      return;
    }
    const pending = { mode: r.mode, clientRunId: r.clientRunId, dateKey: r.dateKey, issueNo: r.issueNo, challengeId: r.challengeId, rounds: r.rounds, actions: r.run.actions.slice(), startLogged: r.startLogged, startedAt: r.startedAt, finalTokens: r.run.finalTokens.map((t) => ({ faction: t.faction, era: t.era })), countsAsDaily: r.countsAsDaily, dailySeed: r.dailySeed, variant: r.variant, lineupFac: A.draftedFactions(r.run), multiPicks: A.multiAppearancePicks(r.run), progressive: r.progressive };
    const res = makeResult(r, { status: 'waitingServer', lineup });
    showResult(res, false);
    res.status = 'waitingServer';
    await submitPending(pending, res);
  }

  /** Submit a finished daily/challenge. Resolves when the result screen state is final. */
  async function submitPending(p, res) {
    invalidate();
    if (!p.startLogged && !p.progressive) {
      const s = await api.startRun({ mode: p.mode, clientRunId: p.clientRunId, dateKey: p.dateKey, challengeId: p.challengeId || undefined });
      if (s && s.ok) p.startLogged = true;
    }
    const r = await api.submitRun({ clientRunId: p.clientRunId, mode: p.mode, dateKey: p.dateKey, challengeId: p.challengeId || undefined, actions: p.actions });
    if (r && r.ok) return onServerResult(p, res, r);
    const code = r && r.code;
    if (code === 'ALREADY_PLAYED' && r.result && r.result.ok) return onServerResult(p, res, r.result); // backend: the stored result rides along
    if (code === 'NETWORK' || code === 'TIMEOUT' || !code) {
      S.pending = p;
      store.save();
      res.status = 'pendingSubmit';
      S.active = null;
      track('error', { where: 'submitRun', code: code || 'none' });
      invalidate();
      return;
    }
    S.pending = null;
    S.active = null;
    store.save();
    track('error', { where: 'submitRun', code });
    if (code === 'LATE_SUBMIT') {
      toast('军令已过期，本局记为友谊赛');
      goHome();
      return;
    }
    if (code === 'ALREADY_PLAYED') {
      toast('今日军令已完成');
      await refreshDaily();
      goHome();
      return;
    }
    if (code === 'CHALLENGE_EXPIRED') {
      toast('这封战书已经过期了');
      goHome();
      return;
    }
    res.status = 'error';
    invalidate();
  }

  function onServerResult(p, res, r) {
    S.pending = null;
    S.active = null;
    const lineup = res.lineup || lineupFromActions(p);
    res.lineup = lineup;
    res.lineupDetail = lineupDetail(content, lineup);
    res.morale = moraleFor(lineup);
    res.record = r.record;
    res.band = r.band || { key: bandFor(config, r.record.w).key, label: bandFor(config, r.record.w).label };
    res.battles = r.battles || [];
    res.events = r.events || [];
    res.rarity = r.rarity || null;
    res.ranked = !!r.ranked;
    res.finalTokens = p.finalTokens;
    res.comment = commentFor(content, lineup, r.record.w);
    res.rarityText = V.rarityText(res, config);
    res.shareNames = shareNamesOf(lineup);
    if (res.ranked && r.streak) {
      res.streak = { current: typeof r.streak === 'object' ? r.streak.current : r.streak };
      if (S.dailyCache && S.dailyCache.dateKey === p.dateKey) {
        S.dailyCache.myStreak = { current: res.streak.current, best: typeof r.streak === 'object' && r.streak.best ? r.streak.best : Math.max(res.streak.current, (S.dailyCache.myStreak && S.dailyCache.myStreak.best) || 0) };
      }
    }
    if (r.challengeCompare) res.challenge = { theirRecord: r.challengeCompare.theirRecord, lineupLocked: !!r.challengeCompare.lineupLocked, theirLineup: (r.challengeCompare.theirLineup || []).map((e) => ({ slot: e.slot, name: content.byId[e.generalId] ? content.byId[e.generalId].name : '' })) };
    res.status = 'revealing';
    c.ui.revealStart = now();
    c.ui.doneAt = 0;
    if (res.ranked && p.mode === 'daily') {
      S.results[p.dateKey] = { dailyDone: true, record: res.record, band: res.band, res: stripRes(res) };
    } else if (res.ranked) {
      S.results[p.dateKey] = { dailyDone: true, record: res.record, band: res.band, res: stripRes(res) };
    }
    if (p.challengeId) {
      S.challengeResults = S.challengeResults || {};
      S.challengeResults[p.challengeId] = stripRes(res);
    }
    store.save();
    if (S.dailyCache && p.dateKey === S.dailyCache.dateKey && res.ranked) S.dailyCache.myStatus = 'done';
    invalidate();
  }

  function stripRes(res) {
    const o = Object.assign({}, res);
    o.status = 'done';
    o.reveal = res.shiren ? { pending: false, step: 5 } : null; // a stored verdict never replays the reveal
    o.saveState = 'idle';
    return JSON.parse(JSON.stringify(o));
  }

  function lineupFromActions(p) {
    const run = draft.createRun({ seed: 0, contentVersion: cvNum, configVersion: config.configVersion, mode: p.mode === 'challenge' ? 'challenge' : 'daily', rounds: p.rounds });
    for (const a of p.actions) draft.apply(run, a);
    return draft.lineupOf(run);
  }

  async function retryPending() {
    const p = S.pending;
    if (!p) return;
    let res = c.res && c.res.runId === p.clientRunId ? c.res : null;
    const lineup = lineupFromActions(p);
    if (!res) {
      const rr = newRunCtx({ mode: p.mode, rounds: p.rounds, clientRunId: p.clientRunId, dateKey: p.dateKey, issueNo: p.issueNo, challengeId: p.challengeId });
      res = makeResult(rr, { status: 'waitingServer', lineup, variant: p.variant, lineupFac: p.lineupFac || {}, multiPicks: p.multiPicks || 0 });
      res.finalTokens = p.finalTokens;
    }
    if (c.screen === 'result') res.status = 'waitingServer';
    invalidate();
    const wasScreen = c.screen;
    await submitPending(p, res);
    if (res.status === 'revealing' && wasScreen === 'home') {
      // submitted in the background: just refresh the home card
      c.res = res;
      setDailyFromState();
    } else if (res.status === 'revealing') {
      c.res = res;
    }
    setDailyFromState();
    invalidate();
  }

  function finishReveal() {
    const res = c.res;
    if (!res || res.status !== 'revealing') return;
    res.status = 'done';
    c.ui.doneAt = now();
    if (deps.audio) deps.audio.stop('drum');
    if (res.record.w === 12 && wx.vibrateShort) wx.vibrateShort({ type: 'light' });
    if (res.record.w === 12 && deps.audio) deps.audio.play('bell');
    if (!res.tracked) {
      res.tracked = true;
      const r = c.r;
      track('run_complete', {
        runId: res.runId,
        mode: res.mode,
        wins: res.record.w,
        durationMs: res.startedAt ? now() - res.startedAt : 0,
        respinsFree: r && r.run ? r.run.respinsFree : 0,
        respinsAd: r && r.run ? r.run.respinsAd : 0,
        events: res.events.map((e) => e.name),
        variant: res.variant || 'standard',
        multiAppearancePicks: res.multiPicks || 0,
      });
      if (res.streak && res.streak.current >= 2) trackOnce('streak:result', 'streak_shown', { current: res.streak.current, where: 'result' });
      if (res.challenge) track('challenge_answered', { challengeId: res.challengeId, myWins: res.record.w, theirWins: res.challenge.theirRecord.w, countsAsDaily: res.ranked });
    }
    analytics.flush();
    // 识人: after the record appears, 五德揭晓 reveals each slot (spec 8.3, 8.11)
    if (res.shiren && !res.reveal) {
      res.reveal = { pending: true, step: 0 };
      c.ui.shirenAt = now();
    }
    if (res.ranked && res.mode !== 'free') {
      privacy.writeMarker(res.dateKey, res.record.w, res.record.l).then((r) => {
        if (r === 'privacyDenied') {
          res.privacyNote = true;
          invalidate();
        }
      });
    }
    invalidate();
  }

  /** Finish the 五德揭晓 sequence (it ran out, or a tap skipped it). */
  function completeReveal(skipped) {
    const res = c.res;
    if (!res || !res.reveal || !res.reveal.pending) return;
    res.reveal = { pending: false, step: 5 };
    track('shiren_reveal', { runId: res.runId, skipped: !!skipped });
    if (res.ranked && res.dateKey && S.results[res.dateKey] && S.results[res.dateKey].res) S.results[res.dateKey].res.reveal = { pending: false, step: 5 };
    invalidate();
  }

  /** Fire an analytics event once per session per key (streak_shown, subscribe_offer). */
  function trackOnce(key, name, props) {
    const k = analytics.sessionId() + '|' + key;
    if (c.shown[k]) return;
    c.shown[k] = true;
    track(name, props);
  }

  // ---------------------------------------------------------------- 复盘

  /** Spoiler rule: a daily-seed run's 复盘 stays sealed until the player has a ranked result for that date (or D+1 00:30). */
  function replayLocked(res) {
    if (!res || !res.dailySeed || res.ranked || !res.dateKey) return false;
    const st = S.results[res.dateKey];
    if (st && st.dailyDone) return false;
    return now() + c.dailyOffsetMs < dateKeyToMs(res.dateKey) + DAY_MS + config.daily.graceMs;
  }

  async function replayTap() {
    const res = c.res;
    if (res.replay.unlocked) {
      c.ui.sheet = 'replay';
      return invalidate();
    }
    if (replayLocked(res)) return toast(V.REPLAY_LOCKED_TEXT); // no ad for a locked replay
    if (c.ui.replayAdState !== 'idle') return;
    c.ui.replayAdState = 'loading';
    invalidate();
    const out = await ads.rewarded('replay', res.runId);
    c.ui.replayAdState = 'idle';
    if (out.toast) toast(out.toast);
    if (!out.granted) return invalidate();
    let best = null;
    // Free-play 复盘 is computed on the client, except for token sets so large that a mid-range phone could
    // take too long (spec 7.4): those ask the server first and fall back to the local search.
    const heavy = res.mode === 'free' && enumerateSets(content, res.finalTokens).length > config.search.heavySets;
    if (heavy) {
      if (c.submits[res.runId]) await c.submits[res.runId];
      const g = await api.getReplay({ runId: res.runId });
      if (g && g.ok && g.best) best = g.best;
    }
    if (res.mode === 'free') {
      if (!best) {
        const b = bestLineup(res.seed, cvNum, res.finalTokens, { configVersion: config.configVersion });
        if (b) best = { lineup: b.lineup, record: b.record };
      }
    } else {
      const g = await api.getReplay({ runId: res.runId });
      if (g && g.ok && g.best) best = g.best;
      else if (g && g.code === 'REPLAY_LOCKED') {
        res.dailySeed = true;
        toast(V.REPLAY_LOCKED_TEXT);
      } else toast('复盘暂时打不开');
    }
    if (best) {
      res.replay = { unlocked: true, best: { lineup: lineupDetail(content, best.lineup).map((e) => ({ slot: e.slot, name: e.name, score: e.score })), record: best.record } };
      c.ui.sheet = 'replay';
    }
    invalidate();
  }

  // ---------------------------------------------------------------- challenge

  async function openChallenge(id) {
    c.challenge = { id, status: 'loading' };
    go('challenge');
    const r = await api.getChallenge({ challengeId: id });
    if (r && r.ok) {
      c.challenge = { id, status: r.status, theirRecord: r.theirRecord, mode: r.mode, countsAsDaily: r.countsAsDaily, isFriendly: r.isFriendly, answerCount: r.answerCount, bestRecord: r.bestAnswer && Number.isInteger(r.bestAnswer.w) ? { w: r.bestAnswer.w, l: 12 - r.bestAnswer.w } : undefined, rounds: r.rounds, dateKey: r.dateKey, lineupLocked: !!r.lineupLocked, variant: r.variant === 'shiren' ? 'shiren' : 'standard' };
      if (r.status === 'own' && r.subscribe && r.subscribe.granted && subscribe) subscribe.markGranted(id);
    } else if (r && (r.status === 'expired' || r.code === 'CHALLENGE_EXPIRED' || r.code === 'NOT_FOUND')) {
      c.challenge = { id, status: 'expired', theirRecord: { w: 0, l: 0 } };
    } else {
      const net = !r || r.code === 'NETWORK' || r.code === 'TIMEOUT';
      c.challenge = { id, status: net ? 'offline' : 'error', theirRecord: { w: 0, l: 0 } };
      track('error', { where: 'getChallenge', code: r ? r.code : 'none' });
    }
    invalidate();
  }

  async function acceptChallenge() {
    const ch = c.challenge;
    if (!ch || ch.status !== 'ready') return;
    // a challenge that counts as today's daily gets its tokens round by round (PO-8): no rounds in getChallenge
    const progressive = !ch.rounds;
    const r = newRunCtx({ mode: 'challenge', rounds: ch.rounds, progressive, variant: ch.variant, dateKey: ch.dateKey, challengeId: ch.id, source: 'challenge', countsAsDaily: ch.countsAsDaily, dailySeed: ch.mode === 'daily' });
    if (progressive) {
      // accepting starts the attempt and fetches round 1; offline -> 战书需联网展开
      const t0 = now();
      const resp = await api.startRun({ mode: 'challenge', clientRunId: r.clientRunId, dateKey: ch.dateKey, challengeId: ch.id });
      track('round_fetch', { runId: r.clientRunId, round: 1, result: resp && resp.ok ? 'ok' : resp && resp.code === 'TIMEOUT' ? 'timeout' : 'offline', ms: now() - t0 });
      if (!resp || !resp.ok) {
        track('error', { where: 'startRun', code: resp ? resp.code : 'none' });
        c.challenge = Object.assign({}, ch, { status: 'offline' });
        return invalidate();
      }
      r.startLogged = true;
      adoptProgress(r, resp);
    }
    beginDraft(r);
  }

  // ---------------------------------------------------------------- boards

  function selfRecord() {
    const key = S.dailyCache ? S.dailyCache.dateKey : todayKey();
    const d = S.results[key];
    if (d && d.dailyDone) return { record: d.record, bandLabel: d.band.label };
    if (S.dailyCache && S.dailyCache.myStatus === 'done' && S.dailyCache.myRecord) return { record: S.dailyCache.myRecord, bandLabel: bandLabelOf(S.dailyCache.myRecord.w) };
    return { record: null, bandLabel: null };
  }

  async function openBoard(kind) {
    const dateKey = S.dailyCache ? S.dailyCache.dateKey : todayKey();
    const issue = S.dailyCache ? S.dailyCache.issueNo : issueNoOf(dateKey, config.daily.launchDateKey);
    const b = { kind, dateKey, issueNo: issue, variant: S.dailyCache && S.dailyCache.dateKey === dateKey ? S.dailyCache.variant : 'standard', state: 'loading', mode: null, viewerPlayed: !!selfRecord().record, self: selfRecord(), sharedCanvas: null };
    c.board = b;
    c.ui.boardScroll = 0;
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
    if (gate.state === 'privacyDenied') return view('privacyDenied');
    if (gate.state === 'unauthorized') return view('unauthorized');
    const r = await api.getBoard({ kind, dateKey, groupRef: kind === 'group' ? c.group.groupRef : undefined });
    if (!r || !r.ok) {
      track('error', { where: 'getBoard', code: r ? r.code : 'none' });
      return view('serverError');
    }
    b.mode = r.mode;
    b.viewerPlayed = !!r.viewerPlayed;
    b.dateKey = r.dateKey;
    b.issueNo = r.issueNo;
    b.variant = r.variant === 'shiren' ? 'shiren' : 'standard';
    if (!r.rows.length) return view('empty');
    const L = getLayout();
    const msg = V.boardMessage(kind, r, { content, groupRef: c.group.groupRef, shareTicket: c.group.shareTicket, groupid: c.group.groupid, board: boardRectOf(L, bannerSlot({ state: 'ready' })), dpr: L.dpr, showUnverified: config.showUnverified, display: V.displayVm(display()) });
    b.rowCount = r.rows.length;
    odc.render(msg);
    b.sharedCanvas = odc.sharedCanvas();
    view('ready');
  }

  // ---------------------------------------------------------------- history (spec 8.9)

  function windowClosed(dateKey) {
    return now() + c.dailyOffsetMs > dateKeyToMs(dateKey) + DAY_MS + config.daily.graceMs;
  }

  async function openHistory() {
    c.history = { state: 'loading', items: [], bestStreak: 0, scroll: 0 };
    go('history');
    const r = await api.getHistory({ limit: 30 });
    if (r && r.ok) {
      const items = (r.items || []).slice(0, 30);
      c.history = { state: items.length ? 'ready' : 'empty', items, bestStreak: r.bestStreak || 0, scroll: 0 };
    } else {
      const net = !r || r.code === 'NETWORK' || r.code === 'TIMEOUT';
      c.history = { state: net ? 'offline' : 'error', items: [], bestStreak: 0, scroll: 0 };
      track('error', { where: 'getHistory', code: r ? r.code : 'none' });
    }
    track('history_view', { items: c.history.items.length, state: c.history.state });
    invalidate();
  }

  function openIssue(dateKey) {
    const it = c.history.items.find((x) => x.dateKey === dateKey);
    if (!it) return;
    c.issueKey = dateKey;
    c.ui.issueScroll = 0;
    go('historyIssue');
    track('history_issue_view', { dateKey, hasMine: !!it.mine, bestShown: !!it.best });
  }

  // ---------------------------------------------------------------- save to album (spec 8.12)

  async function saveImage() {
    const res = c.res;
    if (!res || !res.record || res.saveState === 'rendering' || res.saveState === 'saving') return;
    res.saveState = 'rendering';
    invalidate();
    const out = await album.save(V.cardVm(res, content), res.mode);
    if (out.result === 'saved' || out.result === 'renderFallback') {
      res.saveState = 'saved';
      toast('已保存到相册');
    } else if (out.needSettings) {
      res.saveState = 'denied';
      c.ui.albumDenied = true; // overlay.albumDenied: 去设置 (album:openSetting) / 取消 (album:cancel)
    } else {
      res.saveState = 'error';
      toast('保存失败，请稍后再试');
    }
    invalidate();
  }

  // ---------------------------------------------------------------- subscribe opt-in (spec 8.13)

  /** Called straight from the 提醒我 tap: wx.requestSubscribeMessage must not wait on anything. */
  function subscribeTap(holder, challengeId) {
    if (!subscribe || !challengeId || holder.state !== 'offer') return;
    holder.state = 'requesting';
    invalidate();
    subscribe.request(c.features, challengeId).then((out) => {
      holder.state = out === 'granted' ? 'granted' : out === 'declined' ? 'declined' : 'unavailable';
      if (out === 'unavailable') toast('提醒未开启');
      invalidate();
    });
  }

  /** Offer state from local flags; 'requesting' and 'unavailable' belong to the tap in flight. */
  function subscribeStateOf(holder, challengeId) {
    if (!subscribe) return 'hidden';
    if (holder && (holder.state === 'requesting' || holder.state === 'unavailable')) return holder.state;
    return subscribe.stateFor(c.features, challengeId);
  }

  // ---------------------------------------------------------------- banner (spec 12, PO-14)

  /** Pure: the banner slot for a board state (no side effects), the same numbers bannerFor() and openBoard() use. */
  function bannerSlot(b) {
    const f = c.features.banner;
    const L = getLayout();
    const width = Math.max(0, (L.W || 375) - 32);
    const enabled = !!(f.enabled && (ads.stub || f.adUnitId));
    const show = !!(enabled && b && (b.state === 'ready' || b.state === 'empty'));
    const height = ads.bannerHeight || Math.round(width * 0.29);
    return { show, reservedHeight: show ? height : 0, stub: show && ads.stub };
  }

  function bannerFor(b) {
    const f = c.features.banner;
    const L = getLayout();
    const slot = bannerSlot(b);
    const show = slot.show;
    // native banner lifecycle: created on the board, hidden under a dialog, destroyed on leaving
    if (!show) {
      if (c.bannerLive) {
        ads.bannerDestroy();
        c.bannerLive = false;
      }
    } else if (!ads.stub) {
      if (c.ui.dialog) {
        if (ads.bannerActive) ads.bannerHide();
      } else if (!ads.bannerActive) {
        const rect = bannerRectOf(L, slot);
        if (rect) c.bannerLive = ads.bannerShow({ unitId: f.adUnitId, left: rect.x, width: rect.w, bottomEdge: rect.y + rect.h, gap: 0 }) || c.bannerLive;
      }
    }
    return slot;
  }

  // ---------------------------------------------------------------- entry routing (9.4)

  async function routeEntry(e) {
    if (e.kind === 'challenge') {
      if (e.join) joinGroupFor(e);
      return openChallenge(e.challengeId);
    }
    if (e.kind === 'result') {
      if (e.join) await joinGroupFor(e);
      return;
    }
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

  /** Cold start or warm start with enter options. */
  function handleEntry(options, cold) {
    const e = parseEnter(options);
    if (e.kind === 'none') return e;
    // the launch options and the first onShow can be the same entry: count it once
    const key = JSON.stringify([options.query, options.shareTicket, options.scene]);
    if (key === c.lastEntryKey && now() - c.lastEntryAt < 3000) return e;
    c.lastEntryKey = key;
    c.lastEntryAt = now();
    if (e.kind === 'result' || e.kind === 'challenge') {
      track('card_open', { cardKind: e.kind, hasShareTicket: e.hasShareTicket, challengeId: e.challengeId });
    }
    if (!cold && c.screen === 'draft' && e.kind === 'challenge') {
      c.pendingEntry = e;
      toast('你有一封新战书');
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
    initDisplay();
    const e = parseEnter(options);
    analytics.startSession({ scene: options && options.scene, fromCard: e.kind === 'challenge' ? 'challenge' : e.kind === 'result' ? 'result' : 'none', hasShareTicket: e.hasShareTicket, challengeId: e.challengeId });
    analytics.startTimer();
    if (!S.howtoSeen) c.home.sheet = 'howto';
    store.save();
    share.register(() => (c.res && c.res.record ? { mode: c.res.mode, record: c.res.record, dateKey: c.res.dateKey, shareNames: c.res.shareNames, variant: c.res.variant } : null));
    handleEntry(options, true);
    return refreshDaily().then(() => retryPending());
  };

  c.onShow = function (options) {
    if (deps.audio) deps.audio.onShow();
    analytics.onShow({ scene: options && options.scene, fromCard: 'none', hasShareTicket: !!(options && options.shareTicket) });
    privacy.refreshOnShow().then(() => invalidate());
    if (S.dailyCache && beijingDateKey(now() + c.dailyOffsetMs) !== S.dailyCache.dateKey && c.screen === 'home') refreshDaily();
    else if (S.dailyCache && beijingDateKey(now() + c.dailyOffsetMs) !== S.dailyCache.dateKey) c.staleDaily = true;
    if (S.pending) retryPending();
    if (options && (options.query || options.shareTicket)) handleEntry(options, false);
    invalidate();
  };

  c.onHide = function () {
    if (deps.audio) deps.audio.onHide();
    persistActive();
    analytics.onHide();
  };

  // ---------------------------------------------------------------- touches

  c.setScrollMax = (m) => {
    c.scrollMax = m || {};
  };

  c.onDrag = function (id, dy) {
    const max = (c.scrollMax && c.scrollMax[id]) || 0;
    const clampTo = (v) => Math.max(0, Math.min(max, v));
    if (id === 'home:scroll') c.ui.homeScroll = clampTo((c.ui.homeScroll || 0) - dy);
    else if (id === 'pool:list') c.ui.poolScroll = clampTo(c.ui.poolScroll - dy);
    else if (id === 'result:scroll') c.ui.scrollY = clampTo(c.ui.scrollY - dy);
    else if (id === 'sheet:list') c.ui.sheetScroll = clampTo(c.ui.sheetScroll - dy);
    else if (id === 'history:list') c.history.scroll = clampTo((c.history.scroll || 0) - dy);
    else if (id === 'issue:list') c.ui.issueScroll = clampTo((c.ui.issueScroll || 0) - dy);
    else if (id === 'board:list' && c.board) {
      const L = getLayout();
      const rowH = display().largeText ? 100 : 66; // open data row height (CONTRACT: board)
      const cap = (c.board.rowCount || 0) * rowH * (L.s || 1);
      c.ui.boardScroll = Math.max(0, Math.min(cap, c.ui.boardScroll - dy));
      odc.scroll(c.ui.boardScroll);
    }
    invalidate();
  };

  /** A soft UI tap on every button press, unless the press itself made a sound (flip, bell...). */
  c.onHit = function (id) {
    const a = deps.audio;
    const before = a ? a.played : 0;
    onHitInner(id);
    if (a && a.played === before && id !== 'home:scroll' && id !== 'sheet:list' && id !== 'result:revealSkip') a.play('tap');
  };

  function onHitInner(id) {
    const ui = c.ui;
    // overlays first
    if (ads.overlay) {
      if (id === 'adstub:complete') ads.stubComplete();
      else if (id === 'adstub:skip') ads.stubSkip();
      return invalidate();
    }
    if (ui.albumDenied) {
      if (id === 'album:openSetting') {
        // wx.openSetting on this tap only; never re-asked automatically
        ui.albumDenied = false;
        album.openSetting().then(() => invalidate());
      } else if (id === 'album:cancel') ui.albumDenied = false;
      return invalidate();
    }
    if (ui.dialog) {
      if (id === 'dialog:confirm') dialogConfirm();
      else if (id === 'dialog:cancel') ui.dialog = null;
      return invalidate();
    }
    if (id === 'adstub:complete' || id === 'adstub:skip' || id === 'dialog:confirm' || id === 'dialog:cancel') return;
    switch (c.screen) {
      case 'home':
        return homeHit(id);
      case 'draft':
        return draftHit(id);
      case 'result':
        return resultHit(id);
      case 'challenge':
        return challengeHit(id);
      case 'board':
        return boardHit(id);
      case 'history':
        return historyHit(id);
      case 'historyIssue':
        return issueHit(id);
    }
  }

  function historyHit(id) {
    if (id === 'history:back') return goHome();
    if (id === 'history:retry') return openHistory();
    if (id.indexOf('history:item:') === 0) return openIssue(id.slice('history:item:'.length));
  }

  function issueHit(id) {
    if (id === 'issue:back') {
      c.screen = 'history';
      return invalidate();
    }
    if (id === 'issue:retry') return openHistory(); // the issue could not be found: reload the archive
  }

  /** Sound settings (spec AC 49, CTO-D3). muteAll: true/false for both channels, or flip one channel by name. */
  function setSound(muteAll, channel) {
    const a = deps.audio;
    if (a) {
      if (channel === 'music') a.setMusicOn(!a.musicOn);
      else if (channel === 'sfx') a.setSfxOn(!a.sfxOn);
      else a.setMuted(muteAll);
      S.muted = a.muted;
    } else S.muted = channel ? S.muted : muteAll;
    store.save();
    return invalidate();
  }

  function homeHit(id) {
    const d = c.home.daily;
    switch (id) {
      case 'home:daily':
        if (d.state === 'available') return startDaily();
        if (d.state === 'inProgress') return resumeDaily();
        if (d.state === 'done') return showStoredDaily();
        return;
      case 'home:retry':
        if (d.state === 'pendingSubmit') return retryPending();
        return refreshDaily();
      case 'home:free':
        return startFree('home');
      case 'home:groupBoard':
        return openBoard('group');
      case 'home:groupBanner':
        return openBoard('group');
      case 'home:friendBoard':
        return openBoard('friend');
      case 'home:howto':
        c.home.sheet = 'howto';
        c.ui.sheetScroll = 0;
        return invalidate();
      case 'home:history':
        return openHistory();
      case 'settings:largeText':
        return setDisplay({ largeText: !display().largeText });
      case 'settings:highContrast':
        return setDisplay({ highContrast: !display().highContrast });
      case 'home:settings':
        c.home.sheet = 'settings';
        c.ui.sheetScroll = 0;
        return invalidate();
      case 'settings:openAlbum':
        // album permission was refused earlier: 去设置, wx.openSetting on this tap only
        return album.openSetting().then(() => invalidate());
      case 'home:scroll':
      case 'sheet:list':
        return; // drag areas (onDrag); a tap does nothing
      case 'home:sound':
      case 'settings:sound':
        // the home link is one switch for both channels: anything audible -> mute, otherwise sound back on
        return setSound(deps.audio ? !deps.audio.muted : !S.muted, null);
      case 'settings:music':
        return setSound(null, 'music');
      case 'settings:sfx':
        return setSound(null, 'sfx');
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
        c.ui.sheetScroll = 0;
        return invalidate();
    }
  }

  function showStoredDaily() {
    const key = S.dailyCache.dateKey;
    const st = S.results[key];
    if (st && st.res) {
      const res = JSON.parse(JSON.stringify(st.res));
      res.status = 'done';
      res.tracked = true;
      c.r = null;
      showResult(res, false);
    } else {
      toast('战报需联网取回');
    }
  }

  function draftHit(id) {
    const r = c.r;
    if (!r) return;
    if (id === 'back') return back();
    if (flipping()) return;
    if (id === 'coach:next') {
      if (c.ui.coach >= 3) endCoach();
      else c.ui.coach++;
      return invalidate();
    }
    if (id === 'coach:skip') {
      endCoach();
      return invalidate();
    }
    if (c.ui.coach === 1 && id === 'primary') endCoach();
    if (id === 'primary') return onPrimary();
    if (id === 'retryRound') return r.roundFetch === 'failed' ? fetchRound() : undefined;
    if (id === 'undo') return undo();
    if (id === 'respin:faction') return respin('faction', 'free');
    if (id === 'respin:era') return respin('era', 'free');
    if (id === 'respinAd:faction') return respinAd('faction');
    if (id === 'respinAd:era') return respinAd('era');
    if (id === 'sheet:close') {
      c.ui.selectedId = null;
      c.ui.sheetScroll = 0;
      return invalidate();
    }
    if (id === 'sheet:list') return; // drag area of the detail sheet
    if (id.indexOf('pool:') === 0 && id !== 'pool:list') {
      if (r.run.phase !== 'flipped') return;
      const gid = id.slice(5);
      if (r.run.drafted[gid]) return; // 已点将: dimmed, unselectable (PO-2)
      c.ui.selectedId = c.ui.selectedId === gid ? null : gid;
      c.ui.sheetScroll = 0;
      if (c.ui.coach === 2) c.ui.coach = 3;
      return invalidate();
    }
    if (id.indexOf('slot:') === 0) return slotTap(id.slice(5));
  }

  function resultHit(id) {
    const res = c.res;
    if (!res) return;
    const ui = c.ui;
    // 五德揭晓 (识人): a tap anywhere skips to the full reveal
    if (res.reveal && res.reveal.pending && res.status === 'done') {
      if (id === 'result:back') {
        c.r = null;
        return goHome();
      }
      if (id === 'result:revealSkip') return completeReveal(true); // the verdict area: a tap skips to the full reveal
      return; // no other action is drawn while the 五德揭晓 plays
    }
    if (id === 'result:skip') {
      if (res.status === 'revealing') {
        track('reveal_skip', { runId: res.runId, atBattle: Math.min(12, Math.floor(revealCount(now()))) });
        finishReveal();
      }
      return;
    }
    if (id === 'sheet:close') {
      ui.sheet = null;
      ui.sheetScroll = 0;
      return invalidate();
    }
    if (ui.sheet) return;
    switch (id) {
      case 'result:back':
        c.r = null;
        return goHome();
      case 'result:retry':
        return retryPending();
      case 'result:again':
        if (res.mode === 'free') ads.interstitial({ mode: 'free', sessionFreeRuns: c.sessionFreeRuns, lifetimeRuns: S.lifetimeRuns }); // never awaited: does not delay
        return startFree('replay_button');
      case 'result:share':
        return share.shareResult({ mode: res.mode, record: res.record, dateKey: res.dateKey, runId: res.runId, shareNames: res.shareNames, variant: res.variant, card: V.cardVm(res, content) });
      case 'result:challenge':
        return startChallengeShare(res);
      case 'result:replay':
        return replayTap();
      case 'result:board':
        return openBoard(c.group.status === 'ok' ? 'group' : 'friend');
      case 'result:save':
        return saveImage();
      case 'result:subscribe':
        return subscribeTap(res.subscribe, res.subscribe.challengeId);
      case 'result:breakdown':
        ui.sheet = 'breakdown';
        ui.sheetScroll = 0;
        return invalidate();
    }
  }

  async function startChallengeShare(res) {
    if (res.mode === 'free' && c.submits[res.runId]) await c.submits[res.runId];
    const out = await share.shareChallenge({ mode: res.mode, record: res.record, dateKey: res.dateKey, runId: res.runId, shareNames: res.shareNames, variant: res.variant, card: V.cardVm(res, content) });
    if (out && out.toast) toast(out.toast);
    if (out && out.challengeId) {
      // opt-in offer, only after the user's own 发起挑战 created a challenge here, and only with a template id
      res.subscribe = { state: subscribeStateOf(null, out.challengeId), challengeId: out.challengeId };
      if (res.subscribe.state === 'offer') trackOnce('offer:' + out.challengeId, 'subscribe_offer', { where: 'result' });
      invalidate();
    }
  }

  function challengeHit(id) {
    switch (id) {
      case 'challenge:accept':
        return acceptChallenge();
      case 'challenge:subscribe': {
        const ch = c.challenge;
        if (ch.status !== 'own') return;
        ch.subscribeHolder = ch.subscribeHolder || { state: 'offer' };
        ch.subscribeHolder.state = subscribeStateOf(ch.subscribeHolder, ch.id);
        return subscribeTap(ch.subscribeHolder, ch.id);
      }
      case 'challenge:home':
        return goHome();
      case 'challenge:retry':
        return openChallenge(c.challenge.id);
      case 'challenge:free':
        return startFree('home');
      case 'challenge:daily':
        goHome();
        return c.home.daily.state === 'available' ? startDaily() : undefined;
      case 'challenge:compare': {
        const st = S.challengeResults && S.challengeResults[c.challenge.id];
        if (!st) return toast('还没有应战记录');
        const res = JSON.parse(JSON.stringify(st));
        res.status = 'done';
        res.tracked = true;
        return showResult(res, false);
      }
    }
  }

  function boardHit(id) {
    const b = c.board;
    switch (id) {
      case 'board:back':
        c.screen = c.prev === 'board' ? 'home' : c.prev;
        if (c.screen === 'draft' || (c.screen === 'result' && !c.res)) c.screen = 'home';
        if (c.screen === 'home') goHome();
        return invalidate();
      case 'board:retry':
        return openBoard(b.kind);
      case 'board:goPlay':
        goHome();
        if (c.home.daily.state === 'available') startDaily();
        else if (c.home.daily.state === 'inProgress') resumeDaily();
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

  // ---------------------------------------------------------------- rendering state

  function revealCount(t) {
    if (!c.ui.revealStart) return 12;
    return Math.min(12.0, (t - c.ui.revealStart) / REVEAL_MS);
  }

  /** Called every frame: advances time-driven transitions. */
  /** Music follows the screen: on for home and draft, faded out during the battle reveal; the drum pulse starts with the reveal. */
  function syncAudio() {
    const a = deps.audio;
    if (!a) return;
    const res = c.res;
    const revealing = c.screen === 'result' && !!res && res.status === 'revealing' && !!c.ui.revealStart;
    if (revealing) {
      if (audioRevealStart !== c.ui.revealStart) {
        audioRevealStart = c.ui.revealStart;
        a.play('drum');
      }
    } else if (audioRevealStart) {
      audioRevealStart = 0;
      a.stop('drum'); // skipped or finished: the pulse ends with the reveal
    }
    a.setScene(c.screen === 'home' || c.screen === 'draft' ? 'music' : 'quiet');
  }

  c.tick = function (t) {
    syncAudio();
    const res = c.res;
    if (c.screen === 'result' && res && res.status === 'revealing' && c.ui.revealStart && revealCount(t) >= 12 && t - c.ui.revealStart >= 12 * REVEAL_MS + 300) finishReveal();
    if (c.screen === 'result' && res && res.reveal && res.reveal.pending && res.status === 'done') {
      const el = t - c.ui.shirenAt;
      res.reveal.step = Math.max(0, Math.min(5, Math.floor(el / SHIREN_STEP_MS)));
      if (el >= 5 * SHIREN_STEP_MS + 200) completeReveal(false);
    }
    if (c.ui.toast && t >= c.ui.toast.until) c.ui.toast = null;
  };

  c.animating = function (t) {
    if (ads.overlay) return true;
    if (c.ui.toast) return true;
    if (c.screen === 'draft' && c.ui.flipStart && t - c.ui.flipStart < FLIP_MS + 50) return true;
    const res = c.res;
    if (c.screen === 'result' && res) {
      if (res.status === 'revealing' || res.status === 'waitingServer') return true;
      if (res.reveal && res.reveal.pending) return true;
      if (res.status === 'done' && c.ui.doneAt && t - c.ui.doneAt < STAMP_MS + 50) return true;
    }
    if (c.screen === 'home' && c.home.daily.state === 'loading') return true;
    if (c.screen === 'board' && c.board && (c.board.state === 'loading' || c.board.state === 'checkingGroup')) return true;
    if (c.screen === 'challenge' && c.challenge && c.challenge.status === 'loading') return true;
    return false;
  };

  c.view = function (t) {
    t = t === undefined ? now() : t;
    c.tick(t);
    let vm;
    switch (c.screen) {
      case 'home':
        vm = V.homeVm(c.home.daily, { hasGroupContext: c.group.status === 'ok', muted: deps.audio ? deps.audio.muted : S.muted, musicOn: deps.audio ? deps.audio.musicOn : !S.muted, sfxOn: deps.audio ? deps.audio.sfxOn : !S.muted, showHowToOnce: c.home.sheet === 'howto' && !S.howtoSeen, friendBoardEnabled: privacy.friendBoardEnabled(), sheet: c.home.sheet, t, display: display(), privacy: privacy.status().privacy, friendScope: privacy.status().friendScope, album: album.scope, scrollY: c.ui.homeScroll || 0, sheetScroll: c.ui.sheetScroll });
        if (vm.daily.streak.current >= 2) trackOnce('streak:home', 'streak_shown', { current: vm.daily.streak.current, where: 'home' });
        break;
      case 'draft': {
        const flip = c.ui.flipStart ? Math.min(1, (t - c.ui.flipStart) / FLIP_MS) : undefined;
        vm = V.draftVm(c.r.run, { selectedId: c.ui.selectedId, poolScroll: c.ui.poolScroll, sheetScroll: c.ui.sheetScroll, flip, coach: c.ui.coach, adState: c.ui.adState, t, hidden: c.r.hidden, roundFetch: c.r.roundFetch, shirenCoach: c.r.hidden && !S.shirenCoachSeen && c.r.run.picks.length === 0 });
        break;
      }
      case 'result': {
        const res = c.res;
        const stampT = res.status === 'done' && c.ui.doneAt ? Math.min(1, (t - c.ui.doneAt) / STAMP_MS) : 1;
        if (res.subscribe && res.subscribe.challengeId) res.subscribe.state = subscribeStateOf(res.subscribe, res.subscribe.challengeId);
        vm = V.resultVm(res, { revealCount: revealCount(t), stampT, scrollY: c.ui.scrollY, sheet: c.ui.sheet, sheetScroll: c.ui.sheetScroll, replayAdState: c.ui.replayAdState, replayLocked: replayLocked(res), t, content });
        break;
      }
      case 'history':
        vm = V.historyVm(Object.assign({}, c.history), { config, todayKey: todayKey(), t });
        break;
      case 'historyIssue': {
        const it = c.history.items.find((x) => x.dateKey === c.issueKey);
        vm = V.historyIssueVm(it, { content, config, windowClosed: it ? windowClosed(it.dateKey) : false, scroll: c.ui.issueScroll || 0, t });
        break;
      }
      case 'challenge': {
        const ch = c.challenge;
        if (ch && ch.status === 'own') {
          ch.subscribeState = subscribeStateOf(ch.subscribeHolder, ch.id);
          if (ch.subscribeState === 'offer') trackOnce('offer:own:' + ch.id, 'subscribe_offer', { where: 'own_challenge' });
        }
        vm = V.challengeVm(ch, t);
        break;
      }
      case 'board':
        vm = V.boardVm(Object.assign({}, c.board, { t, banner: bannerFor(c.board) }));
        break;
    }
    if (c.screen !== 'board') bannerFor(null); // destroys a live banner when the board is left
    vm.display = V.displayVm(display());
    const overlay = {};
    if (c.ui.albumDenied) overlay.albumDenied = true;
    if (c.ui.dialog) overlay.dialog = { title: c.ui.dialog.title, text: c.ui.dialog.text, confirmLabel: c.ui.dialog.confirmLabel, cancelLabel: c.ui.dialog.cancelLabel, danger: !!c.ui.dialog.danger };
    if (c.ui.toast) overlay.toast = { text: c.ui.toast.text };
    if (ads.overlay) overlay.adStub = { kind: ads.overlay.kind, secondsLeft: Math.max(0, Math.ceil((ads.overlay.durationMs - (t - ads.overlay.startedAt)) / 1000)) };
    return { screen: c.screen, vm, overlay };
  };

  c.refreshDaily = refreshDaily; // test hook: re-read getDaily (and the remote features)
  c.state = c;
  return c;
}

module.exports = { createController, FLIP_MS, REVEAL_MS };
