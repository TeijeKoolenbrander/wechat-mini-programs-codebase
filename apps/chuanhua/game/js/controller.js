/**
 * Game controller: the state machine behind every screen. Renderer-agnostic: it builds view models
 * (js/vm.js), the renderers draw them and return hit areas, and touches come back here as hit ids
 * (js/CONTRACT.md). Drawing is the one exception: pointer events on the canvas go to onPointer().
 *
 *   const ctl = createController(deps)
 *   ctl.start(enterOptions)            cold start
 *   ctl.view(now)                      -> { screen, vm, overlay, display }   (what to draw)
 *   ctl.onHit(id)                      a tap landed on hit id
 *   ctl.onPointer(type, id, x, y)      type 'down' | 'move' | 'up' | 'cancel' (the drawing gesture)
 *   ctl.wantsPointer(x, y)             true if a touch starting here is a drawing gesture
 *   ctl.setHits(hits)                  hit areas of the last draw (the 'draw:canvas' rect feeds the drawing tool)
 *   ctl.onDrag(scrollId, dy)           a drag on a scroll area
 *   ctl.onShow(options) / ctl.onHide()
 *   ctl.animating(now)                 true while something needs repainting
 *
 * Screens: home picker draw describe sent entry reveal teaser group album detail settings.
 * Overlay: dialog, toast, adStub. Sheets (rules|strike|howto|report) travel in the screen vm as vm.sheet.
 * Game rules live in core/chain.js and the server; the client only presents state and never decides money,
 * eligibility or moderation (the server answers every claim and submit).
 */

const C = require('../core/chain');
const St = require('../core/strokes');
const Tx = require('../core/text');
const Pl = require('../core/players');
const { CONFIG } = require('../core/config');
const Pr = require('../core/prompts');
const { daily } = require('../core/daily');
const { mulberry32 } = require('../core/rng');
const { beijingDateKey } = require('../core/date');
const { parseEnter } = require('./share');
const { createDrawingTool } = require('./drawing');
const V = require('./vm');
const { uuid } = require('./util');
const { RULES_LINES } = require('./privacy');

const TOAST_MS = 2400;
const COACH_MS = 3000;
const PRIMARY_DEBOUNCE_MS = 250;
const ENTRY_DEDUPE_MS = 3000;
const SOLO_MS = 2500;
const NET = { NETWORK: true, TIMEOUT: true, BAD_RESPONSE: true };

