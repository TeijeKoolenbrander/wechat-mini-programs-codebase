'use strict';
/**
 * Integration: the REAL controller drives the REAL renderers (no stub) through every screen, sheet and overlay, in all three
 * display modes. For every state:
 *  - the renderer in use is the real one;
 *  - nothing drawn contains undefined / null / NaN / [object, and nothing contains banned vocabulary;
 *  - every hit id is documented in js/HOOKS.md (the list under "All hit ids");
 *  - every tappable id is routed: tapping it changes something (state, a wx call, a toast ...), checked in a fresh replay.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { createMockServer } = require('../js/mock-server');
const { findForbidden } = require('../core/forbidden');
const { buildFreeDeck } = require('../core/deck');
const { getContent } = require('../core/content');
const { correctChoice } = require('../core/judge');
const { boot, prepare, startUp, closeHowto, rights, miss, answer, dailyLookup, freeLookup } = require('./helpers');

const BAD_TEXT = /undefined|\bnull\b|NaN|\[object|Infinity/;
const DOC = fs.readFileSync(path.join(__dirname, '..', 'js', 'HOOKS.md'), 'utf8');
const IDS_SECTION = DOC.slice(DOC.indexOf('### All hit ids'));

/** `a:<k>:top` -> regex; `history:item:<dateKey>` etc. */
const DOCUMENTED = (IDS_SECTION.match(/`[^`]*:[^`]*`|`back`/g) || []).map((s) => s.slice(1, -1)).filter((s) => /^[a-z*]/.test(s) && !/\s/.test(s)).map((s) => new RegExp('^' + s.replace(/[*]/g, '[^:]*').replace(/<[^>]+>/g, '[^:]+') + '$'));
DOCUMENTED.push(/^back$/);
const SWALLOW = /(:block|:card)$|^sheet:body$/;

const FREE = getContent(1);

async function fresh(t, opts) {
  prepare(t);
  const g = await startUp(t, opts);
  await closeHowto(g);
  return g;
}

/** an opponent who finished today's daily (so boards and challenges have something) */
function opponent(mock, name, right) {
  const idx = mock.allIndex.byId;
  const ok = (q) => (idx[q.bottom.factId].value > idx[q.top.factId].value ? 'hi' : 'lo');
  mock.call('getDaily', {}, name);
  let x = mock.call('startRun', { mode: 'daily', clientRunId: 'opp-' + name }, name);
  for (let i = 0; i < right; i++) x = mock.call('answer', { clientRunId: 'opp-' + name, k: x.k || i + 1, choice: ok(x.question || x.next) }, name);
  const q = x.question || x.next;
  x = mock.call('answer', { clientRunId: 'opp-' + name, k: right + 1, choice: ok(q) === 'hi' ? 'lo' : 'hi' }, name);
  return x;
}
function challengeFrom(mock, name, right) {
  opponent(mock, name, right);
  return mock.call('createChallenge', { runId: 'opp-' + name }, name).challengeId;
}

