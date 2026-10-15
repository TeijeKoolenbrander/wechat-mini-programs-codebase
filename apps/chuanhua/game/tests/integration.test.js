/**
 * UI <-> logic integration. The real controller (on the in-memory mock server, several players) drives the real
 * renderers through every screen and state (tests/integration-views.js) in standard, large-text, high-contrast
 * and both. Checks:
 *   1. no renderer threw on a real view model (the stub fallback is gone: a throw would blank the frame),
 *   2. no drawn text contains undefined / NaN / null / [object,
 *   3. every property a renderer reads from a view model is supplied by js/vm.js and the controller (or is a
 *      documented optional extra),
 *   4. hit ids: every id a renderer draws is routed by the controller, every id the controller routes is in
 *      js/render/CONTRACT.md, and every id in CONTRACT.md is routed or structural,
 *   5. safety: nothing but the viewer's own content is drawn on the entry/sent/teaser screens, share cards
 *      never carry a drawing.
 *
 * DUMP_VIEWS=<dir> also writes the real view models as JSON for the preview tool:
 *   DUMP_VIEWS=/tmp/views node --test tests/integration.test.js
 *   cd tools/preview && REAL_DIR=/tmp/views node render.js
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { createProbe, makeWorld, tourSolo, tourChain, tourStates, tourBlocked } = require('./integration-views');
const renderers = require('../js/renderers');

const ROOT = path.join(__dirname, '..');
const MODES = ['default', 'large', 'hc', 'large_hc'];
const SMALL = { windowWidth: 320, windowHeight: 568, pixelRatio: 2, statusBarHeight: 20 };

/** Properties a renderer may read that the vm only carries when there is something to show (render/CONTRACT.md). */
const OPTIONAL_READS = [
  /^reveal\.replay$/, // only while one drawing replays after a tap on it
  /^sent\.mine\.(strokes|text)$/, // a 棒 is either a drawing or a sentence
  /^detail\.mine\[\]\.(strokes|text)$/,
  /^overlay\./, // the overlay vm is sparse by design: only the layers that are open
];

const probes = [];
const seen = { errors: [], problems: [], missing: new Map(), hitIds: new Set(), screens: new Map() };
const dumped = {};

function collect(p, mode) {
  probes.push(p);
  p.problems.forEach((x) => seen.problems.push(x));
  for (const m of p.missing) if (!seen.missing.has(m)) seen.missing.set(m, mode);
  p.hitIds.forEach((id) => seen.hitIds.add(id));
  for (const [screen, byLabel] of Object.entries(p.snaps)) {
    const s = seen.screens.get(screen) || new Set();
    Object.keys(byLabel).forEach((l) => s.add(l));
    seen.screens.set(screen, s);
    if (process.env.DUMP_VIEWS) {
      const d = ((dumped[mode] = dumped[mode] || {})[screen] = dumped[mode][screen] || {});
      for (const [label, st] of Object.entries(byLabel)) d[label] = { vm: st.vm, overlay: st.overlay || undefined };
    }
  }
  while (renderers.errors.length) seen.errors.push(mode + ': ' + renderers.errors.shift());
}

for (const mode of MODES) {
  test(`real screens, new player: home, settings, picker, drawing, sent, album, ${mode}`, async (t) => {
    const p = createProbe(mode);
    await tourSolo(makeWorld(t, p, mode));
    collect(p, mode);
  });
  test(`real screens, one chain through the cards: entry, describe, draw, reveal, teaser, ${mode}`, async (t) => {
    const p = createProbe(mode);
    await tourChain(makeWorld(t, p, mode));
    collect(p, mode);
  });
  test(`real screens, blocked and voided drawings: sent, strike sheet, album, detail, ${mode}`, async (t) => {
    const p = createProbe(mode);
    await tourBlocked(makeWorld(t, p, mode));
    collect(p, mode);
  });
  test(`real screens, entry states, group list, album, detail, offline, ${mode}`, async (t) => {
    const p = createProbe(mode);
    await tourStates(makeWorld(t, p, mode));
    collect(p, mode);
  });
}

for (const mode of ['default', 'large']) {
  test(`real screens at 320x568, ${mode}`, async (t) => {
    const p = createProbe(mode + '@320');
    await tourChain(makeWorld(t, p, mode, SMALL));
    await tourStates(makeWorld(t, p, mode, SMALL));
    collect(p, mode + '@320');
  });
}