function createController(deps) {
  const { wx, api, store, analytics, ads, share, privacy, keyboard, audio } = deps;
  const config = deps.config || CONFIG;
  const now = deps.now || (() => Date.now());
  const invalidate = deps.invalidate || (() => {});
  const S = store.state;
  const rng = deps.rng || mulberry32((Date.now() >>> 0) ^ 0x5bd1e995);

  const c = {
    screen: 'home',
    stack: [],
    offset: 0, // server time minus device time
    home: { state: 'loading', data: null, sheet: null, waitingInGroup: null, adState: 'idle' },
    group: { status: 'none', groupRef: null, shareTicket: null, errCode: undefined },
    rules: { open: false, pendingAction: null },
    picker: null,
    turn: null,
    sent: null,
    entry: null,
    reveal: null,
    teaser: null,
    groupList: null,
    album: null,
    detail: null,
    settings: { deleteState: 'idle', paletteAdState: 'idle' },
    report: { open: false, target: { chainId: null, step: 0 }, state: 'idle', reason: null },
    ui: { toast: null, dialog: null, scroll: {} },
    pendingEntry: null,
    lastEntryKey: null,
    lastEntryAt: 0,
    lastPrimaryAt: 0,
    hits: [],
    lastSecShown: -1,
    features: { subscribe: null, updatableCard: false, banner: { enabled: false }, interstitial: { enabled: false } },
  };

  // ---------------------------------------------------------------- helpers

  const track = (n, p) => analytics.track(n, p);
  const srvNow = () => now() + c.offset;
  const todayKey = () => beijingDateKey(srvNow());
  const toast = (text) => {
    c.ui.toast = { text, until: now() + TOAST_MS };
    invalidate();
  };
  const isNet = (r) => !r || !r.ok && NET[r.code];
  const noteServerTime = (r) => {
    if (r && r.serverNow) c.offset = r.serverNow - now();
  };
  const paletteToday = () => S.paletteDay === todayKey() || !!(c.home.data && c.home.data.me && c.home.data.me.paletteToday);

  function go(screen) {
    if (screen !== c.screen) c.stack.push(c.screen);
    c.screen = screen;
    invalidate();
  }
  function replace(screen) {
    c.screen = screen;
    invalidate();
  }
  function goHome() {
    c.stack = [];
    c.screen = 'home';
    keyboard.close();
    invalidate();
    loadHome();
    routePending();
  }
  function popScreen() {
    let s = c.stack.pop();
    while (s && (s === 'draw' || s === 'describe' || s === 'sent' || s === c.screen)) s = c.stack.pop();
    c.screen = s || 'home';
    invalidate();
    if (c.screen === 'home') loadHome();
  }
  function routePending() {
    const e = c.pendingEntry;
    if (!e) return;
    c.pendingEntry = null;
    routeEntry(e);
  }

  function rulesAgreed() {
    const v = c.home.data && c.home.data.me ? c.home.data.me.rulesVersion : S.rulesVersion;
    return privacy.rulesAgreed(Math.max(v || 0, S.rulesVersion || 0));
  }

  /** Run `action` after the 接龙公约 is agreed (spec 8.2): opens the sheet once, then continues. */
  function needRules(trigger, action) {
    if (rulesAgreed()) return action();
    c.rules = { open: true, pendingAction: { trigger, run: action } };
    track('rules_view', { trigger });
    invalidate();
  }

  // ---------------------------------------------------------------- home

  function localDaily() {
    return daily(todayKey());
  }

  async function loadHome() {
    if (!c.home.data) c.home.state = 'loading';
    const r = await api.getHome({});
    if (r && r.ok) {
      noteServerTime(r);
      c.home.data = r;
      c.home.state = 'ready';
      c.features = r.features || c.features;
      ads.configure(r.features);
      S.rulesVersion = Math.max(S.rulesVersion, (r.me && r.me.rulesVersion) || 0);
      S.homeCache = { at: now(), data: r };
      store.save();
      if (r.me && r.me.restriction) track('restriction_shown', { level: r.me.restriction.permanent ? 'permanent' : 'temp' });
      if (r.me && r.me.warnPending && !c.home.sheet) c.home.sheet = 'strike';
      if (c.group.status === 'ok') refreshWaiting();
    } else {
      if (!c.home.data && S.homeCache) c.home.data = S.homeCache.data;
      c.home.state = NET[r && r.code] ? 'offline' : 'error';
      if (r && !NET[r.code]) track('error', { where: 'getHome', code: r.code });
    }
    invalidate();
  }

  async function refreshWaiting() {
    if (c.group.status !== 'ok') return;
    const r = await api.getGroupChains({ groupRef: c.group.groupRef });
    c.home.waitingInGroup = r && r.ok ? r.waiting.length : null;
    invalidate();
  }

  function homeData() {
    const d = c.home.data;
    const dk = d ? d.dateKey : todayKey();
    return {
      state: c.home.state,
      dateKey: dk,
      prompts: d ? d.daily.prompts : localDaily(),
      counts: d ? d.daily.counts : {},
      streak: d ? d.me.streak : 0,
      startsLeft: d ? d.me.startsLeft : undefined,
      adStartsLeft: d ? d.me.adStartsLeft : undefined,
      adState: c.home.adState,
      waitingInGroup: c.home.waitingInGroup,
      hasGroupContext: c.group.status === 'ok',
      unseenReveals: d ? d.me.unseenReveals : 0,
      restriction: d ? d.me.restriction : null,
      ugcPaused: d ? !d.ugc.createEnabled : false,
      warnPending: d ? d.me.warnPending : false,
      showHowTo: c.home.sheet === 'howto',
    };
  }

  function homeHit(id) {
    const d = c.home.data;
    switch (id) {
      case 'home:start': {
        if (c.home.state !== 'ready') return;
        const vm = V.homeVm(homeData());
        if (!vm.start.enabled) return;
        return needRules('start', () => openPicker('home'));
      }
      case 'home:adStart':
        return adStart();
      case 'home:retry':
        return loadHome();
      case 'home:album':
        return openAlbum();
      case 'home:group':
      case 'home:groupLine':
        return openGroup();
      case 'home:howto':
        c.home.sheet = 'howto';
        return invalidate();
      case 'home:settings':
        return openSettings();
      default:
        void d;
    }
  }

  async function adStart() {
    if (c.home.adState === 'playing' || c.home.adState === 'loading') return;
    c.home.adState = 'playing';
    invalidate();
    const out = await ads.rewarded('start');
    c.home.adState = 'idle';
    if (out.granted) {
      const r = await api.grantReward({ kind: 'start', noFill: !!out.noFill });
      if (r && r.ok) {
        if (c.home.data) {
          c.home.data.me.startsLeft = r.startsLeft;
          c.home.data.me.adStartsLeft = r.adStartsLeft;
        }
        toast(out.toast || '多了一条可以开');
      } else toast(r && r.code === 'REWARD_LIMIT' ? '今天的视频奖励已用完' : '没成功，请稍后再试');
    } else if (out.toast) toast(out.toast);
    invalidate();
  }

  function toggleMute() {
    S.muted = !S.muted;
    audio.setMuted(S.muted);
    store.save();
    invalidate();
  }

  // ---------------------------------------------------------------- rules / sheets

  async function agreeRules() {
    const r = await api.agreeRules({ version: CONFIG.rulesVersion });
    const pend = c.rules.pendingAction;
    if (r && r.ok) {
      S.rulesVersion = CONFIG.rulesVersion;
      if (c.home.data) {
        c.home.data.me.rulesVersion = CONFIG.rulesVersion;
        c.home.data.me.warnPending = false;
      }
      store.save();
      track('rules_agree', { trigger: pend ? pend.trigger : 'settings' });
      c.rules = { open: false, pendingAction: null };
      invalidate();
      if (pend) pend.run();
    } else toast(NET[r && r.code] ? '需联网才能同意' : '没成功，请重试');
  }

  function sheetHit(id) {
    if (c.report.open) return reportHit(id);
    if (c.rules.open) {
      if (id === 'rules:agree') return agreeRules();
      if (id === 'rules:later' || id === 'sheet:close') {
        c.rules = { open: false, pendingAction: null };
        return invalidate();
      }
      if (id === 'rules:privacy') return privacy.openContract();
      if (id === 'rules:terms') return privacy.openAgreement();
      return;
    }
    if (c.home.sheet && c.screen === 'home') {
      if (id === 'sheet:close' || id === 'strike:ok' || id === 'howto:ok') {
        if (c.home.sheet === 'howto') {
          S.howtoSeen = true;
          store.save();
        }
        if (c.home.sheet === 'strike') {
          api.ackWarning({});
          if (c.home.data) c.home.data.me.warnPending = false;
        }
        c.home.sheet = null;
        invalidate();
      }
    }
  }

  const hasSheet = () => c.report.open || c.rules.open || (c.home.sheet && c.screen === 'home');

  // ---------------------------------------------------------------- picker + creating a chain

  function openPicker(source, preset) {
    const dailyList = (c.home.data ? c.home.data.daily.prompts : localDaily()).map((p) => ({ id: p.id, text: p.text, isDaily: true }));
    let prompts = dailyList;
    let selectedId = dailyList[0] ? dailyList[0].id : null;
    if (preset) {
      prompts = [{ id: preset.id, text: preset.text, isDaily: false }].concat(dailyList.filter((p) => p.id !== preset.id));
      selectedId = preset.id;
    }
    c.picker = { state: 'ready', prompts, selectedId, custom: { open: false, text: '', error: null }, errorText: null, batchCount: 0, source, sourceKind: preset ? 'same_again' : 'daily' };
    track('picker_view', { source });
    go('picker');
  }

  function pickerBatch() {
    const p = c.picker;
    const ex = (c.home.data ? c.home.data.daily.prompts : localDaily()).map((x) => x.id);
    const list = Pr.batch(rng, ex, 3).map((x) => ({ id: x.id, text: x.text, isDaily: false }));
    p.prompts = list;
    p.selectedId = list[0].id;
    p.batchCount++;
    p.sourceKind = 'batch';
    p.custom = { open: false, text: '', error: null };
    keyboard.close();
    invalidate();
  }

  function pickerCustomCancel() {
    const p = c.picker;
    if (!p) return;
    p.custom = { open: false, text: '', error: null };
    keyboard.close();
    invalidate();
  }

  function pickerCustomOpen() {
    const p = c.picker;
    p.custom.open = true;
    p.custom.error = null;
    openCustomKeyboard();
    invalidate();
  }

  function openCustomKeyboard() {
    const p = c.picker;
    keyboard.open({
      value: p.custom.text,
      maxLength: CONFIG.text.promptMax,
      placeholder: '想一个好画的题目',
      onInput: (v) => {
        p.custom.text = Tx.sanitize(v, CONFIG.text.promptMax);
        p.custom.error = null;
        p.errorText = null;
        invalidate();
      },
      onConfirm: () => pickerStart(),
    });
  }

  async function pickerStart() {
    const p = c.picker;
    if (!p || p.state === 'creating') return;
    const vm = V.pickerVm(p);
    if (!vm.canStart) return;
    const isCustom = p.custom.open;
    let req;
    let source;
    if (isCustom) {
      const chk = Tx.check(p.custom.text, 'prompt');
      if (!chk.ok) {
        p.custom.error = V.COPY.textLocal;
        track('custom_prompt_result', { result: 'local' });
        return invalidate();
      }
      req = { customText: chk.text };
      source = 'custom';
    } else {
      req = { promptId: p.selectedId };
      source = p.sourceKind === 'same_again' && p.selectedId === p.prompts[0].id ? 'same_again' : p.prompts.find((x) => x.id === p.selectedId).isDaily ? 'daily' : 'batch';
    }
    if (c.group.status === 'ok') req.groupRef = c.group.groupRef;
    p.state = 'creating';
    p.errorText = null;
    keyboard.close();
    invalidate();
    const r = await api.createChain(req);
    if (c.screen !== 'picker') return;
    p.state = 'ready';
    if (r && r.ok) {
      noteServerTime(r);
      if (isCustom) track('custom_prompt_result', { result: 'pass' });
      track('prompt_pick', { source, promptId: isCustom ? undefined : req.promptId, batchCount: p.batchCount });
      track('chain_create', { chainId: r.chainId, bound: !!r.bound });
      c.picker = null;
      beginTurn({ chainId: r.chainId, claimId: r.claim.claimId, step: 1, kind: 'draw', expiresAt: r.claim.expiresAt, source: { kind: 'prompt', text: r.claim.sourceText }, entryBack: 'home' });
      return;
    }
    const code = r && r.code;
    if (code === 'TEXT_REJECTED') {
      p.custom.error = V.COPY.textLocal;
      track('custom_prompt_result', { result: 'local' });
    } else if (code === 'TEXT_BLOCKED') {
      p.custom.error = V.COPY.promptBlocked;
      track('custom_prompt_result', { result: 'review' });
    } else if (code === 'MODERATION_BUSY') {
      p.errorText = V.COPY.promptBusy;
      track('custom_prompt_result', { result: 'busy' });
    } else if (code === 'RULES_REQUIRED') {
      needRules('start', () => pickerStart());
    } else if (NET[code]) {
      p.state = 'offline';
      p.errorText = V.COPY.offlineStart;
    } else if (code === 'START_LIMIT' || code === 'RESTRICTED' || code === 'UGC_PAUSED' || code === 'UGC_BUSY') {
      toast(code === 'START_LIMIT' ? V.COPY.startsUsed : code === 'UGC_BUSY' ? '今天接龙太热闹了，明天再开新的吧' : code === 'UGC_PAUSED' ? V.COPY.ugcPaused : '你暂时不能参与接龙');
      c.picker = null;
      goHome();
    } else {
      p.errorText = '没成功，请重试';
      track('error', { where: 'createChain', code });
    }
    if (isCustom && c.screen === "picker" && c.picker && c.picker.custom.open && c.picker.state === "ready") openCustomKeyboard();
    invalidate();
  }

  function pickerHit(id) {
    const p = c.picker;
    if (!p) return;
    if (id === 'back') {
      keyboard.close();
      c.picker = null;
      return popScreen();
    }
    if (id.indexOf('picker:select:') === 0) {
      p.selectedId = id.slice('picker:select:'.length);
      p.custom.open = false;
      keyboard.close();
      return invalidate();
    }
    if (id === 'picker:shuffle') return pickerBatch();
    if (id === 'picker:custom') return pickerCustomOpen();
    if (id === 'picker:customInput') return pickerCustomOpen();
    if (id === 'picker:customOk') return pickerStart();
    if (id === 'picker:customCancel') return pickerCustomCancel();
    if (id === 'picker:start') return pickerStart();
    if (id === 'picker:retry') {
      p.state = 'ready';
      p.errorText = null;
      return invalidate();
    }
  }

  // ---------------------------------------------------------------- turns (draw / describe)

  function persistTurn() {
    const t = c.turn;
    if (!t || t.status === 'timeUp') return;
    S.turn = {
      chainId: t.chainId,
      claimId: t.claimId,
      step: t.step,
      kind: t.kind,
      startedAt: t.startedAt,
      expiresAt: t.expiresAt,
      source: t.source,
      strokes: t.kind === 'draw' ? St.encode(t.tool.drawing()) : null,
      text: t.text,
      undoCount: t.tool ? t.tool.info().undoCount : 0,
      entryBack: t.entryBack,
    };
    store.save();
  }

  function clearTurn() {
    c.turn = null;
    S.turn = null;
    store.save();
    keyboard.close();
  }

  /**
   * t: { chainId, claimId, step, kind, expiresAt, source, entryBack, resume? }
   * source: { kind: 'prompt'|'text', text } for a draw step, { kind: 'draw', strokes } for a describe step.
   */
  function beginTurn(t) {
    const kind = t.kind;
    const tool = createDrawingTool({ palette: paletteToday() });
    const turn = {
      chainId: t.chainId,
      claimId: t.claimId,
      step: t.step,
      kind,
      startedAt: t.startedAt || now(),
      expiresAt: t.expiresAt,
      source: t.source,
      entryBack: t.entryBack || 'entry',
      tool,
      text: t.text || '',
      status: kind === 'draw' ? 'drawing' : 'typing',
      errorText: null,
      timeUpHandled: false,
      shakeUntil: 0,
      paletteAdState: 'idle',
      confirmClear: false,
      coachUntil: 0,
    };
    if (t.strokes) tool.load(t.strokes);
    if (kind === 'draw' && !S.coachSeen && t.step === 1 && !t.resume) {
      S.coachSeen = true;
      turn.coachUntil = now() + COACH_MS;
      store.save();
    }
    c.turn = turn;
    track('step_view', { chainId: t.chainId, step: t.step, kind });
    persistTurn();
    replace(kind === 'draw' ? 'draw' : 'describe');
    c.stack = c.stack.filter((s) => s !== 'draw' && s !== 'describe');
    if (kind === 'describe') openDescribeKeyboard();
    return turn;
  }

  function openDescribeKeyboard() {
    const t = c.turn;
    if (!t || t.kind !== 'describe') return;
    keyboard.open({
      value: t.text,
      maxLength: CONFIG.text.descMax,
      placeholder: '你觉得这画的是什么？',
      onInput: (v) => {
        if (!c.turn || c.turn !== t) return;
        const s = Tx.sanitize(v, CONFIG.text.descMax);
        if (s !== v) t.shakeUntil = now() + 300;
        t.text = s;
        if (t.status === 'blocked' || t.status === 'busy' || t.status === 'error') {
          t.status = 'typing';
          t.errorText = null;
        }
        persistTurn();
        invalidate();
      },
      onConfirm: () => submitTurn(false),
    });
  }

  async function resumeTurn() {
    const st = S.turn;
    if (!st) return;
    const r = await api.claimStep({ chainId: st.chainId, groupRef: c.group.status === 'ok' ? c.group.groupRef : undefined });
    if (r && r.ok && r.resumed && r.claimId === st.claimId) {
      noteServerTime(r);
      const drawing = st.strokes ? St.decode(st.strokes) : null;
      beginTurn({ chainId: st.chainId, claimId: st.claimId, step: st.step, kind: st.kind, expiresAt: r.expiresAt, source: st.source, startedAt: st.startedAt, strokes: drawing, text: st.text, entryBack: st.entryBack, resume: true });
      return;
    }
    S.turn = null;
    store.save();
    if (r && r.ok) {
      // a fresh claim we did not ask for: give it back so the 棒 is not locked for 150 s
      api.releaseClaim({ chainId: st.chainId, claimId: r.claimId });
    }
  }

  async function submitTurn(auto) {
    const t = c.turn;
    if (!t || t.status === 'submitting') return;
    if (t.kind === 'draw') {
      const drawing = t.tool.drawing();
      if (drawing.s.length < 1) return;
      const v = St.validate(drawing);
      if (!v.ok) {
        t.status = 'error';
        t.errorText = '这幅画没法提交，请撤销几笔再试';
        return invalidate();
      }
      t.status = 'submitting';
      t.errorText = null;
      invalidate();
      const info = t.tool.info();
      track('step_submit', { chainId: t.chainId, step: t.step, kind: 'draw', durationMs: now() - t.startedAt, auto: !!auto, strokes: info.strokes, points: info.points, undoCount: info.undoCount, colorsUsed: info.colorsUsed, palette: info.palette });
      const r = await api.submitStep({ chainId: t.chainId, claimId: t.claimId, strokes: drawing, clientMs: now() - t.startedAt, undoCount: info.undoCount });
      return afterSubmit(t, r, { strokes: drawing });
    }
    const chk = Tx.check(t.text, 'desc');
    if (!chk.ok) {
      t.status = 'blocked';
      t.errorText = V.COPY.textLocal;
      track('step_result', { chainId: t.chainId, step: t.step, kind: 'describe', result: 'rejected' });
      return invalidate();
    }
    t.status = 'submitting';
    t.errorText = null;
    keyboard.close();
    invalidate();
    track('step_submit', { chainId: t.chainId, step: t.step, kind: 'describe', durationMs: now() - t.startedAt, auto: !!auto, chars: Tx.countCp(chk.text), palette: false });
    const r = await api.submitStep({ chainId: t.chainId, claimId: t.claimId, text: chk.text, clientMs: now() - t.startedAt, undoCount: 0 });
    return afterSubmit(t, r, { text: chk.text });
  }

  function discardTurn(reason, message, then) {
    const t = c.turn;
    if (t) track('step_release', { chainId: t.chainId, step: t.step, reason });
    clearTurn();
    if (message) toast(message);
    if (then) then();
  }

  function afterSubmit(t, r, mine) {
    if (c.turn !== t) return;
    const res = r || { ok: false, code: 'NETWORK' };
    if (res.ok) {
      noteServerTime(res);
      track('step_result', { chainId: t.chainId, step: t.step, kind: t.kind, result: res.state });
      clearTurn();
      return showSent(t, res, mine);
    }
    const code = res.code;
    track('step_result', { chainId: t.chainId, step: t.step, kind: t.kind, result: code === 'TEXT_BLOCKED' ? 'blocked' : code === 'MODERATION_BUSY' ? 'busy' : code === 'TEXT_REJECTED' ? 'rejected' : 'error' });
    if (code === 'TEXT_BLOCKED' || code === 'TEXT_REJECTED') {
      t.status = 'blocked';
      t.errorText = code === 'TEXT_BLOCKED' ? V.COPY.textBlocked : V.COPY.textLocal;
      if (t.kind === 'describe') openDescribeKeyboard();
    } else if (code === 'MODERATION_BUSY') {
      t.status = t.kind === 'describe' ? 'busy' : 'error';
      t.errorText = V.COPY.textBusy;
      if (t.kind === 'describe') openDescribeKeyboard();
    } else if (code === 'CLAIM_LOST') {
      discardTurn('claimLost', V.COPY.claimLost, () => reopenEntryAfterTurn(t));
    } else if (code === 'STEP_LIMIT') {
      discardTurn('claimLost', V.COPY.stepLimit, goHome);
    } else if (code === 'RESTRICTED' || code === 'UGC_PAUSED') {
      discardTurn('claimLost', code === 'UGC_PAUSED' ? V.COPY.ugcPaused : '你暂时不能参与接龙', goHome);
    } else if (code === 'RULES_REQUIRED') {
      t.status = t.kind === 'draw' ? 'drawing' : 'typing';
      needRules('claim', () => submitTurn(false));
    } else if (code === 'INVALID_STROKES') {
      t.status = 'error';
      t.errorText = '这幅画没法提交，请撤销几笔再试';
    } else {
      t.status = 'error';
      t.errorText = '没传出去';
      if (!NET[code]) track('error', { where: 'submitStep', code });
    }
    invalidate();
  }

  function reopenEntryAfterTurn(t) {
    if (t.entryBack === 'home' || t.step === 1) return goHome();
    c.stack = [];
    c.screen = 'home';
    openEntry(t.chainId);
  }

  async function releaseTurn(reason) {
    const t = c.turn;
    if (!t) return;
    const chainId = t.chainId;
    const claimId = t.claimId;
    discardTurn(reason, null, null);
    api.releaseClaim({ chainId, claimId });
    if (t.entryBack === 'home' || t.step === 1) goHome();
    else {
      c.stack = [];
      c.screen = 'home';
      openEntry(chainId);
    }
  }

  function handleTimeUp(t) {
    t.timeUpHandled = true;
    const info = t.tool.info();
    const act = C.timeUpAction(t.kind, { strokes: info.strokes, chars: Tx.countCp(t.text) });
    if (act === 'submit') return submitTurn(true);
    // nothing worth sending: give the 棒 back and show the 时间到 modal (draw:timeUpOk / describe:timeUpOk leaves)
    track('step_release', { chainId: t.chainId, step: t.step, reason: 'timeUp' });
    api.releaseClaim({ chainId: t.chainId, claimId: t.claimId });
    S.turn = null;
    store.save();
    keyboard.close();
    t.status = 'timeUp';
    t.errorText = null;
    invalidate();
  }

  function leaveTimeUp() {
    const t = c.turn;
    if (!t || t.status !== 'timeUp') return;
    c.turn = null;
    if (t.entryBack === 'home' || t.step === 1) goHome();
    else {
      c.stack = [];
      c.screen = 'home';
      openEntry(t.chainId);
    }
  }

  function drawHit(id) {
    const t = c.turn;
    if (!t) return;
    if (id === 'back') {
      c.ui.dialog = { text: '放弃这一棒？群友可以接着画', confirmLabel: '放弃', cancelLabel: '继续画', danger: true, action: 'quit' };
      return invalidate();
    }
    if (t.status === 'timeUp') return id === 'draw:timeUpOk' ? leaveTimeUp() : undefined;
    if (t.status === 'submitting' || id === 'draw:lock') return;
    if (id === 'draw:submit' || id === 'draw:retry') {
      if (now() - c.lastPrimaryAt < PRIMARY_DEBOUNCE_MS) return;
      c.lastPrimaryAt = now();
      return submitTurn(false);
    }
    if (id.indexOf('draw:color:') === 0) {
      t.tool.setColor(+id.slice('draw:color:'.length));
      return invalidate();
    }
    if (id.indexOf('draw:size:') === 0) {
      t.tool.setSize(+id.slice('draw:size:'.length));
      return invalidate();
    }
    if (id === 'draw:undo') {
      if (t.tool.undo()) persistTurn();
      return invalidate();
    }
    if (id === 'draw:clear') {
      if (t.tool.info().strokes === 0) return;
      c.ui.dialog = { text: '清空画布？', confirmLabel: '清空', cancelLabel: '取消', danger: true, action: 'clear' };
      return invalidate();
    }
    if (id === 'draw:report') return openReport({ chainId: t.chainId, step: t.step - 1 });
    if (id === 'draw:paletteAd') return paletteAd('draw');
  }

  function describeHit(id) {
    const t = c.turn;
    if (!t) return;
    if (id === 'back') {
      keyboard.close();
      c.ui.dialog = { text: '放弃这一棒？群友可以接着画', confirmLabel: '放弃', cancelLabel: '继续', danger: true, action: 'quit' };
      return invalidate();
    }
    if (t.status === 'timeUp') return id === 'describe:timeUpOk' ? leaveTimeUp() : undefined;
    if (t.status === 'submitting' || id === 'describe:lock') return;
    if (id === 'describe:input') return openDescribeKeyboard();
    if (id === 'describe:submit') {
      if (now() - c.lastPrimaryAt < PRIMARY_DEBOUNCE_MS) return;
      c.lastPrimaryAt = now();
      return submitTurn(false);
    }
    if (id === 'describe:report') return openReport({ chainId: t.chainId, step: t.step - 1 });
  }

  async function paletteAd(where) {
    const t = c.turn;
    if (where === 'draw') {
      if (!t || t.paletteAdState === 'playing' || t.tool.info().strokes > 0 || t.tool.info().drawing) return; // only before the first stroke
      t.paletteAdState = 'playing';
    } else {
      if (c.settings.paletteAdState === 'playing') return;
      c.settings.paletteAdState = 'playing';
    }
    invalidate();
    const out = await ads.rewarded('palette');
    let ok = false;
    if (out.granted) {
      const r = await api.grantReward({ kind: 'palette', noFill: !!out.noFill });
      if (r && r.ok) {
        ok = true;
        S.paletteDay = todayKey();
        if (c.home.data) c.home.data.me.paletteToday = true;
        store.save();
        if (c.turn) c.turn.tool.unlockPalette();
        toast(out.toast || '今日彩笔已解锁');
      } else toast(r && r.code === 'REWARD_LIMIT' ? '今天的彩笔已解锁过了' : '没成功，请稍后再试');
    } else if (out.toast) toast(out.toast);
    if (where === 'draw') {
      if (c.turn === t && t) t.paletteAdState = 'idle';
    } else c.settings.paletteAdState = 'idle';
    void ok;
    invalidate();
  }

  // ---------------------------------------------------------------- 已传出

  function subscribeInitial(chainId) {
    const f = c.features.subscribe;
    if (!f || !f.tmplId || S.subscribe.bannedDevice || S.subscribe.declined[chainId]) return 'hidden';
    return 'offer';
  }

  function showSent(t, res, mine) {
    c.sent = {
      chainId: t.chainId,
      step: t.step,
      kind: t.kind,
      mine,
      modState: res.state === 'passed' ? 'passed' : 'pending',
      revealed: !!res.revealed,
      firstTime: !S.sentExplainerSeen,
      startedAt: now(),
      lastPoll: now(),
      subscribe: subscribeInitial(t.chainId),
      updatable: !!c.features.updatableCard,
    };
    S.sentExplainerSeen = true;
    store.save();
    if (res.revealed) {
      c.stack = [];
      c.screen = 'home';
      return openReveal(t.chainId, { fromSubmit: true });
    }
    if (c.sent.subscribe === 'offer') track('subscribe_offer', { where: 'sent' });
    replace('sent');
    c.stack = ['home'];
    invalidate();
  }

  async function pollSent() {
    const s = c.sent;
    if (!s || s.modState !== 'pending') return;
    s.lastPoll = now();
    const r = await api.getMyChains({ chainId: s.chainId });
    if (!r || !r.ok || !r.items[0]) return;
    const item = r.items[0];
    const mine = (item.mine || []).filter((m) => m.n === s.step)[0];
    if (mine) {
      if (mine.modState === 'passed' || mine.modState === 'blocked' || mine.modState === 'void') s.modState = mine.modState;
      else if (mine.modState === 'hidden' || mine.modState === 'deleted') s.modState = 'passed';
    }
    if (item.status === 'revealed') s.revealed = true;
    invalidate();
  }

  async function subscribe(chainId, target) {
    const f = c.features.subscribe;
    if (!f || !f.tmplId || !wx.requestSubscribeMessage) return;
    if (target.subscribe === 'requesting') return;
    target.subscribe = 'requesting';
    invalidate();
    wx.requestSubscribeMessage({
      tmplIds: [f.tmplId],
      success: async (res) => {
        const v = res && res[f.tmplId];
        if (v === 'accept') {
          const r = await api.subscribeReveal({ chainId });
          target.subscribe = r && r.ok ? 'granted' : 'hidden';
          if (!(r && r.ok)) toast('提醒未开启');
          track('subscribe_result', { result: r && r.ok ? 'accept' : 'error' });
        } else {
          S.subscribe.declined[chainId] = true;
          if (v === 'ban') S.subscribe.bannedDevice = true;
          store.save();
          target.subscribe = 'declined';
          track('subscribe_result', { result: v || 'reject' });
        }
        invalidate();
      },
      fail: (e) => {
        if (e && (e.errCode === 20004 || e.errno === 20004)) S.subscribe.bannedDevice = true;
        store.save();
        target.subscribe = 'hidden';
        toast('提醒未开启');
        track('subscribe_result', { result: 'error' });
        invalidate();
      },
    });
  }

  function sentHit(id) {
    const s = c.sent;
    if (!s) return;
    switch (id) {
      case 'back':
        c.sent = null;
        return goHome();
      case 'sent:share':
        return shareInvite(s.chainId);
      case 'sent:subscribe':
        return subscribe(s.chainId, s);
      case 'sent:group':
        return openGroup();
      case 'sent:again':
        return needRules('start', () => {
          if (c.home.data && c.home.data.me.startsLeft <= 0) return toast(V.COPY.startsUsed);
          openPicker('home');
        });
      case 'sent:reveal':
        return openReveal(s.chainId);
    }
  }

  // ---------------------------------------------------------------- chain entry

  async function openEntry(chainId, opts) {
    c.entry = { chainId, state: 'loading', data: null, confirmReveal: false, subscribe: 'hidden', notice: c.pendingNotice || null };
    c.pendingNotice = null;
    if (c.screen !== 'entry') go('entry');
    await loadEntry(opts);
  }

  async function loadEntry(opts) {
    const e = c.entry;
    if (!e) return;
    e.state = 'loading';
    invalidate();
    const r = await api.getChain({ chainId: e.chainId, groupRef: c.group.status === 'ok' ? c.group.groupRef : undefined, wantActivity: false });
    if (c.entry !== e) return;
    if (r && r.ok) {
      noteServerTime(r);
      e.data = r;
      e.state = r.state;
      if (opts && opts.card) track('card_open', { cardKind: 'invite', hasShareTicket: opts.card.hasShareTicket, chainState: r.state });
      if (r.state === 'revealedTeaser') {
        c.entry = null;
        return openReveal(e.chainId, { replace: true });
      }
      if (r.state === 'restricted') track('restriction_shown', { level: 'entry' });
      e.subscribe = (r.state === 'pending' || r.state === 'taken') && r.isParticipant ? subscribeInitial(e.chainId) : 'hidden';
    } else {
      e.state = NET[r && r.code] ? 'offline' : 'error';
      if (opts && opts.card) track('card_open', { cardKind: 'invite', hasShareTicket: opts.card.hasShareTicket, chainState: e.state });
      if (r && !NET[r.code]) track('error', { where: 'getChain', code: r.code });
    }
    invalidate();
  }

  async function claim() {
    const e = c.entry;
    if (!e || !e.data) return;
    const step = e.data.nextStep;
    const r = await api.claimStep({ chainId: e.chainId, groupRef: c.group.status === 'ok' ? c.group.groupRef : undefined });
    const result = r && r.ok ? 'ok' : r && r.code === 'TAKEN' ? 'taken' : r && r.code === 'PENDING' ? 'pending' : r && r.code === 'PREV_MINE' ? 'prevMine' : r && (r.code === 'CAP_REACHED' || r.code === 'STEP_LIMIT' || r.code === 'CLAIM_LIMIT') ? 'cap' : r && r.code === 'WRONG_GROUP' ? 'wrongGroup' : r && r.code === 'NEED_GROUP' ? 'needGroup' : r && r.code === 'RESTRICTED' ? 'restricted' : r && (r.code === 'CHAIN_CLOSED' || r.code === 'CHAIN_NOT_FOUND') ? 'closed' : 'error';
    track('claim_attempt', { chainId: e.chainId, step, result });
    if (c.entry !== e) return;
    if (r && r.ok) {
      noteServerTime(r);
      if (r.prev.kind === 'paused') {
        api.releaseClaim({ chainId: e.chainId, claimId: r.claimId });
        toast(V.COPY.paused);
        return loadEntry();
      }
      const source = r.kind === 'draw' ? { kind: 'text', text: r.prev.text } : { kind: 'draw', strokes: r.prev.strokes };
      return beginTurn({ chainId: e.chainId, claimId: r.claimId, step: r.step, kind: r.kind, expiresAt: r.expiresAt, source, entryBack: 'entry', resume: false });
    }
    if (r && r.code === 'RULES_REQUIRED') return needRules('claim', () => claim());
    if (r && r.code === 'TAKEN') toast('被群友抢先一步');
    if (r && r.code === 'STEP_LIMIT') toast(V.COPY.stepLimit);
    if (isNet(r)) {
      e.state = 'offline';
      return invalidate();
    }
    loadEntry();
  }

  function entryVmData() {
    const e = c.entry;
    const d = Object.assign({}, e.data || {});
    d.state = e.state;
    if (e.state === 'loading' || e.state === 'offline' || e.state === 'error') return Object.assign(d, { passed: (e.data && e.data.passed) || 0 });
    d.subscribe = e.subscribe;
    d.confirmReveal = e.confirmReveal;
    d.notice = e.notice;
    return d;
  }

  function entryHit(id) {
    const e = c.entry;
    if (!e) return;
    switch (id) {
      case 'back':
      case 'entry:home':
        c.entry = null;
        return c.stack.length ? popScreen() : goHome();
      case 'entry:retry':
        return loadEntry();
      case 'entry:claim':
        if (e.state === 'rulesRequired') return needRules('claim', () => claim());
        if (e.state === 'claimable') return claim();
        return;
      case 'entry:reveal':
        return openReveal(e.chainId);
      case 'entry:group':
        return openGroup();
      case 'entry:new':
        return needRules('start', () => openPicker('home'));
      case 'entry:refresh':
        return loadEntry();
      case 'entry:teaser':
        return openReveal(e.chainId);
      case 'entry:revealNow':
        c.ui.dialog = { text: '现在揭晓？之后就不能再接了', confirmLabel: '现在揭晓', cancelLabel: '再等等', action: 'revealNow' };
        return invalidate();
      case 'entry:share':
        return shareInvite(e.chainId);
      case 'entry:subscribe':
        return subscribe(e.chainId, e);
      case 'entry:mine':
        return openDetail(e.chainId);
      case 'entry:sameAgain':
        return sameAgainFromEntry();
    }
  }

  async function doRevealNow() {
    const e = c.entry;
    if (!e) return;
    const r = await api.revealNow({ chainId: e.chainId });
    if (r && r.ok) return openReveal(e.chainId, { replace: true });
    if (r && (r.code === 'TAKEN' || r.code === 'PENDING')) toast('有群友正在接，稍后再揭晓');
    else if (r && r.code === 'TOO_EARLY') toast('至少传完 4 棒才能揭晓');
    else toast(NET[r && r.code] ? V.COPY.offlineStart : '没成功，请重试');
    loadEntry();
  }

  async function sameAgainFromEntry() {
    const e = c.entry;
    if (!e) return;
    const r = await api.getMyChains({ chainId: e.chainId });
    const item = r && r.ok && r.items[0];
    if (!item || !item.promptId) return toast('这条接龙不能同题再传');
    track('same_again', { fromRole: 'participant' });
    needRules('start', () => openPicker('same_again', { id: item.promptId, text: item.promptText }));
  }

  // ---------------------------------------------------------------- reveal / teaser

  async function openReveal(chainId, opts) {
    opts = opts || {};
    c.reveal = { chainId, state: 'loading', data: null, autoplay: { enabled: false, playing: false, startedAt: 0 }, solo: null, replays: 0, fromCard: opts.card || null, startedAt: now() };
    if (opts.replace) {
      c.screen = 'reveal';
      invalidate();
    } else if (c.screen !== 'reveal') go('reveal');
    await loadReveal();
  }

  async function loadReveal() {
    const rv = c.reveal;
    if (!rv) return;
    rv.state = 'loading';
    invalidate();
    const r = await api.getReveal({ chainId: rv.chainId });
    if (c.reveal !== rv) return;
    if (rv.fromCard) track('card_open', { cardKind: 'reveal', hasShareTicket: rv.fromCard.hasShareTicket, chainState: r && r.ok ? 'revealedParticipant' : r && r.code === 'NOT_PARTICIPANT' ? 'revealedTeaser' : r && r.code === 'CHAIN_REMOVED' ? 'removed' : 'other' });
    if (r && r.ok) {
      rv.data = r;
      const allPaused = r.steps.length > 0 && r.steps.every((s) => s.placeholder === 'paused');
      rv.state = allPaused ? 'paused' : 'ready';
      const first = !S.seenReveals[rv.chainId];
      if (first) {
        S.seenReveals[rv.chainId] = true;
        S.lifetimeReveals++;
        store.save();
      }
      rv.autoplay = { enabled: first, playing: first && !allPaused, startedAt: now() };
      track('reveal_view', { chainId: rv.chainId, role: 'participant', autoplay: first });
      if (c.home.data && c.home.data.me) c.home.data.me.unseenReveals = Math.max(0, (c.home.data.me.unseenReveals || 0) - (first ? 1 : 0));
    } else if (r && r.code === 'NOT_PARTICIPANT') {
      c.reveal = null;
      return showTeaser(rv.chainId, r.teaser);
    } else if (r && r.code === 'CHAIN_REMOVED') {
      c.reveal = null;
      c.teaser = { chainId: rv.chainId, state: 'removed' };
      c.screen = 'teaser';
    } else if (r && (r.code === 'CHAIN_NOT_FOUND')) {
      c.reveal = null;
      c.teaser = { chainId: rv.chainId, state: 'notFound' };
      c.screen = 'teaser';
    } else if (r && r.code === 'NOT_REVEALED') {
      c.reveal = null;
      return openEntry(rv.chainId, {});
    } else {
      rv.state = NET[r && r.code] ? 'offline' : 'error';
      if (r && !NET[r.code]) track('error', { where: 'getReveal', code: r.code });
    }
    invalidate();
  }

  function showTeaser(chainId, t) {
    c.teaser = { chainId, state: 'ready', data: t };
    track('reveal_view', { chainId, role: 'teaser', autoplay: false });
    if (c.screen !== 'teaser') {
      if (c.screen === 'reveal') c.screen = 'teaser';
      else go('teaser');
    }
    invalidate();
  }

  function leaveReveal() {
    const rv = c.reveal;
    c.reveal = null;
    const lifetime = S.lifetimeReveals;
    if (c.stack.length) popScreen();
    else goHome();
    if (rv) ads.interstitial({ lifetimeReveals: lifetime });
  }

  function revealHit(id) {
    const rv = c.reveal;
    if (!rv) return;
    if (rv.autoplay.playing && id !== 'back') {
      rv.autoplay.playing = false; // any tap skips to the full strip
      return invalidate();
    }
    if (id === 'back') return leaveReveal();
    if (id === 'reveal:retry') return loadReveal();
    if (id === 'reveal:skip') {
      rv.autoplay.playing = false;
      return invalidate();
    }
    if (id === 'reveal:replayAll') {
      rv.autoplay = { enabled: true, playing: true, startedAt: now() };
      rv.solo = null;
      rv.replays++;
      return invalidate();
    }
    if (id.indexOf('reveal:drawing:') === 0) {
      rv.solo = { n: +id.slice('reveal:drawing:'.length), startedAt: now() };
      return invalidate();
    }
    if (id.indexOf('reveal:laugh:') === 0) return laugh(+id.slice('reveal:laugh:'.length));
    if (id.indexOf('reveal:report:') === 0) return openReport({ chainId: rv.chainId, step: +id.slice('reveal:report:'.length) });
    if (id === 'reveal:share') return shareReveal();
    if (id === 'reveal:sameAgain') return sameAgainFromReveal();
  }

  async function laugh(n) {
    const rv = c.reveal;
    if (!rv || !rv.data) return;
    const row = rv.data.steps.filter((s) => s.n === n)[0];
    if (!row || row.placeholder) return;
    row.myLaugh = !row.myLaugh;
    row.laughs += row.myLaugh ? 1 : -1;
    invalidate();
    const r = await api.laugh({ chainId: rv.chainId, step: n });
    if (r && r.ok) {
      row.laughs = r.laughs;
      row.myLaugh = r.mine;
      track('laugh', { chainId: rv.chainId, step: n, on: r.mine });
    } else {
      row.myLaugh = !row.myLaugh;
      row.laughs += row.myLaugh ? 1 : -1;
      toast(V.COPY.offlineStart);
    }
    invalidate();
  }

  function sameAgainFromReveal() {
    const rv = c.reveal;
    if (!rv || !rv.data || !rv.data.promptId || rv.data.custom) return;
    track('same_again', { fromRole: 'participant' });
    needRules('start', () => openPicker('same_again', { id: rv.data.promptId, text: rv.data.promptText }));
  }

  function teaserHit(id) {
    const t = c.teaser;
    if (!t) return;
    switch (id) {
      case 'back':
        c.teaser = null;
        return c.stack.length ? popScreen() : goHome();
      case 'teaser:retry':
        return openReveal(t.chainId, { replace: true });
      case 'teaser:group':
        return openGroup();
      case 'teaser:report':
        return openReport({ chainId: t.chainId, step: 0 });
      case 'teaser:sameAgain':
        if (t.data && t.data.promptId && t.data.canSameAgain) {
          track('same_again', { fromRole: 'teaser' });
          return needRules('start', () => openPicker('same_again', { id: t.data.promptId, text: t.data.promptText }));
        }
        return;
    }
  }

  // ---------------------------------------------------------------- group + share

  async function shareInvite(chainId) {
    const r = await api.getChain({ chainId, groupRef: c.group.status === 'ok' ? c.group.groupRef : undefined, wantActivity: true });
    if (!r || !r.ok) return toast(V.COPY.offlineStart);
    if (!(r.state === 'claimable' || r.state === 'taken' || r.state === 'pending' || r.state === 'prevMine' || r.state === 'capReached' || r.state === 'rulesRequired')) return toast('这条接龙现在不能邀请');
    // while the latest 棒 is in review the card announces the 棒 that opens when it passes
    let { passed, nextStep, nextKind } = r;
    if (r.state === 'pending') {
      passed += 1;
      nextStep += 1;
      nextKind = C.kindOfStep(nextStep);
    }
    if (nextStep > CONFIG.chain.length) return toast('这条接龙快传完了');
    share.shareInvite({ chainId, passed, nextStep, nextKind, activityId: r.activityId, updatable: !!c.features.updatableCard });
  }

  function shareReveal() {
    const rv = c.reveal;
    if (!rv || !rv.data) return;
    const vm = V.revealVm({ state: 'ready', chainId: rv.chainId, data: rv.data, now: now(), autoplay: rv.autoplay });
    const finalText = vm.summaryText.indexOf('传成了') > 0 ? (vm.steps.slice().reverse().filter((s) => s.kind === 'describe' && !s.placeholder)[0] || {}).text : null;
    share.shareReveal({ chainId: rv.chainId, promptText: rv.data.promptText, finalText, passed: rv.data.passed, participantCount: rv.data.participantCount });
  }

  async function connectGroup(entry) {
    c.group = { status: 'checking', groupRef: null, shareTicket: entry.shareTicket, errCode: undefined };
    invalidate();
    const g = await share.enterGroup(entry);
    c.group = { status: g.status, groupRef: g.groupRef, shareTicket: entry.shareTicket, errCode: g.errCode };
    if (g.status === 'ok') refreshWaiting();
    invalidate();
    return g;
  }

  async function openGroup() {
    c.groupList = { state: c.group.status === 'ok' ? 'loading' : c.group.status === 'checking' ? 'checkingGroup' : c.group.status === 'failed' ? 'failed' : 'noGroup', data: null };
    if (c.screen !== 'group') go('group');
    invalidate();
    if (c.group.status === 'checking') return;
    if (c.group.status === 'ok') await loadGroup();
    else track('group_list_view', { state: c.groupList.state, counts: 0 });
  }

  async function loadGroup() {
    const g = c.groupList;
    if (!g) return;
    g.state = 'loading';
    invalidate();
    const r = await api.getGroupChains({ groupRef: c.group.groupRef });
    if (c.groupList !== g) return;
    if (r && r.ok) {
      g.data = r;
      g.state = r.waiting.length + r.inProgress.length + r.revealed.length === 0 ? 'empty' : 'ready';
      c.home.waitingInGroup = r.waiting.length;
    } else g.state = 'error';
    track('group_list_view', { state: g.state, counts: g.data ? g.data.waiting.length + g.data.inProgress.length + g.data.revealed.length : 0 });
    invalidate();
  }

  function groupHit(id) {
    const g = c.groupList;
    if (!g) return;
    if (id === 'back') {
      c.groupList = null;
      return popScreen();
    }
    if (id === 'group:retry') return loadGroup();
    if (id === 'group:start') return needRules('start', () => openPicker('home'));
    if (id.indexOf('group:chain:') === 0) return openEntry(id.slice('group:chain:'.length));
    if (id.indexOf('group:reveal:') === 0) return openReveal(id.slice('group:reveal:'.length));
    if (id.indexOf('group:teaser:') === 0) return openReveal(id.slice('group:teaser:'.length));
  }

  // ---------------------------------------------------------------- album + detail

  async function openAlbum() {
    c.album = { state: 'loading', items: S.albumCache ? S.albumCache.items : [], cursor: null };
    go('album');
    await loadAlbum(false);
  }

  async function loadAlbum(more) {
    const a = c.album;
    if (!a) return;
    if (!more) a.state = 'loading';
    invalidate();
    const r = await api.getMyChains(more && a.cursor ? { cursor: a.cursor } : {});
    if (c.album !== a) return;
    if (r && r.ok) {
      a.items = more ? a.items.concat(r.items) : r.items;
      a.cursor = r.cursor;
      a.state = a.items.length ? 'ready' : 'empty';
      if (!more) {
        S.albumCache = { at: now(), items: r.items.slice(0, 20) };
        store.save();
      }
    } else if (NET[r && r.code]) a.state = a.items.length ? 'offline' : 'offline';
    else a.state = 'error';
    track('album_view', { state: a.state, counts: a.items.length });
    invalidate();
  }

  function albumHit(id) {
    const a = c.album;
    if (!a) return;
    if (id === 'back') {
      c.album = null;
      return popScreen();
    }
    if (id === 'album:retry') return loadAlbum(false);
    if (id === 'album:start') return needRules('start', () => openPicker('home'));
    if (id === 'album:more') return loadAlbum(true);
    if (id.indexOf('album:item:') === 0) {
      const cid = id.slice('album:item:'.length);
      const it = a.items.filter((x) => x.chainId === cid)[0];
      if (!it) return;
      if (it.status === 'revealed') return openReveal(cid);
      if (it.status === 'open' || it.status === 'pending') return openEntry(cid);
      return openDetail(cid);
    }
  }

  async function openDetail(chainId) {
    c.detail = { chainId, state: 'loading', item: null };
    if (c.screen !== 'detail') go('detail');
    invalidate();
    const r = await api.getMyChains({ chainId });
    if (c.detail && c.detail.chainId === chainId) {
      if (r && r.ok && r.items[0]) {
        c.detail.item = r.items[0];
        c.detail.state = 'ready';
      } else c.detail.state = NET[r && r.code] ? 'offline' : 'error';
      invalidate();
    }
  }

  function detailHit(id) {
    const d = c.detail;
    if (!d) return;
    if (id === 'back') {
      c.detail = null;
      return popScreen();
    }
    if (id.indexOf('detail:delete:') === 0) {
      const n = +id.slice('detail:delete:'.length);
      c.ui.dialog = { text: '删除这一棒？删除后别人将看不到它', confirmLabel: '删除', cancelLabel: '取消', danger: true, action: 'deleteStep', n };
      invalidate();
    }
  }

  async function doDeleteStep(n) {
    const d = c.detail;
    if (!d) return;
    const r = await api.deleteMyStep({ chainId: d.chainId, step: n });
    if (r && r.ok) {
      track('delete_step', { scope: 'one', count: r.count });
      toast('已删除');
      openDetail(d.chainId);
    } else toast(NET[r && r.code] ? V.COPY.offlineStart : '没成功，请重试');
  }

  // ---------------------------------------------------------------- settings

  function openSettings() {
    c.settings.deleteState = 'idle';
    go('settings');
  }

  function settingsHit(id) {
    switch (id) {
      case 'back':
        return popScreen();
      case 'settings:sound':
        return toggleMute();
      case 'settings:largeText':
        S.largeText = !S.largeText;
        store.save();
        return invalidate();
      case 'settings:highContrast':
        S.highContrast = !S.highContrast;
        store.save();
        return invalidate();
      case 'settings:rules':
        c.rules = { open: true, pendingAction: null };
        return invalidate();
      case 'settings:terms':
        return privacy.openAgreement();
      case 'settings:privacy':
        return privacy.openContract();
      case 'settings:palette':
        if (paletteToday()) return toast('今日彩笔已解锁');
        return paletteAd('settings');
      case 'settings:deleteAll':
        c.ui.dialog = { text: '删除我的全部接龙内容？删除后，你画的和写的内容将不再展示，正在进行的接龙会让出你的那一棒', confirmLabel: '继续', cancelLabel: '取消', danger: true, action: 'deleteAll1' };
        c.settings.deleteState = 'confirm1';
        return invalidate();
    }
  }

  async function doDeleteAll() {
    c.settings.deleteState = 'deleting';
    invalidate();
    const r = await api.deleteMyStep({ all: true });
    if (r && r.ok) {
      c.settings.deleteState = 'done';
      track('delete_step', { scope: 'all', count: r.count });
      toast('已删除 ' + r.count + ' 棒');
    } else {
      c.settings.deleteState = 'error';
      toast(NET[r && r.code] ? V.COPY.offlineStart : '没成功，请重试');
    }
    invalidate();
  }

  // ---------------------------------------------------------------- report

  function openReport(target) {
    c.report = { open: true, target, state: 'idle', reason: null };
    invalidate();
  }

  async function submitReport() {
    const rp = c.report;
    if (!rp.reason || rp.state === 'submitting') return;
    rp.state = 'submitting';
    invalidate();
    const r = await api.report({ chainId: rp.target.chainId, step: rp.target.step, reason: rp.reason });
    if (r && r.ok) {
      rp.state = 'done';
      track('report_submit', { reason: rp.reason, target: rp.target.step === 0 ? 'teaser' : 'step', reopened: !!r.reopened });
      toast('已举报，该内容已隐藏，我们会尽快核实');
      c.report = { open: false, target: rp.target, state: 'idle', reason: null };
      afterReport(rp.target, r);
    } else if (r && r.code === 'DUP_REPORT') rp.state = 'dup';
    else if (r && r.code === 'REPORT_LIMIT') rp.state = 'limit';
    else rp.state = 'error';
    invalidate();
  }

  function afterReport(target, r) {
    // the reported 棒 is hidden for everyone at once; if we held the claim on the next 棒 it was cancelled
    if (c.turn && c.turn.chainId === target.chainId && target.step === c.turn.step - 1) {
      const chainId = c.turn.chainId;
      discardTurn('claimLost', null, null);
      c.pendingNotice = r.reopened ? '上一棒已隐藏，你可以接这一棒' : null;
      c.stack = [];
      c.screen = 'home';
      return openEntry(chainId);
    }
    if (c.screen === 'reveal' && c.reveal) {
      if (target.step === 0) {
        c.reveal = null;
        return goHome();
      }
      const row = c.reveal.data && c.reveal.data.steps.filter((s) => s.n === target.step)[0];
      if (row) {
        row.placeholder = 'reported';
        delete row.strokes;
        delete row.text;
      }
    }
    if (c.screen === 'teaser') {
      c.teaser = null;
      goHome();
    }
  }

  function reportHit(id) {
    const rp = c.report;
    if (id === 'report:cancel' || id === 'sheet:close') {
      c.report = { open: false, target: rp.target, state: 'idle', reason: null };
      return invalidate();
    }
    if (id.indexOf('report:reason:') === 0) {
      rp.reason = id.slice('report:reason:'.length);
      if (rp.state !== 'submitting') rp.state = 'idle';
      return invalidate();
    }
    if (id === 'report:submit' || id === 'report:retry') return submitReport();
  }

  // ---------------------------------------------------------------- card entry

  function handleEntry(options, cold) {
    const e = parseEnter(options || {});
    if (e.kind === 'none') return e;
    const key = JSON.stringify([options.query, options.shareTicket, options.scene]);
    if (key === c.lastEntryKey && now() - c.lastEntryAt < ENTRY_DEDUPE_MS) return e;
    c.lastEntryKey = key;
    c.lastEntryAt = now();
    if (!cold && (c.screen === 'draw' || c.screen === 'describe') && c.turn) {
      c.pendingEntry = e;
      toast('群里有新接龙，传完这一棒再看');
      return e;
    }
    routeEntry(e);
    return e;
  }

  async function routeEntry(e) {
    if (e.kind === 'fallbackShare') {
      track('card_open', { cardKind: 'invite', hasShareTicket: false, chainState: 'fallback' });
      return;
    }
    if (e.kind === 'malformed') {
      track('error', { where: 'card_entry', code: 'malformed' });
      return;
    }
    // a new card is a new entry: the old group context no longer applies
    c.group = { status: 'none', groupRef: null, shareTicket: null, errCode: undefined };
    if (e.join) await connectGroup(e);
    const card = { hasShareTicket: e.hasShareTicket };
    c.stack = [];
    c.screen = 'home';
    if (e.kind === 'invite') await openEntry(e.chainId, { card });
    else if (e.kind === 'reveal') await openReveal(e.chainId, { card });
  }

  // ---------------------------------------------------------------- dialogs

  function dialogConfirm() {
    const d = c.ui.dialog;
    c.ui.dialog = null;
    if (!d) return;
    switch (d.action) {
      case 'quit':
        return releaseTurn('quit');
      case 'clear':
        if (c.turn) {
          c.turn.tool.clear();
          persistTurn();
        }
        return;
      case 'revealNow':
        return doRevealNow();
      case 'deleteStep':
        return doDeleteStep(d.n);
      case 'deleteAll1':
        c.ui.dialog = { text: '再确认一次：真的要删除全部内容吗？这个操作不能撤销', confirmLabel: '删除全部', cancelLabel: '取消', danger: true, action: 'deleteAll2' };
        c.settings.deleteState = 'confirm2';
        return;
      case 'deleteAll2':
        return doDeleteAll();
    }
  }

  function dialogCancel() {
    const d = c.ui.dialog;
    c.ui.dialog = null;
    if (d && (d.action === 'deleteAll1' || d.action === 'deleteAll2')) c.settings.deleteState = 'idle';
    if (d && d.action === 'quit' && c.turn && c.turn.kind === 'describe') openDescribeKeyboard();
  }

  // ---------------------------------------------------------------- lifecycle

  c.start = async function (options) {
    const t = now();
    if (!S.installId) S.installId = uuid();
    if (!S.firstDate) S.firstDate = beijingDateKey(t);
    S.lastSessionAt = t;
    const e = parseEnter(options || {});
    analytics.startSession({ scene: options && options.scene, fromCard: e.kind === 'invite' ? 'invite' : e.kind === 'reveal' ? 'reveal' : 'none', hasShareTicket: e.hasShareTicket });
    analytics.startTimer();
    if (!S.howtoSeen) c.home.sheet = 'howto';
    store.save();
    share.register(() => shareContext());
    audio.setMuted(S.muted);
    const home = loadHome();
    if (options) handleEntry(options, true);
    await home;
    if (S.turn && c.screen === 'home') await resumeTurn();
    return home;
  };

  function shareContext() {
    if (c.screen === 'entry' && c.entry && c.entry.data && c.entry.data.isParticipant && c.entry.data.nextStep) return { kind: 'invite', chainId: c.entry.chainId, passed: c.entry.data.passed, nextStep: c.entry.data.nextStep, nextKind: c.entry.data.nextKind };
    if (c.screen === 'sent' && c.sent) return { kind: 'invite', chainId: c.sent.chainId, passed: c.sent.step, nextStep: c.sent.step + 1, nextKind: C.kindOfStep(c.sent.step + 1) };
    if (c.screen === 'reveal' && c.reveal && c.reveal.data) {
      const d = c.reveal.data;
      const last = d.steps.slice().reverse().filter((s) => s.kind === 'describe' && !s.placeholder && s.text)[0];
      return { kind: 'reveal', chainId: c.reveal.chainId, promptText: d.promptText, finalText: last ? last.text : null, passed: d.passed };
    }
    if (c.screen === 'teaser' && c.teaser && c.teaser.data) return { kind: 'reveal', chainId: c.teaser.chainId, promptText: c.teaser.data.promptText, finalText: c.teaser.data.finalText, passed: c.teaser.data.passed };
    return null;
  }

  c.onShow = function (options) {
    analytics.onShow({ scene: options && options.scene, fromCard: 'none', hasShareTicket: !!(options && options.shareTicket) });
    const d = c.home.data;
    if (d && d.dateKey !== todayKey() && c.screen === 'home') loadHome();
    if (options && (options.query || options.shareTicket)) handleEntry(options, false);
    invalidate();
  };

  c.onHide = function () {
    persistTurn();
    analytics.onHide();
  };

  // ---------------------------------------------------------------- touches

  c.setHits = (hits) => {
    c.hits = hits || [];
    const t = c.turn;
    if (t && c.screen === 'draw') {
      const cv = c.hits.filter((h) => h.id === 'draw:canvas')[0];
      if (cv) t.tool.setRect(cv);
    }
  };

  c.wantsPointer = function (x, y) {
    const t = c.turn;
    if (!t || c.screen !== 'draw' || t.status !== 'drawing' || c.ui.dialog || hasSheet() || ads.overlay) return false;
    // the topmost hit under the finger must be the canvas: the 今日彩笔 button is drawn on the empty canvas
    for (let i = c.hits.length - 1; i >= 0; i--) {
      const h = c.hits[i];
      if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) return h.id === 'draw:canvas';
    }
    return false;
  };

  c.onPointer = function (type, id, x, y) {
    const t = c.turn;
    if (!t || c.screen !== 'draw' || t.status !== 'drawing') return false;
    let did = false;
    if (type === 'down') did = t.tool.pointerDown(id, x, y);
    else if (type === 'move') did = t.tool.pointerMove(id, x, y);
    else if (type === 'up') {
      did = t.tool.pointerUp(id, x, y);
      if (did) persistTurn();
    } else if (type === 'cancel') {
      did = t.tool.pointerCancel(id);
      if (did) persistTurn();
    }
    if (did) invalidate();
    return did;
  };

  c.onDrag = function (id, dy) {
    const max = (c.scrollMax && c.scrollMax[id]) || 0;
    c.ui.scroll[id] = Math.max(0, Math.min(max, (c.ui.scroll[id] || 0) - dy));
    invalidate();
  };
  c.setScrollMax = (m) => {
    c.scrollMax = m || {};
  };

  c.onHit = function (id) {
    if (ads.overlay) {
      if (id === 'adstub:complete') ads.stubComplete();
      else if (id === 'adstub:skip') ads.stubSkip();
      return invalidate();
    }
    if (c.ui.dialog) {
      if (id === 'dialog:confirm') dialogConfirm();
      else if (id === 'dialog:cancel') dialogCancel();
      return invalidate();
    }
    if (id === 'adstub:complete' || id === 'adstub:skip' || id === 'dialog:confirm' || id === 'dialog:cancel') return;
    if (hasSheet()) return sheetHit(id);
    switch (c.screen) {
      case 'home':
        return homeHit(id);
      case 'picker':
        return pickerHit(id);
      case 'draw':
        return drawHit(id);
      case 'describe':
        return describeHit(id);
      case 'sent':
        return sentHit(id);
      case 'entry':
        return entryHit(id);
      case 'reveal':
        return revealHit(id);
      case 'teaser':
        return teaserHit(id);
      case 'group':
        return groupHit(id);
      case 'album':
        return albumHit(id);
      case 'detail':
        return detailHit(id);
      case 'settings':
        return settingsHit(id);
    }
  };

  // ---------------------------------------------------------------- time

  c.tick = function (t) {
    if (c.ui.toast && t >= c.ui.toast.until) c.ui.toast = null;
    const turn = c.turn;
    if (turn && (c.screen === 'draw' || c.screen === 'describe') && !turn.timeUpHandled && (turn.status === 'drawing' || turn.status === 'typing' || turn.status === 'blocked' || turn.status === 'busy')) {
      const tm = C.turnTimer(turn.kind, turn.startedAt, t, config);
      if (tm.warn && !turn.tickPlayed) {
        turn.tickPlayed = true; // a single soft tick at 10 s (muted when sound is off)
        audio.play('tick');
      }
      if (tm.over) handleTimeUp(turn);
    }
    const s = c.sent;
    if (s && c.screen === 'sent' && s.modState === 'pending' && t - s.startedAt < config.launchHints.sentPollMaxMs && t - s.lastPoll >= config.launchHints.sentPollMs) pollSent();
    const rv = c.reveal;
    if (rv && rv.autoplay.playing && rv.data) {
      const tl = V.revealTimeline(rv.data.steps.map((x) => ({ kind: x.kind, placeholder: x.placeholder })));
      if (t - rv.autoplay.startedAt > tl.total) rv.autoplay.playing = false;
    }
    if (rv && rv.solo && t - rv.solo.startedAt > SOLO_MS) rv.solo = null;
  };

  c.animating = function (t) {
    if (ads.overlay || c.ui.toast) return true;
    const turn = c.turn;
    if (turn && c.screen === 'draw') {
      if (turn.tool.info().drawing) return true;
      if (turn.coachUntil && t < turn.coachUntil) return true;
    }
    if (turn && (c.screen === 'draw' || c.screen === 'describe')) {
      if (C.turnTimer(turn.kind, turn.startedAt, t, config).secLeft !== c.lastSecShown) return true;
      if (turn.shakeUntil > t) return true;
      if (turn.status === 'submitting') return true;
    }
    if (c.screen === 'reveal' && c.reveal && (c.reveal.autoplay.playing || c.reveal.solo || c.reveal.state === 'loading')) return true;
    if (c.screen === 'home' && c.home.state === 'loading') return true;
    if (c.screen === 'entry' && c.entry && c.entry.state === 'loading') return true;
    if (c.screen === 'picker' && c.picker && c.picker.state === 'creating') return true;
    return false;
  };

  // ---------------------------------------------------------------- view

  c.view = function (t) {
    t = t === undefined ? now() : t;
    c.tick(t);
    let vm;
    switch (c.screen) {
      case 'home':
        vm = V.homeVm(homeData());
        break;
      case 'picker':
        vm = V.pickerVm(c.picker);
        break;
      case 'draw': {
        const turn = c.turn;
        vm = V.drawVm({ turn, info: turn.tool.info(), drawing: turn.tool.strokesForRender(), unlocked: turn.tool.paletteUnlocked(), paletteAdOffered: !paletteToday(), paletteAdState: turn.paletteAdState, status: turn.status, errorText: turn.errorText, now: t, cfg: config, coach: turn.coachUntil > t, confirmClear: false });
        c.lastSecShown = vm.timer.secLeft;
        break;
      }
      case 'describe': {
        const turn = c.turn;
        vm = V.describeVm({ turn, text: turn.text, status: turn.status, errorText: turn.errorText, now: t, cfg: config, shake: turn.shakeUntil > t });
        c.lastSecShown = vm.timer.secLeft;
        break;
      }
      case 'sent':
        vm = V.sentVm(c.sent);
        break;
      case 'entry':
        vm = V.entryVm(entryVmData());
        break;
      case 'reveal': {
        const rv = c.reveal;
        vm = V.revealVm({ state: rv.state, chainId: rv.chainId, data: rv.data, now: t, autoplay: rv.autoplay, interstitialDue: ads.interstitialDue({ lifetimeReveals: S.lifetimeReveals }) });
        if (rv.solo && vm.play) {
          const idx = vm.steps.findIndex((s) => s.n === rv.solo.n);
          if (idx >= 0 && vm.steps[idx].kind === 'draw') vm.play[idx] = { shown: true, progress: Math.min(1, (t - rv.solo.startedAt) / V.T_DRAW) };
        }
        break;
      }
      case 'teaser':
        vm = V.teaserVm(c.teaser.state === 'ready' ? Object.assign({ state: 'ready' }, c.teaser.data) : { state: c.teaser.state });
        break;
      case 'group':
        vm = V.groupVm({ state: c.groupList.state, data: c.groupList.data, banner: ads.bannerFor('group', c.groupList.state) });
        break;
      case 'album':
        vm = V.albumVm({ state: c.album.state, items: c.album.items, cursor: c.album.cursor, streak: c.home.data ? c.home.data.me.streak : 0, banner: ads.bannerFor('album', c.album.state), now: srvNow() });
        break;
      case 'detail':
        vm = c.detail.item ? Object.assign(V.detailVm(c.detail.item), { state: c.detail.state }) : { chainId: c.detail.chainId, mine: [], state: c.detail.state };
        break;
      case 'settings':
        vm = V.settingsVm({ muted: S.muted, largeText: S.largeText, highContrast: S.highContrast, canUnlockPalette: !paletteToday(), paletteUnlockedToday: paletteToday(), deleteState: c.settings.deleteState === 'confirm1' || c.settings.deleteState === 'confirm2' ? 'idle' : c.settings.deleteState, /* the two confirms are overlay.dialog */ paletteAdState: c.settings.paletteAdState });
        break;
    }
    const overlay = {};
    if (c.ui.dialog) overlay.dialog = { text: c.ui.dialog.text, confirmLabel: c.ui.dialog.confirmLabel, cancelLabel: c.ui.dialog.cancelLabel, danger: !!c.ui.dialog.danger };
    if (c.ui.toast) overlay.toast = { text: c.ui.toast.text };
    if (ads.overlay) overlay.adStub = { kind: ads.overlay.kind, secondsLeft: Math.max(0, Math.ceil((ads.overlay.durationMs - (t - ads.overlay.startedAt)) / 1000)) };
    // the renderers draw sheets and display modes from the screen vm (js/render/CONTRACT.md "Shared extras")
    const display = { largeText: !!S.largeText, highContrast: !!S.highContrast };
    if (c.screen !== c.scrollScreen) {
      c.scrollScreen = c.screen;
      c.ui.scroll = {};
    }
    vm.display = display;
    vm.t = t;
    vm.scrollY = c.ui.scroll[c.screen === 'reveal' ? 'reveal:scroll' : 'scroll'] || 0;
    vm.sheetScroll = c.ui.scroll['sheet:scroll'] || 0;
    vm.keyboardH = keyboard.active && keyboard.height ? keyboard.height : 0;
    vm.sheet = null;
    if (c.report.open) {
      vm.sheet = 'report';
      vm.report = V.reportVm(c.report);
    } else if (c.rules.open) {
      vm.sheet = 'rules';
      vm.rules = V.rulesVm({ open: true, pendingAction: c.rules.pendingAction ? c.rules.pendingAction.trigger : null }, RULES_LINES);
    } else if (c.screen === 'home' && c.home.sheet) {
      vm.sheet = c.home.sheet;
    }
    overlay.display = display;
    return { screen: c.screen, vm, overlay, display, muted: S.muted };
  };

  c.state = c;
  return c;
}

module.exports = { createController };