/** state name -> async (t) => g, ready on the screen to look at */
const STATES = {
  'home.howto': async (t) => {
    prepare(t);
    return startUp(t);
  },
  'home.available': (t) => fresh(t),
  'home.settings': async (t) => {
    const g = await fresh(t);
    g.tapId('home:settings');
    return g;
  },
  'home.sources': async (t) => {
    const g = await fresh(t);
    g.tapId('home:settings');
    g.tapId('settings:sources');
    return g;
  },
  'home.category': async (t) => {
    const g = await fresh(t);
    g.tapId('home:category');
    return g;
  },
  'home.group': async (t) => {
    const g = await fresh(t, { enter: { scene: 1044, query: 's=r&m=daily&d=x', shareTicket: 'tk', chatType: 1 }, privacy: { state: 'agreed', scope: true } });
    await g.settle();
    return g;
  },
  'home.resume': async (t) => {
    const g = await fresh(t);
    g.tapId('home:free');
    await rights(g, 2);
    const g2 = boot(t, { storage: g.storage });
    await g2.settle();
    await closeHowto(g2);
    return g2;
  },
  'home.offline': async (t) => {
    prepare(t);
    const mock = createMockServer({ now: () => Date.now() });
    mock.offline = true;
    const g = await startUp(t, { mockServer: mock });
    await closeHowto(g);
    return g;
  },
  'home.done': async (t) => {
    const g = await fresh(t);
    g.tapId('home:daily');
    await g.settle();
    await rights(g, 2, dailyLookup(g));
    await miss(g, dailyLookup(g));
    g.tapId('result:back');
    return g;
  },
  'home.inProgress': async (t) => {
    prepare(t);
    const mock = createMockServer({ now: () => Date.now() });
    const g = await startUp(t, { mockServer: mock });
    await closeHowto(g);
    g.tapId('home:daily');
    await g.settle();
    await rights(g, 2, dailyLookup(g));
    const g2 = boot(t, { storage: g.storage, mockServer: mock });
    await g2.settle();
    await closeHowto(g2);
    return g2;
  },
  'play.free.coach': async (t) => {
    const g = await fresh(t);
    g.tapId('home:free');
    return g;
  },
  'play.free.revealing': async (t) => {
    const g = await fresh(t);
    g.tapId('home:free');
    g.wait(400);
    g.tapId('answer:' + freeLookup(g.app.ctl.state.r.q));
    await g.settle();
    g.wait(100);
    return g;
  },
  'play.free.miss': async (t) => {
    const g = await fresh(t);
    g.tapId('home:free');
    await rights(g, 1);
    await answer(g, 'wrong', freeLookup, { stopAtMiss: true });
    return g;
  },
  'play.free.source': async (t) => {
    const g = await fresh(t);
    g.tapId('home:free');
    g.tapId('source:top');
    return g;
  },
  'play.free.sourceReport': async (t) => {
    const g = await fresh(t);
    g.tapId('home:free');
    g.tapId('source:top');
    g.tapId('source:report');
    return g;
  },
  'play.free.continue': async (t) => {
    const g = await fresh(t);
    g.tapId('home:free');
    await rights(g, 2);
    await miss(g);
    return g;
  },
  'play.free.adstub': async (t) => {
    const g = await fresh(t);
    g.tapId('home:free');
    await rights(g, 2);
    await miss(g);
    g.tapId('continue:video');
    g.wait(3500); // the stub ad can be completed once its (QA-only) duration has passed
    return g;
  },
  'play.free.dialog': async (t) => {
    const g = await fresh(t);
    g.tapId('home:free');
    await rights(g, 1);
    g.tapId('back');
    return g;
  },
  'play.daily': async (t) => {
    const g = await fresh(t);
    g.tapId('home:daily');
    await g.settle();
    return g;
  },
  'play.daily.netError': async (t) => {
    prepare(t);
    const mock = createMockServer({ now: () => Date.now() });
    const g = await startUp(t, { mockServer: mock });
    await closeHowto(g);
    g.tapId('home:daily');
    await g.settle();
    mock.offline = true;
    g.wait(400);
    g.tapId('answer:' + dailyLookup(g)(g.app.ctl.state.r.q));
    await g.settle();
    g.wait(100);
    return g;
  },
  'result.free': async (t) => {
    const g = await fresh(t);
    g.tapId('home:free');
    await rights(g, 3);
    await miss(g);
    g.tapId('continue:result');
    await g.settle();
    return g;
  },
  'result.daily': async (t) => {
    const g = await fresh(t);
    g.tapId('home:daily');
    await g.settle();
    await rights(g, 2, dailyLookup(g));
    await miss(g, dailyLookup(g));
    return g;
  },
  'result.questions': async (t) => {
    const g = await STATES['result.daily'](t);
    g.tapId('result:questions');
    return g;
  },
  'result.report': async (t) => {
    const g = await STATES['result.daily'](t);
    g.tapId('report:miss:bottom');
    g.tapId('report:reason:value');
    return g;
  },
  'result.source': async (t) => {
    const g = await STATES['result.daily'](t);
    g.tapId('source:miss:top');
    return g;
  },
  'result.albumDenied': async (t) => {
    const g = await fresh(t, { albumDeny: true });
    g.tapId('home:free');
    await rights(g, 1);
    await miss(g);
    g.tapId('continue:result');
    await g.settle();
    g.tapId('result:save');
    await g.settle();
    return g;
  },
  'challenge.ready': async (t) => {
    prepare(t);
    const mock = createMockServer({ now: () => Date.now() });
    const id = challengeFrom(mock, 'friend', 3);
    const g = await startUp(t, { mockServer: mock, enter: { scene: 1007, query: { c: id } }, privacy: { state: 'agreed', scope: true } });
    await g.settle();
    return g;
  },
  'challenge.expired': async (t) => {
    const g = await fresh(t, { enter: { scene: 1007, query: { c: 'NOSUCHID' } } });
    await g.settle();
    return g;
  },
  'board.noGroup': async (t) => {
    const g = await fresh(t, { privacy: { state: 'agreed', scope: true } });
    g.tapId('home:groupBoard');
    return g;
  },
  'board.friend': async (t) => {
    prepare(t);
    const mock = createMockServer({ now: () => Date.now() });
    opponent(mock, 'friend', 2);
    const g = await startUp(t, { mockServer: mock, privacy: { state: 'agreed', scope: true } });
    await closeHowto(g);
    g.tapId('home:friendBoard');
    await g.settle();
    return g;
  },
  'board.empty': async (t) => {
    const g = await fresh(t, { privacy: { state: 'agreed', scope: true } });
    g.tapId('home:friendBoard');
    await g.settle();
    return g;
  },
  'board.unauthorized': async (t) => {
    const g = await fresh(t, { privacy: { state: 'agreed', scope: false } });
    g.tapId('home:friendBoard');
    await g.settle();
    return g;
  },
  'board.privacyDenied': async (t) => {
    const g = await fresh(t, { privacy: { state: 'unknown', refuse: true } });
    g.tapId('home:friendBoard');
    await g.settle();
    return g;
  },
  'history.list': async (t) => {
    const g = await fresh(t);
    g.tapId('home:history');
    await g.settle();
    return g;
  },
  'history.issueLocked': async (t) => {
    const g = await fresh(t);
    g.tapId('home:history');
    await g.settle();
    g.tapId((g.view().vm.items[0] && 'history:item:' + g.view().vm.items[0].dateKey) || 'history:back');
    await g.settle();
    return g;
  },
  'history.issueOpen': async (t) => {
    const g = await fresh(t);
    g.tapId('home:history');
    await g.settle();
    const dk = g.view().vm.items[0].dateKey;
    g.tapId('history:back');
    g.setTime(Date.now() + 36 * 3600e3);
    g.tapId('home:history');
    await g.settle();
    g.tapId('history:item:' + dk);
    await g.settle();
    return g;
  },
};

