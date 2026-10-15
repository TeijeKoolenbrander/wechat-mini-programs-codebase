/**
 * Game controller: the state machine behind every screen. Renderer-agnostic: it builds view models
 * (js/vm.js, spec 10), the renderers draw them and return hit areas, and touches come back here as hit ids
 * (js/README.md lists every screen and hit id).
 *
 *   const ctl = createController(deps)
 *   ctl.start(enterOptions)        cold start
 *   ctl.view(now)                  -> { screen, vm, overlay }   (what to draw)
 *   ctl.onHit(id)                  a tap landed on hit id
 *   ctl.onRuler(pos, phase)        the ruler: pos 0..100, phase 'start' | 'move' | 'end'
 *   ctl.onDrag(scrollId, dy)       a drag on a scroll area
 *   ctl.setScrollMax(map)          hitAreas.scrollMax from the last draw
 *   ctl.onShow(options) / ctl.onHide()
 *   ctl.animating(now)             true while something moves (keeps repainting)
 *
 * Screens: home, card, result, archive, archiveDay, create, round, group, friend. The flows (one file each under
 * js/flows/) own their screens' state; this file owns navigation, entry routing, lifecycle and the overlays.
 */

const { beijingDateKey } = require('../core/date');
const { normalizeFeatures } = require('../core/config');
const { parseEnter } = require('./share');
const V = require('./vm');
const { uuid } = require('./util');

const TOAST_MS = 2400;

const FLOW_OF = { home: 'home', card: 'card', result: 'result', archive: 'archive', archiveDay: 'archive', create: 'host', round: 'round', group: 'boards', friend: 'boards' };

