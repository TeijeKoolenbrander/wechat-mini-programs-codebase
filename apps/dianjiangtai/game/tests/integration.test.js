/**
 * UI <-> logic integration. The real controller drives the real renderers through every screen and state
 * (tests/integration-views.js) in standard, large-text, high-contrast and both. Checks:
 *   1. no renderer fell back to the stub (a throw on a real view model),
 *   2. no drawn text contains undefined / NaN / null / [object,
 *   3. every property a renderer reads from a view model is supplied by the vm builders (or is a documented
 *      optional extra),
 *   4. hit ids: every id a renderer draws is routed by the controller, every id the controller routes is in
 *      js/render/CONTRACT.md, and every id in CONTRACT.md is routed (or is a drag area / structural).
 *
 * DUMP_VIEWS=<dir> also writes the real view models as JSON for the preview tool:
 *   DUMP_VIEWS=/tmp/views node --test tests/integration.test.js
 *   cd tools/preview && REAL_DIR=/tmp/views node render.js
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { runFriday, runSunday, runMisc } = require('./integration-views');

const ROOT = path.join(__dirname, '..');
const MODES = ['default', 'large', 'hc', 'large_hc'];

/** Properties a renderer may read that the vm only carries when there is something to show (CONTRACT.md "optional"). */
const OPTIONAL_READS = [
  /^overlay\./, // the overlay vm is sparse by design: only the layers that are open
  /^result\.challenge$/, // only on a challenge result
  /^challenge\.bestRecord$/, // own challenge with no answers yet
  /^challenge\.answerCount$/,
  /^challenge\.lockedText$/,
  /^challenge\.subscribe$/, // own challenge only
  /^board\.banner\./,
  /^draft\.selected\.name$/,
];

const probes = [];
const seen = { fallback: [], problems: [], missing: new Map(), hitIds: new Set(), screens: new Map() };
let dumped = {};

function collect(p, mode) {
  probes.push(p);
  for (const e of p.errors) seen.fallback.push(mode + ': ' + e);
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
}

for (const mode of MODES) {
  test(`real screens, Friday flows, ${mode}`, async (t) => {
    collect(await runFriday(t, mode), mode);
  });
  test(`real screens, Sunday 识人 flow, ${mode}`, async (t) => {
    collect(await runSunday(t, mode), mode);
  });
  test(`real screens, offline / challenge / board / album / subscribe states, ${mode}`, async (t) => {
    collect(await runMisc(t, mode), mode);
  });
}

test('every screen the game has was visited, with its main states', () => {
  for (const screen of ['home', 'draft', 'result', 'challenge', 'board', 'history', 'historyIssue']) assert.ok(seen.screens.has(screen), 'visited ' + screen);
  const labels = (s) => [...seen.screens.get(s)];
  assert.ok(labels('result').some((l) => /revealing/.test(l)) && labels('result').some((l) => /done/.test(l)) && labels('result').some((l) => /pendingSubmit/.test(l)));
  assert.ok(labels('result').some((l) => /shiren_reveal/.test(l)), '识人 reveal');
  assert.ok(labels('draft').some((l) => /shiren/.test(l)) && labels('draft').some((l) => /roundFetch_failed/.test(l)));
  assert.ok(labels('challenge').length >= 4);
  assert.ok(labels('board').includes('board_ready'));
});

