/**
 * Integration probe: drives the real controller + real renderers through every screen and state in the
 * three display modes, and records what the renderers actually received and drew.
 *
 *   snaps[mode][screen][label] = { vm, overlay, hits, text }
 *   missing = Set of 'screen.path' for every property a renderer READ that the vm did not carry
 *   problems = text drawn that contains undefined / NaN / null / [object
 *
 * Used by integration.test.js (assertions) and, with DUMP_VIEWS=<dir>, to write the real view models
 * as JSON for the preview tool (tools/preview/render.js REAL_DIR=<dir>).
 */

const { boot } = require('./harness');
const { fallbackErrors } = require('../js/renderers');

const FRIDAY = Date.UTC(2026, 10, 20, 4, 0, 0); // 2026-11-20 12:00 Beijing
const SUNDAY = Date.UTC(2026, 10, 22, 4, 0, 0);

const SKIP_PROPS = new Set(['toJSON', 'then', 'constructor', 'inspect', 'asymmetricMatch', '$$typeof', 'nodeType', 'tagName']);

/** Deep proxy that records reads of properties the target does not have. */
function watch(value, path, sink) {
  if (value === null || typeof value !== 'object') return value;
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== Array.prototype) return value; // canvases, class instances
  const cache = new Map();
  return new Proxy(value, {
    get(t, p, r) {
      if (typeof p === 'symbol') return Reflect.get(t, p, r);
      if (!(p in t)) {
        if (!SKIP_PROPS.has(p) && !Array.isArray(t)) sink.add(path + '.' + p);
        return undefined;
      }
      const v = t[p];
      if (v === null || typeof v !== 'object') return v;
      if (!cache.has(p) || cache.get(p).raw !== v) cache.set(p, { raw: v, proxy: watch(v, path + (Array.isArray(t) ? '[]' : '.' + p), sink) });
      return cache.get(p).proxy;
    },
  });
}