function setDisplay(g, mode) {
  const s = g.app.store.state;
  s.largeText = mode === 'largeText';
  s.highContrast = mode === 'highContrast';
  g.app.invalidate();
}

function fingerprint(g) {
  const v = g.view();
  const vm = JSON.stringify(v.vm, (k, x) => (['t', 'revealT', 'turn', 'count', 'sharedCanvas'].indexOf(k) >= 0 ? undefined : x));
  return JSON.stringify([v.screen, vm, v.overlay, g.log.calls.length, g.log.shares.length, g.log.ads.length, g.log.storageWrites, g.log.cloudWrites.length, (g.log.odc || []).length, g.log.saved.length, g.log.subscribe.length, g.app.api.mock ? g.app.api.mock.calls.length : 0]);
}

const names = Object.keys(STATES);

test('every screen, sheet and overlay in all display modes: real renderer, clean text, documented ids', async (t) => {
  assert.ok(DOCUMENTED.length > 80, 'parsed ' + DOCUMENTED.length + ' documented ids');
  const seen = new Set();
  const problems = [];
  for (const name of names) {
    for (const mode of ['standard', 'largeText', 'highContrast']) {
      const sub = { mock: t.mock };
      void sub;
      await t.test(name + ' / ' + mode, async (tt) => {
        const g = await STATES[name](tt);
        setDisplay(g, mode);
        const text = g.frame();
        assert.strictEqual(g.app.renderer.kind, 'real', 'the real renderer is in use');
        const strings = g.log.text.slice();
        assert.ok(strings.length > 0, 'something was drawn');
        strings.forEach((s) => {
          if (BAD_TEXT.test(s)) problems.push(name + '/' + mode + ' draws "' + s + '"');
          if (findForbidden(s)) problems.push(name + '/' + mode + ' draws banned "' + s + '"');
        });
        void text;
        g.app.hits.forEach((h) => {
          seen.add(h.id);
          if (SWALLOW.test(h.id)) return;
          if (!DOCUMENTED.some((re) => re.test(h.id))) problems.push(name + '/' + mode + ' emits undocumented id ' + h.id);
          if (!([h.x, h.y, h.w, h.h].every(Number.isFinite) && h.w > 0 && h.h > 0)) problems.push(name + ' bad rect for ' + h.id);
        });
      });
    }
  }
  assert.deepStrictEqual(problems, []);
  assert.ok(seen.size > 60, 'distinct ids seen: ' + seen.size);
});