function createController(deps) {
  const { wx, api, store, analytics, ads, share, privacy, odc, config, content } = deps;
  const now = deps.now || (() => Date.now());
  const invalidate = deps.invalidate || (() => {});
  const getLayout = deps.getLayout || (() => ({ W: 375, H: 812, pad: 16, bottomEdge: 812, dpr: 1 }));
  const S = store.state;

  const c = {
    deps,
    wx,
    api,
    store,
    S,
    analytics,
    ads,
    share,
    privacy,
    odc,
    config,
    content,
    now,
    invalidate,
    screen: 'home',
    stack: [],
    ui: { toast: null, dialog: null },
    group: { status: 'none', groupRef: null, shareTicket: null, errCode: undefined },
    offsetMs: 0,
    features: normalizeFeatures(S.features),
    sessionSets: 0, // archive sets completed this session (the interstitial counter)
    pendingEntry: null,
    scrollMax: {},
    flows: {},
    lastEntryKey: '',
    lastEntryAt: 0,
  };

  // ---------------------------------------------------------------- shared helpers

  c.serverNow = () => now() + c.offsetMs;
  c.todayKey = () => beijingDateKey(c.serverNow());
  c.track = (n, p) => analytics.track(n, p);
  c.layout = () => getLayout();
  c.display = () => V.displayVm(S);
  c.featuresVm = () => V.featuresVm(c.features);
  c.audio = (name) => deps.audio && deps.audio.play(name);
  c.toast = (text) => {
    c.ui.toast = { text, until: now() + TOAST_MS };
    invalidate();
  };

  /** Navigate. replace:true swaps the current screen instead of stacking it. */
  c.go = (screen, o) => {
    if (!(o && o.replace)) c.stack.push(c.screen);
    c.screen = screen;
    invalidate();
  };

  c.goHome = () => {
    c.stack = [];
    c.screen = 'home';
    c.ui.dialog = null;
    c.flows.home.onEnter();
    if (c.pendingEntry) {
      const e = c.pendingEntry;
      c.pendingEntry = null;
      c.routeEntry(e);
    }
    invalidate();
  };

  c.back = () => {
    const prev = c.stack.pop();
    if (!prev || prev === 'card' || prev === 'create') return c.goHome();
    c.screen = prev;
    if (prev === 'home') c.flows.home.onEnter();
    invalidate();
  };

  /** The rect the open data domain draws into (layout.odcRect from frontend-ui, else a sensible default). */
  c.odcRect = () => {
    const L = getLayout();
    const r = L.odcRect || L.board || { x: 16, y: 200, w: (L.W || 375) - 32, h: 260 };
    return { x: r.x, y: r.y, w: r.w, h: r.h, dpr: L.dpr || 1 };
  };

  /** Gate before names render. auto = true when the screen opened without an in-game tap (a card entry): never prompts. */
  c.gateNames = async function (auto, trigger) {
    if (privacy.friendDataEnabled()) return 'ok';
    if (auto) return S.privacy.privacy === 'agreed' ? 'unauthorized' : 'privacyDenied';
    const g = await privacy.ensureForNames(trigger);
    return g.state;
  };

  // ---------------------------------------------------------------- group context (8.1)

  c.joinGroupFor = async function (e) {
    c.group = { status: 'checking', groupRef: null, shareTicket: e.shareTicket, errCode: undefined };
    invalidate();
    const r = await share.enterGroup(e);
    c.group.status = r.status;
    c.group.groupRef = r.groupRef;
    c.group.errCode = r.errCode;
    if (r.status === 'ok' && c.screen === 'home') c.flows.home.refreshDaily(true);
    if (c.screen === 'group') c.flows.boards.openGroup(true, true);
    invalidate();
    return r;
  };

  // ---------------------------------------------------------------- entry routing (7.5)

  c.routeEntry = async function (e) {
    // the group context lives for the entry that brought it (8.1): a card without a ticket clears the previous one
    if (!e.join && (e.kind === 'daily' || e.kind === 'group' || e.kind === 'round')) c.group = { status: 'none', groupRef: null, shareTicket: null, errCode: undefined };
    if (e.kind === 'daily') {
      c.track('card_open', { cardKind: e.notice ? 'notice' : 'daily', hasShareTicket: e.hasShareTicket });
      if (e.join) c.joinGroupFor(e);
      return;
    }
    if (e.kind === 'group') {
      c.track('card_open', { cardKind: 'group', hasShareTicket: e.hasShareTicket });
      if (e.join) await c.joinGroupFor(e);
      return c.flows.boards.openGroup(true);
    }
    if (e.kind === 'round') {
      if (e.join) await c.joinGroupFor(e);
      await c.flows.round.open(e.roundId, 'entry', true);
      const st = c.flows.round.state();
      const revealed = st && (st.status === 'revealed' || st.status === 'revealedUnplayed');
      c.track('card_open', { cardKind: e.notice ? 'notice' : revealed ? 'reveal' : 'round', hasShareTicket: e.hasShareTicket, roundId: e.roundId });
      return;
    }
    if (e.kind === 'fallbackShare') return c.track('error', { where: 'entry', code: 'wxad_fallback_share' });
    if (e.kind === 'malformed') return c.track('error', { where: 'entry', code: 'malformed' });
  };

  /** Cold start or warm start with enter options. */
  c.handleEntry = function (options, cold) {
    const e = parseEnter(options);
    if (e.kind === 'none') return e;
    // the launch options and the first onShow can be the same entry: count it once
    const key = JSON.stringify([options.query, options.shareTicket, options.scene]);
    if (key === c.lastEntryKey && now() - c.lastEntryAt < 3000) return e;
    c.lastEntryKey = key;
    c.lastEntryAt = now();
    if (!cold && c.flows.card.midCard()) {
      c.pendingEntry = e; // 6.10: wait until the card is confirmed or the player returns home
      return e;
    }
    c.routeEntry(e);
    return e;
  };

  // ---------------------------------------------------------------- flows

  c.flows.home = require('./flows/home')(c);
  c.flows.card = require('./flows/card')(c);
  c.flows.result = require('./flows/result')(c);
  c.flows.archive = require('./flows/archive')(c);
  c.flows.host = require('./flows/host')(c);
  c.flows.round = require('./flows/round')(c);
  c.flows.boards = require('./flows/boards')(c);

  const flowOf = () => c.flows[FLOW_OF[c.screen]];

  // ---------------------------------------------------------------- lifecycle

  c.start = function (options) {
    const t = now();
    if (!S.installId) S.installId = uuid();
    if (!S.firstDate) S.firstDate = beijingDateKey(t);
    S.lastSessionAt = t;
    const e = parseEnter(options);
    const fromCard = e.kind === 'daily' ? 'daily' : e.kind === 'round' ? 'round' : e.kind === 'group' ? 'group' : 'none';
    analytics.startSession({ scene: options && options.scene, fromCard, hasShareTicket: e.hasShareTicket });
    analytics.startTimer();
    store.save();
    share.register(() => c.flows.result.shareContext() || c.flows.round.shareContext() || c.flows.boards.shareContext());
    c.flows.home.onStart();
    c.handleEntry(options || {}, true);
    return c.flows.home.refreshDaily().then(() => c.flows.card.flushPending());
  };

  c.onShow = function (options) {
    analytics.onShow({ scene: options && options.scene, fromCard: 'none', hasShareTicket: !!(options && options.shareTicket) });
    privacy.refreshOnShow().then(() => invalidate());
    c.flows.home.onShow();
    c.flows.round.onShow();
    if (S.pending) c.flows.card.flushPending();
    if (options && (options.query || options.shareTicket)) c.handleEntry(options, false);
    invalidate();
  };

  c.onHide = function () {
    store.save();
    analytics.onHide();
  };

  // ---------------------------------------------------------------- touches

  c.setScrollMax = (m) => {
    c.scrollMax = m || {};
  };

  c.onDrag = function (id, dy) {
    const f = flowOf();
    if (f && f.drag) f.drag(id, dy, c.scrollMax[id] || 0);
    invalidate();
  };

  c.onRuler = function (pos, phase) {
    if (c.ads.overlay || c.ui.dialog) return;
    const f = flowOf();
    if (f && f.ruler) f.ruler(pos, phase);
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
      if (id === 'dialog:confirm') {
        const d = c.ui.dialog;
        c.ui.dialog = null;
        if (d.onConfirm) d.onConfirm();
      } else if (id === 'dialog:cancel') c.ui.dialog = null;
      return invalidate();
    }
    if (/^(adstub|dialog):/.test(id)) return;
    const f = flowOf();
    if (f && f.hit) f.hit(id);
    invalidate();
  };

  // ---------------------------------------------------------------- rendering state

  c.tick = function (t) {
    if (c.ui.toast && t >= c.ui.toast.until) c.ui.toast = null;
  };

  c.animating = function (t) {
    if (ads.overlay || c.ui.toast) return true;
    const f = flowOf();
    return !!(f && f.animating && f.animating(t));
  };

  /** What the banner wants right now: { screen, state } or null (see ads.syncBanner). */
  c.bannerWant = function () {
    const f = flowOf();
    return f && f.bannerWant ? f.bannerWant() : null;
  };

  c.view = function (t) {
    t = t === undefined ? now() : t;
    c.tick(t);
    const f = flowOf();
    const vm = f.vm(t);
    const want = c.bannerWant();
    const L = getLayout();
    const pad = L.pad || 16;
    ads.syncBanner(want, { left: pad, top: (L.bottomEdge || L.H || 812) - 100, width: (L.W || 375) - 2 * pad });
    const overlay = {};
    if (c.ui.dialog) overlay.dialog = { text: c.ui.dialog.text, confirmLabel: c.ui.dialog.confirmLabel, cancelLabel: c.ui.dialog.cancelLabel, danger: !!c.ui.dialog.danger };
    if (c.ui.toast) overlay.toast = { text: c.ui.toast.text };
    if (ads.overlay) overlay.adStub = { kind: ads.overlay.kind, secondsLeft: Math.max(0, Math.ceil((ads.overlay.durationMs - (t - ads.overlay.startedAt)) / 1000)) };
    return { screen: c.screen, vm, overlay };
  };

  c.state = c;
  return c;
}

module.exports = { createController };
