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
const { bestLineup } = require('../core/search');
const { randomSeed } = require('../core/rng');
const { bandFor } = require('../core/config');
const { beijingDateKey, issueNo: issueNoOf } = require('../core/date');
const { lineupDetail, commentFor } = require('../core/score');
const { parseEnter } = require('./share');
const V = require('./vm');
const { uuid } = require('./util');

const FLIP_MS = 1200;
const REVEAL_MS = 700;
const STAMP_MS = 600;
const PRIMARY_DEBOUNCE_MS = 300;
const TOAST_MS = 2400;

function createController(deps) {
  const { wx, api, store, analytics, ads, share, privacy, odc, config, content } = deps;
  const now = deps.now || (() => Date.now());
  const invalidate = deps.invalidate || (() => {});
  const getLayout = deps.getLayout || (() => ({ board: { x: 16, y: 120, w: 343, h: 400 }, s: 1, dpr: 1 }));
  const cvNum = content.contentVersion;
  const S = store.state;

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
  };

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
    S.active = { mode: r.mode, clientRunId: r.clientRunId, dateKey: r.dateKey, issueNo: r.issueNo, challengeId: r.challengeId || null, rounds: r.rounds, actions: r.run.actions.slice(), startedAt: r.startedAt, started: r.started, startLogged: r.startLogged, countsAsDaily: !!r.countsAsDaily };
    store.save();
  }

  function newRunCtx(opts) {
    const rounds = opts.rounds;
    const run = draft.createRun({ seed: opts.seed || 0, contentVersion: cvNum, configVersion: config.configVersion, mode: opts.mode, rounds });
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
    };
  }

  function beginDraft(r) {
    c.r = r;
    c.ui.selectedId = null;
    c.ui.poolScroll = 0;
    c.ui.flipStart = 0;
    c.ui.adState = 'idle';
    c.ui.dialog = null;
    c.ui.coach = !S.coachSeen && S.lifetimeRuns === 0 && r.mode !== 'challenge' ? 1 : 0;
    c.res = null;
    go('draft');
  }

  function restoreActive() {
    const a = S.active;
    if (!a) return null;
    const r = newRunCtx({ mode: a.mode, rounds: a.rounds, clientRunId: a.clientRunId, dateKey: a.dateKey, issueNo: a.issueNo, challengeId: a.challengeId, countsAsDaily: a.countsAsDaily });
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
    const base = { issueNo: cache.issueNo, dateKey: key };
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
      S.dailyCache = { dateKey: r.dateKey, issueNo: r.issueNo, rounds: r.rounds, offsetMs: c.dailyOffsetMs, myStatus: r.myStatus, myRecord: r.myRecord };
      store.save();
      setDailyFromState();
    } else {
      const active = S.active && S.active.mode === 'daily' ? S.active : null;
      const net = !r || r.code === 'NETWORK' || r.code === 'TIMEOUT';
      if (active && active.dateKey === todayKey()) {
        c.home.daily = { state: 'inProgress', issueNo: active.issueNo, dateKey: active.dateKey, round: restoreActive().run.round };
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
    const r = newRunCtx({ mode: 'daily', rounds: cache.rounds, dateKey: cache.dateKey, issueNo: cache.issueNo, source: 'home' });
    beginDraft(r);
  }

  function resumeDaily() {
    const r = restoreActive();
    if (!r) return startDaily();
    beginDraft(r);
    c.ui.coach = 0;
    // a restored run in 'placed' of a non-final round shows the same screen as before
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
    track('run_start', { runId: r.clientRunId, mode: r.mode, source: r.source });
    if (r.mode !== 'free') {
      api.startRun({ mode: r.mode === 'challenge' ? 'challenge' : 'daily', clientRunId: r.clientRunId, dateKey: r.dateKey, challengeId: r.challengeId || undefined }).then((x) => {
        if (x && x.ok) {
          r.startLogged = true;
          persistActive();
        }
      });
    }
  }

  function doFlip() {
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

  function onPrimary() {
    const t = now();
    if (t - c.lastPrimaryAt < PRIMARY_DEBOUNCE_MS) return;
    c.lastPrimaryAt = t;
    const r = c.r;
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
    const res = act({ type: 'pick', generalId: gid, slot });
    if (!res.ok) return toast('这个位置已有将领');
    const gi = content.indexOf[gid];
    const score = content.roleScores[gi][SLOTS.indexOf(slot)];
    track('draft_pick', { runId: r.clientRunId, round: r.run.round, generalId: gid, slot, fit: score >= 7.5 ? 'good' : score >= 5.5 ? 'ok' : 'bad' });
    c.ui.selectedId = null;
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
    return draft.lineupOf(r.run).map((e) => ({ slot: e.slot, generalId: e.generalId }));
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
    return moraleOf(content, config, gIdx, content.roleScores[gIdx[0]][0]);
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
    const pending = { mode: r.mode, clientRunId: r.clientRunId, dateKey: r.dateKey, issueNo: r.issueNo, challengeId: r.challengeId, rounds: r.rounds, actions: r.run.actions.slice(), startLogged: r.startLogged, startedAt: r.startedAt, finalTokens: r.run.finalTokens.map((t) => ({ faction: t.faction, era: t.era })), countsAsDaily: r.countsAsDaily };
    const res = makeResult(r, { status: 'waitingServer', lineup });
    showResult(res, false);
    res.status = 'waitingServer';
    await submitPending(pending, res);
  }

  /** Submit a finished daily/challenge. Resolves when the result screen state is final. */
  async function submitPending(p, res) {
    invalidate();
    if (!p.startLogged) {
      const s = await api.startRun({ mode: p.mode, clientRunId: p.clientRunId, dateKey: p.dateKey, challengeId: p.challengeId || undefined });
      if (s && s.ok) p.startLogged = true;
    }
    const r = await api.submitRun({ clientRunId: p.clientRunId, mode: p.mode, dateKey: p.dateKey, challengeId: p.challengeId || undefined, actions: p.actions });
    if (r && r.ok) return onServerResult(p, res, r);
    const code = r && r.code;
    if (code === 'ALREADY_PLAYED' && r.existing && r.existing.ok) return onServerResult(p, res, r.existing);
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
    if (r.challengeCompare) res.challenge = { theirRecord: r.challengeCompare.theirRecord, theirLineup: (r.challengeCompare.theirLineup || []).map((e) => ({ slot: e.slot, name: content.byId[e.generalId] ? content.byId[e.generalId].name : '' })) };
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
      res = makeResult(rr, { status: 'waitingServer', lineup });
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
    if (res.record.w === 12 && wx.vibrateShort) wx.vibrateShort({ type: 'light' });
    if (deps.audio) deps.audio.play(res.record.w === 12 ? 'bell' : 'drum');
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
      });
      if (res.challenge) track('challenge_answered', { challengeId: res.challengeId, myWins: res.record.w, theirWins: res.challenge.theirRecord.w, countsAsDaily: res.ranked });
    }
    analytics.flush();
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

  // ---------------------------------------------------------------- 复盘

  async function replayTap() {
    const res = c.res;
    if (res.replay.unlocked) {
      c.ui.sheet = 'replay';
      return invalidate();
    }
    if (c.ui.replayAdState !== 'idle') return;
    c.ui.replayAdState = 'loading';
    invalidate();
    const out = await ads.rewarded('replay', res.runId);
    c.ui.replayAdState = 'idle';
    if (out.toast) toast(out.toast);
    if (!out.granted) return invalidate();
    let best = null;
    if (res.mode === 'free') {
      const b = bestLineup(res.seed, cvNum, res.finalTokens, { configVersion: config.configVersion });
      if (b) best = { lineup: b.lineup, record: b.record };
    } else {
      const g = await api.getReplay({ runId: res.runId });
      if (g && g.ok && g.best) best = g.best;
      else toast('复盘暂时打不开');
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
      c.challenge = { id, status: r.status, theirRecord: r.theirRecord, mode: r.mode, countsAsDaily: r.countsAsDaily, isFriendly: r.isFriendly, answerCount: r.answerCount, bestRecord: r.bestAnswer !== undefined ? { w: r.bestAnswer, l: 12 - r.bestAnswer } : undefined, rounds: r.rounds, dateKey: r.dateKey };
    } else if (r && (r.status === 'expired' || r.code === 'CHALLENGE_EXPIRED' || r.code === 'NOT_FOUND')) {
      c.challenge = { id, status: 'expired', theirRecord: { w: 0, l: 0 } };
    } else {
      const net = !r || r.code === 'NETWORK' || r.code === 'TIMEOUT';
      c.challenge = { id, status: net ? 'offline' : 'error', theirRecord: { w: 0, l: 0 } };
      track('error', { where: 'getChallenge', code: r ? r.code : 'none' });
    }
    invalidate();
  }

  function acceptChallenge() {
    const ch = c.challenge;
    if (!ch || ch.status !== 'ready') return;
    const r = newRunCtx({ mode: 'challenge', rounds: ch.rounds, dateKey: ch.dateKey, challengeId: ch.id, source: 'challenge', countsAsDaily: ch.countsAsDaily });
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
    const b = { kind, dateKey, issueNo: issue, state: 'loading', mode: null, viewerPlayed: !!selfRecord().record, self: selfRecord(), sharedCanvas: null };
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
    if (!r.rows.length) return view('empty');
    const L = getLayout();
    const msg = V.boardMessage(kind, r, { content, groupRef: c.group.groupRef, shareTicket: c.group.shareTicket, groupid: c.group.groupid, board: L.board, dpr: L.dpr, showUnverified: config.showUnverified });
    b.rowCount = r.rows.length;
    odc.render(msg);
    b.sharedCanvas = odc.sharedCanvas();
    view('ready');
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
    const e = parseEnter(options);
    analytics.startSession({ scene: options && options.scene, fromCard: e.kind === 'challenge' ? 'challenge' : e.kind === 'result' ? 'result' : 'none', hasShareTicket: e.hasShareTicket, challengeId: e.challengeId });
    analytics.startTimer();
    if (!S.howtoSeen) c.home.sheet = 'howto';
    store.save();
    share.register(() => (c.res && c.res.record ? { mode: c.res.mode, record: c.res.record, dateKey: c.res.dateKey, shareNames: c.res.shareNames } : null));
    handleEntry(options, true);
    return refreshDaily().then(() => retryPending());
  };

  c.onShow = function (options) {
    analytics.onShow({ scene: options && options.scene, fromCard: 'none', hasShareTicket: !!(options && options.shareTicket) });
    privacy.refreshOnShow().then(() => invalidate());
    if (S.dailyCache && beijingDateKey(now() + c.dailyOffsetMs) !== S.dailyCache.dateKey && c.screen === 'home') refreshDaily();
    else if (S.dailyCache && beijingDateKey(now() + c.dailyOffsetMs) !== S.dailyCache.dateKey) c.staleDaily = true;
    if (S.pending) retryPending();
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

  c.onDrag = function (id, dy) {
    const max = (c.scrollMax && c.scrollMax[id]) || 0;
    const clampTo = (v) => Math.max(0, Math.min(max, v));
    if (id === 'pool:list') c.ui.poolScroll = clampTo(c.ui.poolScroll - dy);
    else if (id === 'result:scroll') c.ui.scrollY = clampTo(c.ui.scrollY - dy);
    else if (id === 'sheet:list') c.ui.sheetScroll = clampTo(c.ui.sheetScroll - dy);
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
    // overlays first
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
    }
  };

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
    if (id === 'undo') return undo();
    if (id === 'respin:faction') return respin('faction', 'free');
    if (id === 'respin:era') return respin('era', 'free');
    if (id === 'respinAd:faction') return respinAd('faction');
    if (id === 'respinAd:era') return respinAd('era');
    if (id === 'sheet:close') {
      c.ui.selectedId = null;
      return invalidate();
    }
    if (id.indexOf('pool:') === 0 && id !== 'pool:list') {
      if (r.run.phase !== 'flipped') return;
      const gid = id.slice(5);
      c.ui.selectedId = c.ui.selectedId === gid ? null : gid;
      if (c.ui.coach === 2) c.ui.coach = 3;
      return invalidate();
    }
    if (id.indexOf('slot:') === 0) return slotTap(id.slice(5));
  }

  function resultHit(id) {
    const res = c.res;
    if (!res) return;
    const ui = c.ui;
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
        return share.shareResult({ mode: res.mode, record: res.record, dateKey: res.dateKey, runId: res.runId, shareNames: res.shareNames, card: V.cardVm(res, content) });
      case 'result:challenge':
        return startChallengeShare(res);
      case 'result:replay':
        return replayTap();
      case 'result:board':
        return openBoard(c.group.status === 'ok' ? 'group' : 'friend');
      case 'result:breakdown':
        ui.sheet = 'breakdown';
        ui.sheetScroll = 0;
        return invalidate();
    }
  }

  async function startChallengeShare(res) {
    if (res.mode === 'free' && c.submits[res.runId]) await c.submits[res.runId];
    const out = await share.shareChallenge({ mode: res.mode, record: res.record, dateKey: res.dateKey, runId: res.runId, shareNames: res.shareNames, card: V.cardVm(res, content) });
    if (out && out.toast) toast(out.toast);
  }

  function challengeHit(id) {
    switch (id) {
      case 'challenge:accept':
        return acceptChallenge();
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
  c.tick = function (t) {
    const res = c.res;
    if (c.screen === 'result' && res && res.status === 'revealing' && c.ui.revealStart && revealCount(t) >= 12 && t - c.ui.revealStart >= 12 * REVEAL_MS + 300) finishReveal();
    if (c.ui.toast && t >= c.ui.toast.until) c.ui.toast = null;
  };

  c.animating = function (t) {
    if (ads.overlay) return true;
    if (c.ui.toast) return true;
    if (c.screen === 'draft' && c.ui.flipStart && t - c.ui.flipStart < FLIP_MS + 50) return true;
    const res = c.res;
    if (c.screen === 'result' && res) {
      if (res.status === 'revealing' || res.status === 'waitingServer') return true;
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
        vm = V.homeVm(c.home.daily, { hasGroupContext: c.group.status === 'ok', muted: S.muted, showHowToOnce: c.home.sheet === 'howto' && !S.howtoSeen, friendBoardEnabled: privacy.friendBoardEnabled(), sheet: c.home.sheet, t });
        break;
      case 'draft': {
        const flip = c.ui.flipStart ? Math.min(1, (t - c.ui.flipStart) / FLIP_MS) : undefined;
        vm = V.draftVm(c.r.run, { selectedId: c.ui.selectedId, poolScroll: c.ui.poolScroll, flip, coach: c.ui.coach, adState: c.ui.adState, t });
        break;
      }
      case 'result': {
        const res = c.res;
        const stampT = res.status === 'done' && c.ui.doneAt ? Math.min(1, (t - c.ui.doneAt) / STAMP_MS) : 1;
        vm = V.resultVm(res, { revealCount: revealCount(t), stampT, scrollY: c.ui.scrollY, sheet: c.ui.sheet, sheetScroll: c.ui.sheetScroll, replayAdState: c.ui.replayAdState, t });
        break;
      }
      case 'challenge':
        vm = V.challengeVm(c.challenge, t);
        break;
      case 'board':
        vm = V.boardVm(Object.assign({}, c.board, { t }));
        break;
    }
    const overlay = {};
    if (c.ui.dialog) overlay.dialog = { text: c.ui.dialog.text, confirmLabel: c.ui.dialog.confirmLabel, cancelLabel: c.ui.dialog.cancelLabel, danger: !!c.ui.dialog.danger };
    if (c.ui.toast) overlay.toast = { text: c.ui.toast.text };
    if (ads.overlay) overlay.adStub = { kind: ads.overlay.kind, secondsLeft: Math.max(0, Math.ceil((ads.overlay.durationMs - (t - ads.overlay.startedAt)) / 1000)) };
    return { screen: c.screen, vm, overlay };
  };

  c.state = c;
  return c;
}

module.exports = { createController, FLIP_MS, REVEAL_MS };