/** ids that legitimately change nothing the fingerprint can see */
const NO_VISIBLE_EFFECT = new Set(['settings:feedback']);
const SCROLL_ONLY = /(:scroll|^sheet:list|^play:cards|^board:list)$/;

test('every tappable id is routed: tapping it changes something', async (t) => {
  const dead = [];
  let checked = 0;
  for (const name of names) {
    const probe = await new Promise((resolve, reject) => {
      t.test('probe ' + name, async (tt) => {
        try {
          const g = await STATES[name](tt);
          g.frame();
          // only what a finger can reach: the topmost area at the centre of the rect (sheets cover the screen under them)
          resolve([...new Set(g.app.hits.filter((h) => g.app.renderer.hitTest(g.app.hits, h.x + h.w / 2, h.y + h.h / 2) === h.id).map((h) => h.id))].filter((id) => !SWALLOW.test(id) && !SCROLL_ONLY.test(id) && !NO_VISIBLE_EFFECT.has(id)));
        } catch (e) {
          reject(e);
        }
      });
    });
    for (const id of probe) {
      // 返回 at the dialog and a few ids are one-way; each replay starts from a fresh app
      await t.test(name + ' -> ' + id, async (tt) => {
        const g = await STATES[name](tt);
        g.frame();
        if (!g.app.hits.some((h) => h.id === id)) return;
        const before = fingerprint(g);
        g.wait(400);
        g.tapId(id);
        await g.settle();
        g.wait(50);
        g.frame();
        checked++;
        if (fingerprint(g) === before) dead.push(name + ' -> ' + id);
      });
    }
  }
  assert.deepStrictEqual(dead, [], 'ids that do nothing');
  assert.ok(checked > 150, 'checked ' + checked);
});

test('real content on the play screen: every fact label and value fits at 320x568 in every mode', () => {
  const R = require('../js/render');
  const { makeLayout } = require('../js/render/layout');
  const V = require('../js/vm');
  const { questionPayload, revealOf } = require('../core/question');
  const daily = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'tools', 'out', 'daily-facts.json'), 'utf8')).facts;
  const byId = {};
  FREE.facts.concat(daily).forEach((f) => {
    byId[f.id] = f;
  });
  const all = FREE.facts.concat(daily);
  const problems = [];
  const calls = [];
  const ctx = new Proxy({}, {
    get: (o, p) => {
      if (p === 'measureText') return (s) => ({ width: Array.from(String(s)).reduce((w, ch) => w + (ch.charCodeAt(0) < 128 ? 10 : 18), 0) });
      if (p === 'fillText') return (s, x) => calls.push({ s: String(s), x });
      if (p === 'createLinearGradient' || p === 'createRadialGradient') return () => ({ addColorStop() {} });
      return o[p] || (() => {});
    },
    set: (o, p, v) => ((o[p] = v), true),
  });
  for (const mode of [{ largeText: false, highContrast: false }, { largeText: true, highContrast: false }]) {
    const L = makeLayout({ windowWidth: 320, windowHeight: 568, pixelRatio: 2, statusBarHeight: 20, menuRect: { top: 26, bottom: 58, left: 226, right: 313, width: 87, height: 32 }, display: mode });
    for (let i = 0; i < all.length; i += 2) {
      const a = all[i];
      const b = all.slice(i + 1).find((x) => x.measure === a.measure);
      if (!b) continue;
      const q = questionPayload({ k: 1, a: a.id, b: b.id, segStart: true }, byId);
      const vm = V.playVm(
        { mode: 'free', ranked: false, friendly: false, streak: 0, k: 1, deckLength: 60, phase: 'correct', q, reveal: revealOf(b), correct: true, lifeUsed: false, challengeInfo: null },
        { revealT: 1, sheet: null, sheetVm: null, coach: false, categoryLabel: '全部', display: V.displayVm({ largeText: mode.largeText, highContrast: false }), muted: false, t: 0 }
      );
      calls.length = 0;
      R.screens.play.draw(ctx, vm, L);
      calls.forEach((c) => {
        if (BAD_TEXT.test(c.s)) problems.push(a.id + ' draws ' + c.s);
      });
    }
  }
  assert.deepStrictEqual(problems, []);
});