test('no renderer fell back to the stub on a real view model', () => {
  assert.deepStrictEqual(seen.fallback, []);
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

const handlerRegion = (() => {
  const a = controllerSrc.indexOf('c.onDrag = function');
  const b = controllerSrc.indexOf('// ---------------------------------------------------------------- rendering state');
  assert.ok(a > 0 && b > a, 'controller touch-routing region found');
  return controllerSrc.slice(a, b);
})();

const ID_RE = /^(?:[a-z][A-Za-z]*(?::[A-Za-z<>*]+)+|back|primary|undo|retryRound)$/;
const routedLiterals = new Set([...handlerRegion.matchAll(/'((?:[a-z][A-Za-z]*(?::[A-Za-z]*)+)|back|primary|undo|retryRound)'/g)].map((m) => m[1]).filter((s) => !s.endsWith(':') || ['pool:', 'slot:', 'history:item:'].includes(s)));
const contractIds = new Set(
  [...contractSrc.matchAll(/`([^`\s]+)`/g)]
    .map((m) => m[1])
    .filter((s) => ID_RE.test(s))
    .map((s) => s.replace(/<[^>]*>/g, '')) // pool:<generalId> -> pool:
);
['back', 'primary', 'undo', 'retryRound'].forEach((id) => contractIds.add(id));

/** ids that only swallow taps (CONTRACT: "Unknown ids ... ignore them") */
const STRUCTURAL = /(:block|:card|:scrim|:body)$|^(sheet:body|sheet:scrim|coach:block|dialog:block|adstub:block|privacy:block|album:block)/;
/** drag areas: the controller scrolls them in onDrag; a tap on them is ignored */
const DRAG = /^(home:scroll|pool:list|result:scroll|sheet:list|history:list|issue:list|board:list)$/;

/** privacy dialog ids: the own-dialog fallback of spec 11.6 (wx.onNeedPrivacyAuthorization), kept in the renderer for the
 *  device spike. v1 uses the official WeChat popup (wx.requirePrivacyAuthorize), so the controller never opens it. */
const SPIKE_FALLBACK = /^privacy:/;
const isStructural = (id) => STRUCTURAL.test(id) || SPIKE_FALLBACK.test(id);
function isRouted(id) {
  if (DRAG.test(id)) return handlerRegion.includes(`'${id}'`) || id === 'result:scroll'; // onDrag or no-op tap
  for (const lit of routedLiterals) if (lit === id) return true;
  for (const pre of ['pool:', 'slot:', 'history:item:', 'respin:', 'respinAd:']) if (id.startsWith(pre) && handlerRegion.includes(`'${pre}`)) return true;
  return false;
}
function inContract(id) {
  if (contractIds.has(id)) return true;
  for (const c of contractIds) if (c.endsWith(':') && id.startsWith(c)) return true;
  return false;
}

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

test('hit ids: every id in CONTRACT.md is routed by the controller (or is a drag area / structural)', () => {
  const dead = [...contractIds].filter((id) => !isStructural(id) && !(id.endsWith(':') ? [...routedLiterals].some((l) => l.startsWith(id)) || handlerRegion.includes(`'${id}`) : isRouted(id)));
  assert.deepStrictEqual(dead, []);
});

test('hit ids: the names the two sides used to disagree on are settled (retryRound, result:revealSkip, issue:list, home:scroll, settings:openAlbum, album:*)', () => {
  for (const id of ['retryRound', 'result:revealSkip', 'result:skip', 'issue:list', 'issue:retry', 'home:scroll', 'sheet:list', 'settings:openAlbum', 'album:openSetting', 'album:cancel']) {
    assert.ok(contractIds.has(id), id + ' in CONTRACT.md');
    assert.ok(handlerRegion.includes(`'${id}'`), id + ' routed');
  }
  for (const old of ['round:retry', 'issue:scroll']) {
    assert.ok(!controllerSrc.includes(`'${old}'`), old + ' is gone from the controller');
    assert.ok(!contractSrc.includes('`' + old + '`'), old + ' is not in CONTRACT.md');
  }
});

test('the controller never opens the own privacy dialog (the official popup is used, spec 11.6)', () => {
  assert.ok(!/overlay\.privacy\s*=/.test(controllerSrc));
  assert.ok(![...seen.hitIds].some((id) => /^privacy:/.test(id)));
});

test.after(() => {
  if (process.env.DUMP_VIEWS) {
    fs.mkdirSync(process.env.DUMP_VIEWS, { recursive: true });
    for (const [mode, data] of Object.entries(dumped)) fs.writeFileSync(path.join(process.env.DUMP_VIEWS, 'real_' + mode + '.json'), JSON.stringify(data));
  }
});
