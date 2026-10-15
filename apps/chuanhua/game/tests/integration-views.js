/**
 * Integration probe: the real controller (on the in-memory mock server, several players) drives the real
 * renderers through every screen and state in a display mode, and records what the renderers received and
 * drew. Used by integration.test.js and, with DUMP_VIEWS=<dir>, to write the real view models for the
 * preview tool (tools/preview/render.js, REAL_DIR=<dir>).
 *
 *   probe.snaps[screen][label] = { vm, overlay, hits, text }
 *   probe.missing  = Set of 'screen.path' for every property a renderer READ that the vm did not carry
 *   probe.problems = text drawn that contains undefined / NaN / null / [object
 *   probe.hitIds   = every hit id any renderer returned
 */

const { makeClient, enableClock } = require('./harness');
const { createMockServer } = require('../js/mock-server');
const renderers = require('../js/renderers');
const S = require('../core/strokes');

const SKIP_PROPS = new Set(['toJSON', 'then', 'constructor', 'inspect', 'asymmetricMatch', '$$typeof', 'nodeType', 'tagName']);
const BAD_TEXT = /undefined|NaN|\[object|\bnull\b/;

/** Deep proxy that records reads of properties the target does not have. */
function watch(value, path, sink) {
  if (value === null || typeof value !== 'object') return value;
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== Array.prototype) return value;
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

function createProbe(modeName) {
  const probe = { mode: modeName, snaps: {}, missing: new Set(), problems: [], hitIds: new Set(), last: { screen: null, vm: null, overlay: null } };
  probe.wrap = (R) =>
    Object.assign({}, R, {
      draw: (screen, ctx, vm, layout) => {
        probe.last = { screen, vm: JSON.parse(JSON.stringify(vm)), overlay: null };
        return R.draw(screen, ctx, watch(vm, screen, probe.missing), layout);
      },
      drawOverlay: (ctx, ov, layout) => {
        probe.last.overlay = JSON.parse(JSON.stringify(ov));
        return R.drawOverlay(ctx, watch(ov, 'overlay', probe.missing), layout);
      },
    });
  /** Redraw client `c` now and store what was shown under `label`. */
  probe.snap = (c, label) => {
    c.frame();
    const text = c.log.text.join('');
    const hits = c.hits.map((h) => ({ id: h.id, x: h.x, y: h.y, w: h.w, h: h.h }));
    hits.forEach((h) => probe.hitIds.add(h.id));
    const { screen } = probe.last;
    if (BAD_TEXT.test(text)) probe.problems.push(`${modeName}/${screen}/${label}: ${text.match(new RegExp('.{0,12}(' + BAD_TEXT.source + ').{0,12}'))[0]}`);
    const snapped = { vm: probe.last.vm, overlay: probe.last.overlay, hits, text };
    (probe.snaps[screen] = probe.snaps[screen] || {})[label] = snapped;
    // scroll through the rest of every scroll area: ids and text below the fold must be sound too
    const max = c.hits.scrollMax || {};
    for (const sid of Object.keys(max)) {
      const ui = c.ctl.state.ui;
      const orig = ui.scroll[sid] || 0;
      for (let off = orig + 150; off < max[sid] + 150; off += 150) {
        ui.scroll[sid] = Math.min(off, max[sid]);
        c.frame();
        c.hits.forEach((h) => probe.hitIds.add(h.id));
        const tx = c.log.text.join('');
        if (BAD_TEXT.test(tx)) probe.problems.push(`${modeName}/${screen}/${label}@${sid}${off}: ${tx.match(new RegExp('.{0,12}(' + BAD_TEXT.source + ').{0,12}'))[0]}`);
        snapped.text += tx;
      }
      ui.scroll[sid] = orig;
      c.frame();
    }
    return probe.last;
  };
  return probe;
}

// ---------------------------------------------------------------- the world

const ENTER_INVITE = (chainId, ticket, extra) => Object.assign({ scene: 1044, query: { k: chainId }, shareTicket: ticket || 'ticket', chatType: 3 }, extra || {});
const ENTER_REVEAL = (chainId, ticket) => ({ scene: 1044, query: { r: chainId }, shareTicket: ticket || 'ticket', chatType: 3 });
const drawing = (n) => {
  const d = S.emptyDrawing();
  for (let i = 0; i < n; i++) d.s.push(S.makeStroke(i % 6, i % 3, [[100 + i * 9, 120], [300 + i * 5, 400], [600, 300 + i * 11], [800, 700]]));
  return d;
};

function displayOf(mode) {
  return { largeText: mode === 'large' || mode === 'large_hc', highContrast: mode === 'hc' || mode === 'large_hc' };
}

function makeWorld(t, probe, mode, screen) {
  enableClock(t);
  const srv = createMockServer({ now: () => Date.now(), rasterize: false });
  const w = { srv, t, probe, mode, screen, clients: [] };
  w.adv = (ms) => {
    t.mock.timers.tick(ms);
    srv.sweep();
  };
  w.agree = (id) => srv.call('agreeRules', { version: 1 }, id);
  w.join = (id, gid) => (w.agree(id), srv.call('joinGroup', { groupData: { mockData: { opengid: gid || 'G1', chat_type: 3 } } }, id).groupRef);
  /** a UI client with the display mode applied; agreed = rules already agreed */
  w.client = (id, o) => {
    o = o || {};
    if (o.agreed !== false) w.agree(id);
    const c = makeClient(t, srv, id, { probe, screen });
    Object.assign(c.store.state, displayOf(mode));
    w.clients.push(c);
    return c;
  };
  /** play a whole 棒 through the server as another player */
  w.play = (chainId, id, ref, n) => {
    const cl = srv.call('claimStep', { chainId, groupRef: ref }, id);
    if (!cl.ok) throw new Error(id + ' step ' + n + ': ' + cl.code);
    const r = srv.call('submitStep', n % 2 === 0 ? { chainId, claimId: cl.claimId, text: '外星人吃披萨' + n } : { chainId, claimId: cl.claimId, strokes: drawing(3) }, id);
    if (!r.ok) throw new Error(id + ' submit ' + n + ': ' + r.code);
    w.adv(61e3);
  };
  /** a chain started by `starter` in G1 with 棒 1 passed */
  w.seed = (starter, promptId) => {
    const ref = w.join(starter);
    const cr = srv.call('createChain', { promptId: promptId || 'A01', groupRef: ref }, starter);
    if (!cr.ok) throw new Error('createChain ' + cr.code);
    srv.call('submitStep', { chainId: cr.chainId, claimId: cr.claim.claimId, strokes: drawing(3) }, starter);
    w.adv(61e3);
    return { chainId: cr.chainId, ref };
  };
  /** n passed 棒 in total, played by the starter and `others` in turn */
  w.fill = (chainId, starter, others, upTo) => {
    const who = [starter].concat(others);
    const refs = {};
    who.forEach((id) => (refs[id] = w.join(id)));
    for (let n = 2; n <= upTo; n++) {
      const id = who[(n - 1) % who.length];
      w.play(chainId, id, refs[id], n);
    }
  };
  return w;
}

const settle = (c) => c.settle();

async function enter(c, options) {
  await c.ctl.start(options);
  await c.settle();
}

/** close whatever sheet is open the way a player would */
function closeSheet(c) {
  const k = c.view().vm.sheet;
  if (k) c.tapId({ howto: 'howto:ok', strike: 'strike:ok', rules: 'rules:later', report: 'report:cancel' }[k]);
}

async function tapSettle(c, id) {
  c.tapId(id);
  await c.settle();
}

/** type into the open keyboard and press submit past the debounce */
async function submitText(w, c, text, id) {
  c.type(text);
  w.t.mock.timers.tick(300);
  await tapSettle(c, id || 'describe:submit');
}

// ---------------------------------------------------------------- tours

/** a brand-new player: home, rules, settings, picker, drawing, sent */
async function tourSolo(w) {
  const { probe, srv } = w;
  const S1 = (c, l) => probe.snap(c, l);
  const c = w.client('solo', { agreed: false });
  const started = c.ctl.start(undefined);
  S1(c, 'loading');
  await started;
  await c.settle();
  S1(c, 'howto');
  c.tapId('howto:ok');
  S1(c, 'ready');
  // scrolled home (the tail of the list)
  c.tapId('home:howto');
  S1(c, 'howto_again');
  c.tapId('sheet:close');
  // settings
  await tapSettle(c, 'home:settings');
  S1(c, 'settings');
  c.tapId('settings:sound');
  S1(c, 'settings_muted');
  c.tapId('settings:sound');
  c.tapId('settings:largeText');
  c.tapId('settings:largeText');
  c.tapId('settings:highContrast');
  c.tapId('settings:highContrast');
  c.tapId('settings:rules');
  S1(c, 'settings_rules_sheet');
  c.tapId('rules:later');
  c.tapId('settings:deleteAll');
  S1(c, 'settings_delete_confirm1');
  c.tapId('dialog:confirm');
  S1(c, 'settings_delete_confirm2');
  c.tapId('dialog:cancel');
  c.tapId('back');
  await c.settle();
  S1(c, 'ready_after');
  // start: rules sheet, then picker
  c.tapId('home:start');
  S1(c, 'rules_sheet');
  c.tapId('rules:agree');
  await c.settle();
  S1(c, 'picker');
  c.tapId('picker:shuffle');
  S1(c, 'picker_batch');
  c.tapId('picker:custom');
  S1(c, 'picker_custom_empty');
  c.type('会飞的西瓜');
  S1(c, 'picker_custom_text');
  c.tapId('picker:customCancel');
  S1(c, 'picker_after_cancel');
  c.tapId('picker:custom');
  c.type('一');
  await c.settle();
  S1(c, 'picker_custom_short');
  c.type('测试违规的题目');
  c.tapId('picker:customOk');
  await c.settle();
  S1(c, 'picker_custom_blocked');
  c.tapId('picker:customCancel');
  c.tapId('picker:shuffle');
  c.tapId((h) => h.id.indexOf('picker:select:') === 0);
  c.tapId('picker:start');
  await c.settle();
  // draw
  S1(c, 'draw_coach');
  S1(c, 'draw_paletteAd');
  c.tapId('draw:paletteAd');
  S1(c, 'draw_paletteAd_stub');
  w.t.mock.timers.tick(3100);
  c.tapId('adstub:complete');
  await c.settle();
  c.strokes(3);
  S1(c, 'draw_drawn');
  c.tapId('draw:color:3');
  c.tapId('draw:size:2');
  c.tapId('draw:undo');
  S1(c, 'draw_undone');
  c.tapId('draw:clear');
  S1(c, 'draw_clear_dialog');
  c.tapId('dialog:cancel');
  w.t.mock.timers.tick(51e3);
  S1(c, 'draw_timer_warn');
  c.strokes(6);
  c.ctl.state.turn.tool.info(); // keep the tool warm
  c.tapId('back');
  S1(c, 'draw_quit_dialog');
  c.tapId('dialog:cancel');
  // submit while the network is down: error state keeps the strokes
  srv.offline = true;
  w.t.mock.timers.tick(300);
  await tapSettle(c, 'draw:submit');
  S1(c, 'draw_error');
  srv.offline = false;
  w.t.mock.timers.tick(300);
  await tapSettle(c, 'draw:retry');
  S1(c, 'sent_pending');
  w.adv(61e3);
  c.view();
  w.t.mock.timers.tick(16e3);
  c.view();
  await c.settle();
  S1(c, 'sent_passed');
  srv.knobs.subscribeTmpl = 'tmpl-1';
  c.ctl.state.sent.subscribe = 'offer';
  S1(c, 'sent_subscribe_offer');
  c.tapId('sent:subscribe');
  await c.settle();
  S1(c, 'sent_subscribe_after');
  c.tapId('sent:share');
  await c.settle();
  // second start: empty canvas to the time-up modal
  c.tapId('sent:again');
  await c.settle();
  c.tapId((h) => h.id.indexOf('picker:select:') === 0);
  c.tapId('picker:start');
  await c.settle();
  w.adv(61e3);
  c.view();
  await c.settle();
  S1(c, 'draw_timeUp');
  c.tapId('draw:timeUpOk');
  await c.settle();
  closeSheet(c);
  S1(c, 'home_after_timeUp');
  // allowances used up: the ad start button
  for (let i = 0; i < 2; i++) {
    w.t.mock.timers.tick(300);
    c.tapId('home:start');
    await c.settle();
    c.tapId('picker:start');
    await c.settle();
    c.strokes(2);
    w.t.mock.timers.tick(300);
    c.tapId('draw:submit');
    await c.settle();
    c.tapId('back');
    await c.settle();
    closeSheet(c);
  }
  closeSheet(c);
  S1(c, 'home_starts_used');
  c.tapId('home:adStart');
  S1(c, 'home_ad_stub');
  w.t.mock.timers.tick(3100);
  c.tapId('adstub:complete');
  await c.settle();
  S1(c, 'home_after_ad');
  // album of the player's own chains, with an item of each kind
  await tapSettle(c, 'home:album');
  S1(c, 'album');
  c.tapId((h) => h.id.indexOf('album:item:') === 0);
  await c.settle();
  S1(c, 'album_item_open');
  // 今日彩笔 from settings (the draw screen's own offer was used above)
  const d = w.client('solo2');
  await d.ctl.start(undefined);
  await d.settle();
  closeSheet(d);
  await tapSettle(d, 'home:settings');
  d.tapId('settings:palette');
  S1(d, 'settings_palette_ad');
  w.t.mock.timers.tick(3100);
  d.tapId('adstub:complete');
  await d.settle();
  S1(d, 'settings_palette_done');
  d.ctl.state.settings.deleteState = 'deleting';
  S1(d, 'settings_deleting');
  d.ctl.state.settings.deleteState = 'done';
  S1(d, 'settings_deleted');
  d.ctl.state.settings.deleteState = 'error';
  S1(d, 'settings_delete_error');
  return c;
}

/** a six-棒 chain through the cards: entry states, describe states, reveal, teaser */
async function tourChain(w) {
  const { probe, srv } = w;
  const S1 = (c, l) => probe.snap(c, l);
  srv.knobs.subscribeTmpl = 'tmpl-1';
  const { chainId, ref } = w.seed('S');
  // Q: claimable, then a describe turn with every status
  const Q = w.client('Q');
  const loading = Q.ctl.start(ENTER_INVITE(chainId, 't-Q'));
  S1(Q, 'entry_loading');
  await loading;
  await Q.settle();
  S1(Q, 'entry_claimable');
  // the same chain seen by a player who has not agreed to the rules
  const R0 = w.client('R0', { agreed: false });
  await enter(R0, ENTER_INVITE(chainId, 't-R0'));
  S1(R0, 'entry_rulesRequired');
  R0.tapId('entry:claim');
  S1(R0, 'entry_rules_sheet');
  R0.tapId('rules:later');
  // starter sees prevMine
  const S0 = w.client('S');
  await enter(S0, ENTER_INVITE(chainId, 't-S'));
  S1(S0, 'entry_prevMine');
  S0.tapId('entry:share');
  await S0.settle();
  // not in the chain's group
  const W0 = w.client('W0');
  await enter(W0, ENTER_INVITE(chainId, 't-W0', { shareTicket: 'other-group' }));
  w.join('W0', 'G2');
  await Q.tapId('entry:claim');
  await Q.settle();
  S1(Q, 'describe_empty');
  S1(Q, 'describe_report');
  Q.tapId('describe:report');
  S1(Q, 'describe_report_sheet');
  Q.tapId('report:reason:ad');
  S1(Q, 'describe_report_reason');
  Q.tapId('report:cancel');
  Q.type('加我微信吧');
  await submitText(w, Q, '加我微信吧');
  S1(Q, 'describe_blocked_local');
  await submitText(w, Q, '测试复审');
  S1(Q, 'describe_blocked');
  await submitText(w, Q, '测试繁忙');
  S1(Q, 'describe_busy');
  Q.type('一只小猫在吃面条还有一个超长的句子');
  S1(Q, 'describe_long');
  Q.type('一只小猫');
  S1(Q, 'describe_typed');
  srv.offline = true;
  w.t.mock.timers.tick(300);
  await tapSettle(Q, 'describe:submit');
  S1(Q, 'describe_error');
  srv.offline = false;
  // a second claimant meets a held 棒: taken
  const Y = w.client('Y');
  await enter(Y, ENTER_INVITE(chainId, 't-Y'));
  S1(Y, 'entry_taken');
  await tapSettle(Y, 'entry:group');
  S1(Y, 'group_waiting');
  Y.tapId('back');
  await Y.settle();
  w.t.mock.timers.tick(300);
  await tapSettle(Q, 'describe:submit');
  S1(Q, 'sent_text_passed');
  // 棒 3 (a drawing) held then pending review
  const B = w.client('B');
  await enter(B, ENTER_INVITE(chainId, 't-B'));
  await tapSettle(B, 'entry:claim');
  S1(B, 'draw_step3');
  S1(B, 'draw_report');
  B.strokes(4);
  w.t.mock.timers.tick(300);
  await tapSettle(B, 'draw:submit');
  S1(B, 'sent_step3_pending');
  const Z = w.client('Z');
  await enter(Z, ENTER_INVITE(chainId, 't-Z'));
  S1(Z, 'entry_pending');
  const Bp = w.client('Q'); // Q passed 棒 2, so Q is a participant while 棒 3 is in review
  await enter(Bp, ENTER_INVITE(chainId, 't-B2'));
  S1(Bp, 'entry_pending_participant');
  w.adv(61e3);
  B.view();
  B.ctl.tick(Date.now() + 1);
  w.t.mock.timers.tick(16e3);
  B.view();
  await B.settle();
  S1(B, 'sent_step3_passed');
  // finish steps 4..6 with players T, U (T is also in the chain): reveal
  const ids = ['T', 'U'];
  const refs = ids.map((id) => w.join(id));
  w.play(chainId, 'T', refs[0], 4);
  w.play(chainId, 'U', refs[1], 5);
  // starter's early-reveal button needs >= 4 passed and no live claim: seen at step 6 open
  await S0.ctl.start(ENTER_INVITE(chainId, 't-S2'));
  await S0.settle();
  S1(S0, 'entry_open_step6');
  S0.tapId('entry:revealNow');
  S1(S0, 'entry_revealNow_dialog');
  // the starter plays the last 棒 through the UI: the sent screen turns into the reveal call to action
  S0.tapId('dialog:cancel');
  S0.tapId('back');
  await S0.settle();
  await enter(S0, ENTER_INVITE(chainId, 't-S3'));
  await tapSettle(S0, 'entry:claim');
  await submitText(w, S0, '最后一句话');
  S1(S0, 'reveal_after_last_step');
  // B is still on the 已传出 screen of step 3: its poll learns that the chain was revealed meanwhile
  B.ctl.state.sent.modState = 'pending';
  w.t.mock.timers.tick(16e3);
  B.view();
  await B.settle();
  S1(B, 'sent_revealed');
  B.tapId('sent:reveal');
  await B.settle();
  S1(B, 'reveal_after_sent');
  // reveal for a participant: autoplay then the full strip, laugh, replay a drawing, report
  const P = w.client('Q');
  await P.ctl.start(ENTER_REVEAL(chainId, 't-Q2'));
  const rl = P.ctl.state.reveal;
  S1(P, 'reveal_autoplay_start');
  await P.settle();
  S1(P, 'reveal_autoplay');
  w.t.mock.timers.tick(3500);
  S1(P, 'reveal_autoplay_mid');
  P.tapId('reveal:skip');
  S1(P, 'reveal_done');
  await tapSettle(P, 'reveal:laugh:2');
  S1(P, 'reveal_laughed');
  P.tapId('reveal:drawing:1');
  S1(P, 'reveal_solo_replay');
  w.t.mock.timers.tick(1200);
  S1(P, 'reveal_solo_replay_mid');
  P.tapId('reveal:replayAll');
  w.t.mock.timers.tick(30e3);
  P.view();
  P.tapId('reveal:report:3');
  S1(P, 'reveal_report_sheet');
  P.tapId('report:reason:politics');
  await tapSettle(P, 'report:submit');
  S1(P, 'reveal_report_done');
  void rl;
  // the same chain from a player who was not part of it: entry then the teaser
  const N = w.client('N');
  w.join('N');
  await enter(N, ENTER_INVITE(chainId, 't-N'));
  S1(N, 'entry_revealedTeaser');
  if (N.screen() === 'entry') await tapSettle(N, 'entry:teaser');
  S1(N, 'teaser_ready');
  N.tapId('teaser:report');
  S1(N, 'teaser_report_sheet');
  N.tapId('report:cancel');
  await tapSettle(N, 'teaser:sameAgain');
  S1(N, 'picker_same_again');
  // the entry of a participant: 看揭晓
  const Pe = w.client('T');
  await enter(Pe, ENTER_INVITE(chainId, 't-T'));
  S1(Pe, 'entry_revealedParticipant');

  // paused reveal (kill switch) and placeholders
  srv.admin.setUgc({ viewEnabled: false });
  const Pp = w.client('U');
  await enter(Pp, ENTER_REVEAL(chainId, 't-U2'));
  S1(Pp, 'reveal_paused');
  srv.admin.setUgc({ viewEnabled: true });
  srv.admin.hideStep(chainId, 3);
  const Ph = w.client('U');
  await enter(Ph, ENTER_REVEAL(chainId, 't-U3'));
  w.t.mock.timers.tick(30e3);
  Ph.view();
  S1(Ph, 'reveal_hidden_step');
  // offline reveal
  srv.offline = true;
  const Po = w.client('U');
  await enter(Po, ENTER_REVEAL(chainId, 't-U4'));
  S1(Po, 'reveal_offline');
  srv.offline = false;
  Po.tapId('reveal:retry');
  await Po.settle();
  w.t.mock.timers.tick(30e3);
  S1(Po, 'reveal_after_retry');
  // the album of a participant, the group list with a revealed chain
  await tapSettle(Po, 'back');
  S1(Po, 'after_reveal_back');
  return { chainId, ref };
}

/** the remaining entry states, group list, album and detail */
async function tourStates(w) {
  const { probe, srv } = w;
  const S1 = (c, l) => probe.snap(c, l);
  // expired: started, one more 棒, then 49 h pass
  const ex = w.seed('X1');
  w.fill(ex.chainId, 'X1', ['X2'], 2);
  const X1 = w.client('X1');
  await enter(X1, ENTER_INVITE(ex.chainId, 't-X1'));
  S1(X1, 'entry_open_claimable');
  w.adv(49 * 3600e3);
  // an open chain that stays open, for group lists
  const open = w.seed('X3', 'B02');
  // a removed chain and a missing one
  const gone = w.seed('X4', 'C03');
  srv.admin.removeChain(gone.chainId);
  await X1.ctl.start(ENTER_INVITE(ex.chainId, 't-X1b'));
  await X1.settle();
  S1(X1, 'entry_expired_starter');
  await tapSettle(X1, 'entry:mine');
  S1(X1, 'detail_expired');
  X1.tapId('detail:delete:1');
  S1(X1, 'detail_delete_dialog');
  X1.tapId('dialog:cancel');
  X1.tapId('back');
  await X1.settle();
  const X5 = w.client('X5');
  w.join('X5');
  await enter(X5, ENTER_INVITE(ex.chainId, 't-X5'));
  S1(X5, 'entry_expired_other');
  X5.tapId('entry:home');
  await X5.settle();
  const Xr = w.client('X6');
  w.join('X6');
  await enter(Xr, ENTER_INVITE(gone.chainId, 't-X6'));
  S1(Xr, 'entry_removed');
  await enter(Xr, ENTER_INVITE('zzzzzzzzzz', 't-X6b'));
  S1(Xr, 'entry_notFound');
  await enter(Xr, ENTER_REVEAL(gone.chainId, 't-X6c'));
  S1(Xr, 'teaser_removed');
  await enter(Xr, ENTER_REVEAL('zzzzzzzzzz', 't-X6d'));
  S1(Xr, 'teaser_notFound');
  // restricted and kill switch
  const Xs = w.client('X7');
  w.join('X7');
  srv.admin.restrict('X7', 3 * 24 * 3600e3);
  await enter(Xs, ENTER_INVITE(open.chainId, 't-X7'));
  S1(Xs, 'entry_restricted');
  Xs.tapId('back');
  await Xs.settle();
  closeSheet(Xs);
  S1(Xs, 'home_restricted');
  srv.admin.setUgc({ createEnabled: false });
  const Xu = w.client('X8');
  w.join('X8');
  await enter(Xu, ENTER_INVITE(open.chainId, 't-X8'));
  S1(Xu, 'entry_ugcPaused');
  Xu.tapId('back');
  await Xu.settle();
  closeSheet(Xu);
  S1(Xu, 'home_ugcPaused');
  srv.admin.setUgc({ createEnabled: true });
  // a chain where the viewer is capped (forced: the server rule needs three of the viewer's 棒)
  const Xc = w.client('X9');
  w.join('X9');
  await enter(Xc, ENTER_INVITE(open.chainId, 't-X9'));
  Xc.ctl.state.entry.state = 'capReached';
  Xc.ctl.state.entry.data = Object.assign({}, Xc.ctl.state.entry.data, { code: 'CAP_REACHED' });
  S1(Xc, 'entry_capReached');
  Xc.ctl.state.entry.state = 'wrongGroup';
  S1(Xc, 'entry_wrongGroup');
  Xc.ctl.state.entry.state = 'offline';
  S1(Xc, 'entry_offline');
  Xc.ctl.state.entry.state = 'error';
  S1(Xc, 'entry_error');
  // a describe turn left alone until the clock runs out
  const Xt = w.client('XT');
  w.join('XT');
  await enter(Xt, ENTER_INVITE(open.chainId, 't-XT'));
  await tapSettle(Xt, 'entry:claim');
  w.adv(46e3);
  Xt.view();
  await Xt.settle();
  S1(Xt, 'describe_timeUp');
  Xt.tapId('describe:timeUpOk');
  await Xt.settle();
  // picker and teaser failure states (forced: they need a failed create / a failed reveal fetch)
  const Xp = w.client('XP');
  w.join('XP');
  await enter(Xp, ENTER_INVITE('zzzzzzzzzz', 't-XP'));
  Xp.tapId('entry:home');
  await Xp.settle();
  closeSheet(Xp);
  await tapSettle(Xp, 'home:start');
  Xp.ctl.state.picker.state = 'error';
  Xp.ctl.state.picker.errorText = '没成功，请重试';
  S1(Xp, 'picker_error');
  Xp.tapId('picker:retry');
  Xp.ctl.state.picker.state = 'offline';
  S1(Xp, 'picker_offline');
  Xp.ctl.state.teaser = { chainId: 'x', state: 'offline' };
  Xp.ctl.state.screen = 'teaser';
  S1(Xp, 'teaser_offline');
  Xp.tapId('teaser:retry');
  // group list with data, empty, no group, error
  const G = w.client('X3');
  await enter(G, ENTER_INVITE(open.chainId, 't-G'));
  await tapSettle(G, 'entry:group');
  S1(G, 'group_ready');
  G.tapId((h) => h.id.indexOf('group:chain:') === 0);
  await G.settle();
  S1(G, 'entry_from_group');
  G.tapId('back');
  await G.settle();
  G.ctl.state.groupList.state = 'error';
  S1(G, 'group_error');
  G.tapId('group:retry');
  await G.settle();
  const H = w.client('H1');
  w.join('H1', 'G9');
  await enter(H, { scene: 1044, query: { k: 'zzzzzzzzzz' }, shareTicket: 't-H', chatType: 3 });
  H.tapId('entry:home');
  await H.settle();
  closeSheet(H);
  S1(H, 'home_group_line_empty');
  H.tapId('home:groupLine');
  await H.settle();
  S1(H, 'group_empty');
  H.ctl.state.groupList.state = 'loading';
  S1(H, 'group_loading');
  const N0 = w.client('N0');
  await N0.ctl.start(undefined);
  await N0.settle();
  closeSheet(N0);
  w.t.mock.timers.tick(300);
  await tapSettle(N0, 'home:album');
  S1(N0, 'album_empty');
  N0.ctl.state.album.state = 'loading';
  S1(N0, 'album_loading');
  N0.tapId('back');
  await N0.settle();
  // detail loading / offline
  N0.ctl.state.detail = { chainId: ex.chainId, state: 'loading', item: null };
  N0.ctl.state.screen = 'detail';
  S1(N0, 'detail_loading');
  N0.ctl.state.detail.state = 'offline';
  S1(N0, 'detail_offline');
  N0.ctl.state.screen = 'home';
  // home offline / error with the cached data gone
  srv.offline = true;
  const Off = w.client('OFF');
  await Off.ctl.start(undefined);
  await Off.settle();
  S1(Off, 'home_offline');
  srv.offline = false;
  Off.tapId('home:retry');
  await Off.settle();
  S1(Off, 'home_retry_ok');
  // the album for a player with chains in every state
  const A = w.client('X1');
  await A.ctl.start(undefined);
  await A.settle();
  closeSheet(A);
  await tapSettle(A, 'home:album');
  S1(A, 'album_full');
  A.ctl.state.album.cursor = 'next';
  S1(A, 'album_more');
  srv.offline = true;
  A.tapId('back');
  await A.settle();
  await tapSettle(A, 'home:album');
  S1(A, 'album_offline');
  srv.offline = false;
  // strike warning on home, and the group line
  srv.admin.strike('X1', 'report');
  const Wn = w.client('X1');
  await enter(Wn, ENTER_INVITE(open.chainId, 't-Wn'));
  Wn.tapId('back');
  await Wn.settle();
  closeSheet(Wn);
  Wn.ctl.state.home.sheet = 'strike';
  S1(Wn, 'home_strike_sheet');
  closeSheet(Wn);
  S1(Wn, 'home_group_line');
}

module.exports = { createProbe, makeWorld, tourSolo, tourChain, tourStates, displayOf };