test('every screen the game has was visited, with its main states', () => {
  for (const screen of ['home', 'picker', 'draw', 'describe', 'sent', 'entry', 'reveal', 'teaser', 'group', 'album', 'detail', 'settings']) assert.ok(seen.screens.has(screen), 'visited ' + screen);
  const labels = (s) => [...seen.screens.get(s)];
  const has = (screen, re) => assert.ok(labels(screen).some((l) => re.test(l)), screen + ' ~ ' + re);
  has('draw', /timeUp/);
  has('draw', /error/);
  has('describe', /blocked/);
  has('describe', /busy/);
  has('sent', /pending/);
  has('sent', /passed/);
  has('sent', /blocked$/);
  has('sent', /void$/);
  has('detail', /blocked/);
  has('reveal', /autoplay/);
  has('reveal', /paused/);
  has('reveal', /offline/);
  has('entry', /claimable/);
  has('entry', /taken/);
  has('entry', /restricted/);
  has('teaser', /ready/);
  has('group', /ready/);
  has('album', /full/);
  has('detail', /expired/);
});

test('no renderer threw on a real view model (no stub fallback exists)', () => {
  assert.deepStrictEqual(seen.errors, []);
});

test('no drawn text contains undefined, NaN, null or [object', () => {
  assert.deepStrictEqual(seen.problems, []);
});

test('every vm property a renderer reads is supplied by the vm builders (no undefined fields)', () => {
  const bad = [...seen.missing.keys()].filter((k) => !OPTIONAL_READS.some((re) => re.test(k)));
  assert.deepStrictEqual(bad, []);
});

// ---------------------------------------------------------------- hit ids

const controllerSrc = fs.readFileSync(path.join(ROOT, 'js', 'controller.js'), 'utf8');
const contractSrc = fs.readFileSync(path.join(ROOT, 'js', 'render', 'CONTRACT.md'), 'utf8');