const BAD_TEXT = /undefined|NaN|\[object|\bnull\b/;

function createProbe(t, opts, modeName) {
  const g = boot(t, opts);
  const R = g.app.renderer;
  const probe = { g, snaps: {}, missing: new Set(), problems: [], hitIds: new Set(), mode: modeName };
  let last = { screen: null, vm: null, overlay: null };
  const draw = R.draw;
  const drawOverlay = R.drawOverlay;
  R.draw = (screen, ctx, vm, layout) => {
    last = { screen, vm: JSON.parse(JSON.stringify(vm, (k, v) => (k === 'sharedCanvas' && v ? { width: v.width, height: v.height } : v))), overlay: null };
    return draw(screen, ctx, watch(vm, screen, probe.missing), layout);
  };
  R.drawOverlay = (ctx, ov, layout) => {
    last.overlay = JSON.parse(JSON.stringify(ov));
    return drawOverlay(ctx, watch(ov, 'overlay', probe.missing), layout);
  };
  /** Redraw now and store what was shown under `label`. */
  probe.snap = (label) => {
    const text = g.frame();
    const hits = g.app.hits.map((h) => ({ id: h.id, x: h.x, y: h.y, w: h.w, h: h.h }));
    hits.forEach((h) => probe.hitIds.add(h.id));
    const screen = last.screen;
    if (BAD_TEXT.test(text)) probe.problems.push(`${modeName}/${screen}/${label}: ${text.match(new RegExp('.{0,12}(' + BAD_TEXT.source + ').{0,12}'))[0]}`);
    ((probe.snaps[screen] = probe.snaps[screen] || {})[label] = { vm: last.vm, overlay: last.overlay, hits, text });
    return last;
  };
  probe.errors = fallbackErrors;
  return probe;
}

const hit = (g, id) => g.app.ctl.onHit(id);

async function pickFirst(g) {
  g.tapId((h) => h.id.indexOf('pool:') === 0 && h.id !== 'pool:list');
  g.tapId((h) => h.id.indexOf('slot:') === 0);
  g.wait(400);
}

async function flipRound(g) {
  g.tapId('primary');
  await g.settle();
  g.wait(1300);
  await g.settle();
}

/** Walk every screen and state. `mode`: 'default' | 'large' | 'hc'. */
function displayOf(mode) {
  return { largeText: mode === 'large' || mode === 'large_hc', highContrast: mode === 'hc' || mode === 'large_hc' };
}

async function runFriday(t, mode) {
  const display = displayOf(mode);
  const p = createProbe(t, { now: FRIDAY }, mode);
  const { g } = p;
  const S = (label) => p.snap(label);
  fallbackErrors.length = 0;

  // ---- home: loading, how-to, settings, display modes via the real toggles
  S('loading');
  await g.settle();
  S('howto');
  g.tapId('sheet:close');
  g.tapId('home:settings');
  if (display.largeText) g.tapId('settings:largeText');
  if (display.highContrast) g.tapId('settings:highContrast');
  S('settings');
  g.tapId('sheet:close');
  S('available');

  // ---- free play with re-spins, undo, ad stub, detail sheet, coach marks
  g.tapId('home:free');
  S('free_awaitFlip_coach');
  g.tapId('coach:next');
  S('free_awaitFlip_coach2');
  g.tapId('coach:skip');
  await flipRound(g);
  S('free_flipped');
  g.tapId((h) => h.id.indexOf('pool:') === 0 && h.id !== 'pool:list');
  S('free_selected');
  g.tapId((h) => h.id.indexOf('slot:') === 0);
  g.wait(400);
  S('free_placed');
  g.tapId('undo');
  S('free_undone');
  if (g.has('respin:faction')) {
    g.tapId('respin:faction');
    g.wait(1300);
    S('free_respun');
  }
  await pickFirst(g);
  g.tapId('primary');
  g.wait(400);
  for (let r = 2; r <= 5; r++) {
    await flipRound(g);
    await pickFirst(g);
    g.tapId('primary');
    g.wait(400);
    await g.settle();
  }
  S('free_revealing');
  g.tapId('result:skip');
  await g.settle();
  S('free_result_done');
  if (g.has('result:breakdown')) {
    g.tapId('result:breakdown');
    S('free_breakdown');
    g.tapId('sheet:close');
  }
  hit(g, 'result:replay');
  await g.settle();
  S('free_replay_ad');
  g.wait(3200);
  hit(g, 'adstub:complete');
  await g.settle();
  S('free_replay_sheet');
  hit(g, 'sheet:close');
  hit(g, 'result:save');
  await g.settle();
  S('free_saved');
  hit(g, 'result:back');

  // ---- daily
  g.tapId('home:daily');
  await flipRound(g);
  S('daily_flipped');
  await pickFirst(g);
  g.tapId('primary');
  g.wait(400);
  g.app.api.mock.offline = true;
  g.tapId('primary');
  await g.settle();
  S('daily_roundFetch_failed');
  g.app.api.mock.offline = false;
  hit(g, 'retryRound');
  await g.settle();
  g.wait(1300);
  await g.settle();
  S('daily_round2');
  await pickFirst(g);
  g.tapId('primary');
  g.wait(400);
  for (let r = 3; r <= 5; r++) {
    await flipRound(g);
    await pickFirst(g);
    g.tapId('primary');
    g.wait(400);
    await g.settle();
  }
  S('daily_revealing');
  g.wait(2000);
  S('daily_revealing2');
  g.tapId('result:skip');
  await g.settle();
  S('daily_done');
  hit(g, 'result:replay');
  S('daily_replay_ad');
  g.wait(3200);
  hit(g, 'adstub:complete');
  await g.settle();
  S('daily_replay_sheet');
  hit(g, 'sheet:close');
  hit(g, 'result:challenge');
  await g.settle();
  S('daily_after_challenge');
  hit(g, 'result:board');
  await g.settle();
  S('board_after_result');
  hit(g, 'board:back');
  hit(g, 'result:back');
  S('home_done');

  // ---- history
  hit(g, 'home:history');
  S('history_loading');
  await g.settle();
  const hv = S('history_ready');
  const first = (hv.vm.items || [])[0];
  if (first) {
    hit(g, 'history:item:' + first.dateKey);
    S('issue_today');
  }
  hit(g, 'issue:back');
  hit(g, 'history:back');

  // ---- boards
  hit(g, 'home:friendBoard');
  S('board_friend_start');
  await g.settle();
  S('board_friend_after');
  if (g.has('board:agree')) {
    hit(g, 'board:agree');
    await g.settle();
    S('board_friend_agreed');
  }
  hit(g, 'board:back');
  hit(g, 'home:groupBoard');
  await g.settle();
  S('board_group_nogroup');
  hit(g, 'board:back');

  // ---- offline home
  g.app.api.mock.offline = true;
  await g.app.ctl.refreshDaily();
  S('home_offline');
  g.app.api.mock.offline = false;
  await g.app.ctl.refreshDaily();

  return p;
}

async function runSunday(t, mode) {
  const display = displayOf(mode);
  const q = createProbe(t, { now: SUNDAY }, mode);
  const s = q.g;
  fallbackErrors.length = 0;
  await s.settle();
  s.tapId('sheet:close');
  if (display.largeText) {
    s.tapId('home:settings');
    s.tapId('settings:largeText');
    if (display.highContrast) s.tapId('settings:highContrast');
    s.tapId('sheet:close');
  } else if (display.highContrast) {
    s.tapId('home:settings');
    s.tapId('settings:highContrast');
    s.tapId('sheet:close');
  }
  q.snap('shiren_home');
  s.tapId('home:daily');
  await flipRound(s);
  q.snap('shiren_flipped');
  s.tapId((h) => h.id.indexOf('pool:') === 0 && h.id !== 'pool:list');
  q.snap('shiren_selected');
  s.tapId((h) => h.id.indexOf('slot:') === 0);
  s.wait(400);
  q.snap('shiren_placed');
  s.tapId('primary');
  s.wait(400);
  for (let r = 2; r <= 5; r++) {
    await flipRound(s);
    await pickFirst(s);
    s.tapId('primary');
    s.wait(400);
    await s.settle();
  }
  s.tapId('result:skip');
  await s.settle();
  q.snap('shiren_reveal_0');
  s.wait(700);
  q.snap('shiren_reveal_2');
  s.wait(3000);
  q.snap('shiren_reveal_done');
  hit(s, 'result:revealSkip');
  q.snap('shiren_done');
  return q;
}

/** Offline submit, challenge entry states, a ready board with the banner stub, the album-denied sheet, the subscribe offer. */
async function runMisc(t, mode) {
  const display = displayOf(mode);
  const p = createProbe(t, { now: FRIDAY, privacy: { state: 'agreed', scope: true }, album: { saveErr: { errMsg: 'saveImageToPhotosAlbum:fail auth deny', errno: 103 } } }, mode);
  const { g } = p;
  const S = (label) => p.snap(label);
  fallbackErrors.length = 0;
  const mock = g.app.api.mock;
  mock.appConfig = { subscribe: { tmplId: 'TMPL1' }, ads: { banner: { enabled: true, adUnitId: 'adunit-1' }, interstitial: { everyNRuns: 4, maxPerDay: 3, minGapSec: 60, minLifetimeRuns: 1 } } };
  await g.settle();
  g.tapId('sheet:close');
  if (display.largeText || display.highContrast) {
    g.tapId('home:settings');
    if (display.largeText) g.tapId('settings:largeText');
    if (display.highContrast) g.tapId('settings:highContrast');
    g.tapId('sheet:close');
  }
  await g.app.ctl.refreshDaily();
  S('misc_home');

  // draft: leave dialog
  g.tapId('home:free');
  g.tapId('coach:skip');
  await flipRound(g);
  await pickFirst(g);
  hit(g, 'back');
  S('misc_leave_dialog');
  hit(g, 'dialog:cancel');
  hit(g, 'back');
  hit(g, 'dialog:confirm');

  // daily with the network gone at the end: pendingSubmit
  g.tapId('home:daily');
  await flipRound(g);
  await pickFirst(g);
  g.tapId('primary');
  g.wait(400);
  for (let r = 2; r <= 5; r++) {
    await flipRound(g);
    await pickFirst(g);
    if (r === 5) mock.offline = true;
    g.tapId('primary');
    g.wait(400);
    await g.settle();
  }
  S('misc_pendingSubmit');
  mock.offline = false;
  g.tapId('result:retry');
  await g.settle();
  g.tapId('result:skip');
  await g.settle();
  S('misc_daily_done');

  // album denied sheet, subscribe offer, challenge made
  hit(g, 'result:save');
  await g.settle();
  S('misc_album_denied');
  hit(g, 'album:cancel');
  hit(g, 'result:challenge');
  await g.settle();
  S('misc_subscribe_offer');
  const id = g.app.ctl.state.res.subscribe.challengeId;
  hit(g, 'result:subscribe');
  await g.settle();
  S('misc_subscribe_granted');

  // challenge entry: own, ready (someone else's), answered, expired, offline
  g.app.ctl.onShow({ scene: 1007, query: { c: id } });
  await g.settle();
  S('chal_own');
  const d = mock.call('getDaily', {});
  const seed = mock.db.seeds[d.dateKey];
  const mk = (cid, over) => (mock.db.challenges[cid] = Object.assign({ owner: 'someone-else', mode: 'daily', seed: seed.seed, dateKey: d.dateKey, rounds: seed.rounds, record: { w: 9, l: 3 }, lineup: [], expiresAt: Date.now() + 86400000, answers: [] }, over));
  mk('ABCD2345', {});
  mk('ABCD2346', { expiresAt: Date.now() - 1000 });
  g.app.ctl.onShow({ scene: 1007, query: { c: 'ABCD2346' } });
  await g.settle();
  S('chal_expired');
  g.app.ctl.onShow({ scene: 1007, query: { c: 'ABCD2345' } });
  await g.settle();
  S('chal_ready');
  mock.offline = true;
  g.app.ctl.onShow({ scene: 1007, query: { c: 'ABCD2399' } });
  await g.settle();
  S('chal_offline');
  mock.offline = false;
  hit(g, 'challenge:home');

  // boards: ready (with banner stub), empty
  mock.db.fakeRows = [['a1b2c3d4', 11, 4000, null], ['e5f6a7b8', 10, 5000, null, 3]];
  hit(g, 'home:friendBoard');
  await g.settle();
  S('board_ready');
  hit(g, 'board:back');
  g.app.ctl.state.group = { status: 'ok', groupRef: 'G1', shareTicket: 'T', groupid: null };
  hit(g, 'home:groupBoard');
  await g.settle();
  S('board_group_ready');
  hit(g, 'board:back');

  // history with several issues and the settings album row
  hit(g, 'home:history');
  await g.settle();
  S('misc_history');
  hit(g, 'history:back');
  hit(g, 'home:settings');
  S('misc_settings_after');
  hit(g, 'sheet:close');
  return p;
}

module.exports = { runFriday, runSunday, runMisc, createProbe, watch, FRIDAY, SUNDAY };
