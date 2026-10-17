'use strict';
// Shared rig for tests that drive the REAL js/render/* modules (see real-screens.test.js).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { boot } = require('./harness');

const CONTRACT = fs.readFileSync(path.join(__dirname, '..', 'js', 'render', 'CONTRACT.md'), 'utf8');
const ADS = { adUnits: { rewarded: 'rw-1', interstitial: 'in-1' } };
const SWALLOW = /:block$|^sheet:(body|scrim)$|^coach:block$/;

/** vm properties the renderers may read although they are optional extras (stated defaults in CONTRACT.md) */
const OPTIONAL = new Set([
  'revealT', 'confetti', 'hint', 'coach', 'submitNote', 'reportSheet', 'listScroll', 'scrollY', 'sheetScroll', 'sheet', 'stale', 'banner', 'hostBand',
  'nextAvailable', 'sharedCanvas', 'adState', 'clueSwapLeft', 'late', 'phase', 'canConfirm', 'needle', 'offlineTag', 'stub', 'hist', 'chosen', 'features', 'aigcNote',
]);

function recorder(missing) {
  const wrap = (obj, where) =>
    new Proxy(obj, {
      get(t, k) {
        if (typeof k !== 'string' || k === 'then' || k === 'toJSON' || k === 'length') return t[k];
        if (!(k in t) && !Array.isArray(t)) missing.add(where + '.' + k);
        const v = t[k];
        return v && typeof v === 'object' && !Array.isArray(v) && k !== 'sharedCanvas' ? wrap(v, where + '.' + k) : v;
      },
    });
  return wrap;
}

async function rig(t, opts, mode) {
  const storage = { kd_state_v1: JSON.stringify({ v: 1, howtoSeen: true, coachSeen: false, display: mode || null }) };
  const h = await boot(t, Object.assign({ real: true, storage, build: ADS }, opts || {}));
  assert.equal(h.app.renderer.kind, 'real', 'the real renderers are loaded');
  const missing = new Set();
  const wrap = recorder(missing);
  const orig = h.ctl.view;
  h.ctl.view = (tt) => {
    const v = orig(tt);
    v.vm = wrap(v.vm, v.screen);
    return v;
  };
  h.missing = missing;
  h.drawn = new Set();
  h.problems = [];
  return h;
}

/** one frame: ids are routed, text is clean, no stub fallback */
function check(h, label) {
  h.log.text.length = 0;
  h.app.invalidate();
  h.frame();
  const ids = h.app.hits.map((x) => x.id);
  const screen = h.screen();
  for (const id of ids) {
    h.drawn.add(id);
    if (!SWALLOW.test(id) && !h.ctl.K.hasHandler(id)) h.problems.push(label + ': hit id not handled by logic: ' + id);
    if (!SWALLOW.test(id) && !listed(id)) h.problems.push(label + ': hit id not listed in CONTRACT.md: ' + id);
  }
  for (const line of h.log.text) if (/undefined|NaN|\bnull\b/.test(line)) h.problems.push(label + ': bad text "' + line + '"');
  const fb = require('../js/renderers').fallbackErrors;
  assert.deepEqual(fb, [], label + ': the real renderer fell back to the stub');
  return { ids, screen };
}


function listed(id) {
  const base = id.replace(/^(create:spectrum:|create:clue:|archive:item:|board:round:)[^`]+$/, '$1<x>');
  const norm = base.replace(/<x>$/, '');
  if (CONTRACT.includes('`' + id + '`')) return true;
  if (/^(create:spectrum:|create:clue:|archive:item:|board:round:)/.test(id)) return CONTRACT.includes('`' + norm + '<');
  return false;
}

/** pages that scroll (large text, result, create...) only return the hit areas on screen: drag the page until the id shows up */
async function scrollTo(h, id) {
  for (let i = 0; i < 40 && !h.has(id); i++) {
    const keys = Object.keys(h.app.hits.scrollMax || {}).filter((k) => !/^(sheet:list|board:list|round:list)$/.test(k) || k === 'sheet:list');
    if (!keys.length) return;
    const k = keys[0];
    const before = h.st.scrollY + h.st.sheetScroll;
    h.ctl.K.onDrag(k, -120);
    if (h.st.scrollY + h.st.sheetScroll === before) return;
  }
}


module.exports = { rig, check, scrollTo, OPTIONAL, SWALLOW, listed };