const ID_RE = /^(?:[a-z][A-Za-z]*(?::[A-Za-z0-9<>*|]+)+|back)$/;
const routedLiterals = new Set([...controllerSrc.matchAll(/'((?:[a-z][A-Za-z]*(?::[A-Za-z]*)+)|back)'/g)].map((m) => m[1]).filter((s) => !s.endsWith(':') || /^[a-z]+:[a-z]+:$/.test(s)));
const routedPrefixes = [...controllerSrc.matchAll(/indexOf\('([a-z]+:[a-zA-Z:]+:)'\) === 0/g)].map((m) => m[1]);
const contractIds = new Set(
  [...contractSrc.matchAll(/`([^`\s]+)`/g)]
    .map((m) => m[1])
    .filter((s) => ID_RE.test(s))
    .filter((s) => !/^(playing|state|kind|modState|status):/.test(s)) // value examples, not ids
    .map((s) => s.replace(/<[^>]*>/g, ''))
);
contractIds.add('back');

/** ids that only swallow taps (render/CONTRACT.md: "Unknown ids ... only swallow taps") or are drag areas */
const STRUCTURAL = /(:block|:card|:body)$|^(sheet:body|sheet:scroll|reveal:scroll|banner:slot|dialog:block|adstub:block|settings:feedback)$/; // settings:feedback is the native wx.createFeedbackButton, positioned over this rect by main.js
const isStructural = (id) => STRUCTURAL.test(id);
const isRouted = (id) => routedLiterals.has(id) || routedPrefixes.some((p) => id.indexOf(p) === 0);
const inContract = (id) => contractIds.has(id) || [...contractIds].some((c) => c.endsWith(':') && id.startsWith(c));

test('hit ids: every id the renderers draw is routed by the controller', () => {
  const unrouted = [...seen.hitIds].filter((id) => !isStructural(id) && !isRouted(id));
  assert.deepStrictEqual(unrouted, []);
});

test('hit ids: every id the renderers draw is documented in js/render/CONTRACT.md', () => {
  const undocumented = [...seen.hitIds].filter((id) => !isStructural(id) && !inContract(id));
  assert.deepStrictEqual(undocumented, []);
});

test('hit ids: every id the controller routes is in CONTRACT.md (no phantom ids)', () => {
  const phantom = [...routedLiterals].filter((id) => !isStructural(id) && !inContract(id));
  assert.deepStrictEqual(phantom, []);
});

test('hit ids: every id in CONTRACT.md is drawn by some real state or routed (no dead documentation)', () => {
  const dead = [...contractIds].filter((id) => !id.endsWith(':') && !isStructural(id) && !seen.hitIds.has(id) && !isRouted(id));
  assert.deepStrictEqual(dead, []);
});

test('hit ids: ids that exist only in the contract are reachable (drawn in at least one state)', () => {
  const neverDrawn = [...contractIds].filter((id) => !id.endsWith(':') && !isStructural(id) && !seen.hitIds.has(id));
  // allowed: ids the renderer draws only in states the mock server cannot produce
  const allowed = new Set(['entry:teaser']); // drawn only for revealedTeaser, which the controller never shows (it opens the teaser screen instead)
  assert.deepStrictEqual(neverDrawn.filter((id) => !allowed.has(id)), []);
});

// ---------------------------------------------------------------- safety

test('safety: entry, sent and teaser views never carry chain content of other players', () => {
  const FORBIDDEN_VM_KEYS = ['strokes', 'drawing', 'steps'];
  for (const p of probes) {
    for (const screen of ['entry', 'teaser']) {
      for (const [label, st] of Object.entries(p.snaps[screen] || {})) {
        const json = JSON.stringify(st.vm);
        for (const k of FORBIDDEN_VM_KEYS) assert.ok(!json.includes('"' + k + '"'), `${screen}/${label} carries ${k}`);
      }
    }
  }
});

test('safety: while a drawing is under review the author sees it as pending, never as passed', () => {
  for (const p of probes) {
    for (const [label, st] of Object.entries((p.snaps.sent || {}))) {
      if (/pending/.test(label)) assert.ok(st.vm.modState === 'pending', `${label}: ${st.vm.modState}`);
    }
  }
});

test('share cards: the vms share.js builds are what shareCard.js reads, and no drawing or other 棒 text can reach the image', () => {
  const { inviteCardVm, revealCardVm } = require('../js/share');
  const sc = require('../js/render/shareCard');
  const texts = [];
  const ctx = new Proxy({ measureText: (s) => ({ width: String(s).length * 10 }), createLinearGradient: () => ({ addColorStop() {} }), fillText: (s) => texts.push(String(s)) }, { get: (t, k) => (k in t ? t[k] : () => {}), set: (t, k, v) => ((t[k] = v), true) });
  const hostile = { passed: 3, promptText: '起点', finalText: '终点', participantCount: 5, strokes: { v: 1, s: [[0, 1, 5, 5]] }, steps: [{ text: '机密中间句' }], text: '机密中间句' };
  sc.draw(ctx, inviteCardVm(hostile));
  sc.draw(ctx, revealCardVm(hostile));
  const all = texts.join('|');
  assert.ok(/已传 3\/6 棒/.test(all), all);
  assert.ok(/5 位群友接力/.test(all), 'the participant count arrives as `people`: ' + all);
  assert.ok(all.includes('起点') && all.includes('终点'));
  assert.ok(!all.includes('机密中间句') && !/undefined|NaN/.test(all));
  assert.ok(!/require\(['"]\.\/strokes/.test(fs.readFileSync(path.join(ROOT, 'js', 'render', 'shareCard.js'), 'utf8')), 'the share card module cannot draw strokes');
});

test('share: the static fallback image ships (without it WeChat screenshots the game canvas, which may show a drawing)', () => {
  const { FALLBACK_IMAGE } = require('../js/share');
  const f = path.join(ROOT, FALLBACK_IMAGE);
  assert.ok(fs.existsSync(f), FALLBACK_IMAGE + ' exists');
  const b = fs.readFileSync(f);
  assert.equal(b.slice(1, 4).toString(), 'PNG');
  assert.ok(b.length < 200 * 1024, 'small');
  assert.equal(b.readUInt32BE(16), 500);
  assert.equal(b.readUInt32BE(20), 400);
});

test('DUMP_VIEWS writes the real view models for the preview tool', () => {
  if (!process.env.DUMP_VIEWS) return;
  fs.mkdirSync(process.env.DUMP_VIEWS, { recursive: true });
  for (const [mode, d] of Object.entries(dumped)) fs.writeFileSync(path.join(process.env.DUMP_VIEWS, 'real_' + mode + '.json'), JSON.stringify(d));
});
