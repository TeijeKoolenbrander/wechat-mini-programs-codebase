'use strict';
// Draws every screen / sheet / state of render/samples.js (plus stress extras) at 320x568, 375x667, 375x812, 414x896, 430x932
// and 768x1024 in standard, large-text, high-contrast and both, and checks: it draws; every hit id is in CONTRACT.md and
// every contract id is produced somewhere; tap targets >= 48; nothing tappable or written in the capsule; no overlaps;
// text sizes (16 / 20); text inside the window; primary actions in the bottom 40%; scrollMax for scroll ids.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { eachFixture, SIZES, MODES } = require('./render-mock');
const { SAMPLES } = require('../js/render/samples.js');

const CONTRACT = fs.readFileSync(path.join(__dirname, '..', 'js', 'render', 'CONTRACT.md'), 'utf8');

/** contract section name -> list of hit-id patterns */
function contractIds() {
  const out = {};
  const parts = CONTRACT.split(/^## /m).slice(1);
  for (const p of parts) {
    const name = p.split(/[\s(]/)[0];
    const ids = [];
    for (const line of p.split('\n')) {
      if (!/^Hit ids?|^\*\*Hit ids|Hit ids:/.test(line) && !/^\|/.test(line) && !/^`draw:|Hit ids/.test(line)) continue;
      const m = line.match(/`[A-Za-z]+:[A-Za-z:<>0-9|-]+`/g) || [];
      m.forEach((t) => ids.push(t.slice(1, -1)));
    }
    out[name] = ids;
  }
  return out;
}
const CIDS = contractIds();
const toRe = (id) => new RegExp('^' + id.replace(/<[^>]+>/g, '[A-Za-z0-9]+') + '$');
// generic ids the contract names in its conventions or shared sections
const GENERIC = ['sheet:close', 'sheet:body', 'sheet:scrim', 'sheet:list', 'coach:next', 'coach:block', 'dialog:block', 'dialog:block:card', 'adstub:block', 'draw:block', 'describe:block', 'pick:block'];
// ids the renderers add beyond the contract (scroll regions, proposed in the report)
const ADDED = ['home:scroll', 'pick:scroll', 'lobby:scroll', 'roomEntry:scroll', 'sent:scroll', 'entry:scroll', 'teaser:scroll', 'group:scroll', 'album:scroll', 'mine:scroll', 'overview:scroll', 'sheet:list'];

const LAYER = (id) => /:(canvas|scroll|block|card|scrim|list)$|^sheet:(body|scrim|list)$|^coach:next$|^stepthrough:skip$/.test(id) || id === 'sheet:close';
const FULL = (h, L) => h.w >= L.W - 1 && h.h >= L.H - 1;

function overlap(a, b) {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 1 && h > 1 ? w * h : 0;
}

const ELLIPSIS_OK = ['正在交出…', '时间到，正在交出…', '传递中…', '正在进入…', '马上开始…', '加入中…', '准备中…', '正在抽题…', '网络不好，正在重连…', '正在揭晓…', '准备画布…', '正在传出…', '审核中…', '展开接龙…', '正在展开…', '正在加载…', '正在确认群聊…', '请求中…', '广告加载中…', '播放中…', '正在删除…', '提交中…', '接龙中…', '正在取今日起点…'];
const seen = new Set();
const problems = [];
let drawn = 0;

eachFixture(({ f, L, sz, mode, hits, calls, topCalls }) => {
  drawn++;
  const tag = `${f.screen}/${f.state} ${sz.name} ${mode}`;
  const cap = L.capsule;
  const raw = hits.raw || hits;
  const screenKey = f.screen;
  // ---- ids
  const allowed = (CIDS[screenKey] || []).map(toRe);
  const allowedAll = [].concat(...Object.values(CIDS)).map(toRe);
  for (const h of hits) {
    seen.add(h.id);
    if (GENERIC.includes(h.id) || ADDED.includes(h.id)) continue;
    // a sheet drawn through home (home:... + sheet ids) is covered by its own list; accept any contract id here
    if (!allowed.some((re) => re.test(h.id)) && !allowedAll.some((re) => re.test(h.id))) problems.push(`${tag}: hit id ${h.id} is not in CONTRACT.md`);
  }
  // ---- size: tap targets >= 48 (checked on the unclipped areas)
  for (const h of raw) {
    if (LAYER(h.id) || FULL(h, L) || /^(draw|describe|pick):(block)/.test(h.id)) continue;
    if (h.w < 47.5 || h.h < 47.5) problems.push(`${tag}: ${h.id} is ${h.w.toFixed(1)}x${h.h.toFixed(1)} (< 48)`);
  }
  // ---- capsule
  for (const h of hits) {
    if (FULL(h, L)) continue;
    if (overlap(h, cap) > 0) problems.push(`${tag}: ${h.id} overlaps the capsule`);
  }
  for (const c of calls) {
    if (!c.visible) continue;
    const tb = { x: c.left, y: c.y - c.size / 2, w: c.right - c.left, h: c.size };
    if (overlap(tb, cap) > 0) problems.push(`${tag}: text "${c.s}" is in the capsule`);
  }
  // ---- overlaps between tappable areas
  const tap = hits.filter((h) => !LAYER(h.id) && !FULL(h, L));
  for (let i = 0; i < tap.length; i++) {
    for (let j = i + 1; j < tap.length; j++) {
      if (overlap(tap[i], tap[j]) > 4) problems.push(`${tag}: ${tap[i].id} overlaps ${tap[j].id}`);
    }
  }
  // ---- inside the window, below the capsule row (the back button may sit level with the capsule)
  for (const h of hits) {
    if (h.x < -0.5 || h.y < -0.5 || h.x + h.w > L.W + 0.5 || h.y + h.h > L.H + 0.5) problems.push(`${tag}: ${h.id} leaves the window`);
  }
  // ---- text
  const minSize = MODES[mode].largeText ? 20 : 16;
  for (const c of calls) {
    if (!c.visible || !c.s.trim()) continue;
    if (c.size < minSize - 0.6) problems.push(`${tag}: text "${c.s}" is ${c.size.toFixed(1)}pt (< ${minSize})`);
    if (c.left < -1 || c.right > L.W + 1) problems.push(`${tag}: text "${c.s}" leaves the window (${c.left.toFixed(0)}..${c.right.toFixed(0)})`);
  }
  // ---- text stays above the bottom safe area and never overlaps other text of the same screen
  for (const c of topCalls) {
    if (!c.visible || !c.s.trim()) continue;
    if (c.y + c.size * 0.35 > L.bottomEdge + 1 && !/ad|stub/.test(f.screen)) problems.push(`${tag}: text "${c.s}" is in the bottom safe area`);
  }
  const vis = topCalls.filter((c) => c.visible && c.s.trim());
  for (let i = 0; i < vis.length; i++) {
    for (let j = i + 1; j < vis.length; j++) {
      const a = vis[i];
      const b = vis[j];
      const ov = overlap({ x: a.left, y: a.y - a.size * 0.4, w: a.right - a.left, h: a.size * 0.8 }, { x: b.left, y: b.y - b.size * 0.4, w: b.right - b.left, h: b.size * 0.8 });
      if (ov > 6) problems.push(`${tag}: text "${a.s}" overlaps "${b.s}"`);
    }
  }
  // ---- no clipped text: an ellipsis is only fine on the words that really end with one
  const full = JSON.stringify(f.vm);
  for (const c of calls) {
    if (!c.visible || !c.s.endsWith('…') || ELLIPSIS_OK.includes(c.s) || full.includes(c.s)) continue;
    problems.push(`${tag}: text "${c.s}" was truncated`);
  }
  // ---- primary actions in the bottom 40%
  for (const id of ['home:primary', 'pick:start', 'draw:submit', 'describe:submit', 'entry:claim', 'group:newRoom', 'lobby:start', 'roomEntry:join', 'overview:rematch', 'sent:share']) {
    const h = hits.find((x) => x.id === id);
    if (h && !(f.vm.keyboardH > 0) && h.y + h.h / 2 < L.H * 0.6) problems.push(`${tag}: ${id} is above the bottom 40% (y=${h.y.toFixed(0)})`);
  }
  // ---- scroll ids expose scrollMax
  for (const h of hits) if (/:scroll$|^sheet:list$/.test(h.id) && !(h.id in (hits.scrollMax || {}))) problems.push(`${tag}: ${h.id} has no scrollMax`);
});

test('every screen, sheet and state draws in every size and mode', () => {
  const expected = Object.keys(SAMPLES).reduce((a, k) => a + SAMPLES[k].length, 0) - SAMPLES.shareCard.length;
  assert.ok(drawn >= expected * SIZES.length * 4, `drew ${drawn}, expected at least ${expected * SIZES.length * 4}`);
});

test('hit ids: all within CONTRACT.md, tap targets >= 48, nothing in the capsule, no overlaps, text sizes and bounds', () => {
  const uniq = [...new Set(problems)];
  assert.equal(uniq.length, 0, uniq.slice(0, 40).join('\n') + (uniq.length > 40 ? `\n... ${uniq.length - 40} more` : ''));
});

test('every hit id the contract lists is produced by some state (no dead ids)', () => {
  const missing = [];
  for (const [screen, ids] of Object.entries(CIDS)) {
    if (!SAMPLES[screen]) continue;
    for (const id of ids) {
      const re = toRe(id);
      if (![...seen].some((s) => re.test(s))) missing.push(`${screen}: ${id}`);
    }
  }
  assert.deepEqual(missing, []);
});

test('contract: every screen module exports draw(ctx, vm, layout)', () => {
  const R = require('../js/render');
  for (const name of Object.keys(SAMPLES)) {
    if (name === 'shareCard') continue;
    assert.equal(typeof R.screens[name].draw, 'function', name);
  }
  assert.equal(typeof R.shareCard.render, 'function');
});
