#!/usr/bin/env node
'use strict';
/**
 * 软著 source-code excerpt generator for 群友刻度盘 (kedupan).
 *
 *   node docs/kedupan/release/softcopyright/tools/gen-source-excerpt.js [--out <file>] [--stats]
 *
 * Reads the real source under apps/kedupan/ (read-only), concatenates it in a fixed, sensible order
 * (entry -> core logic -> client -> render -> open data domain -> cloud functions), drops blank lines,
 * expands tabs, wraps lines longer than 100 columns, and prints the usual 软著 excerpt:
 * the first 30 pages and the last 30 pages, 50 lines per page, with a header on every page
 * (software name + version on the left, page number on the right). Pages are numbered 1..60.
 * If the code has fewer than 3,000 lines, the whole code is printed.
 *
 * Excluded on purpose: tests, tools, preview renders, node_modules, deploy output, per-function copies of
 * core/ and common/ (duplicates), and the content data files (core/content/*.js are 4,000+ item text rows, not logic).
 * Output is UTF-8 text, ready to paste into Word/WPS (monospace font, A4, header on each page) and export to PDF.
 * No secrets live in the source (a scan runs at the end and aborts if it finds a key-like string).
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..', '..', '..', '..');
const APP = path.join(ROOT, 'apps', 'kedupan');
const NAME = '群友刻度盘';
const VERSION = 'V1.0.0';
const LINES_PER_PAGE = 50;
const FIRST_PAGES = 30;
const LAST_PAGES = 30;
const WRAP = 100;

const args = process.argv.slice(2);
const outIdx = args.indexOf('--out');
const OUT = outIdx >= 0 ? args[outIdx + 1] : path.join(__dirname, '..', 'source-excerpt.txt');

const rel = (...p) => path.join(APP, ...p);
const list = (dir, re) => fs.readdirSync(dir).filter((f) => re.test(f)).sort().map((f) => path.join(dir, f));

/** fixed order; within a group alphabetical, except where an explicit list is given */
function sourceFiles() {
  const files = [];
  const add = (f) => { if (fs.existsSync(f) && !files.includes(f)) files.push(f); };
  // 1. entry
  add(rel('game', 'game.js'));
  // 2. core logic (pure, shared by client and cloud): config, time, scoring first
  ['config.js', 'date.js', 'rng.js', 'errors.js', 'score.js', 'windows.js', 'streak.js', 'group.js', 'rounds.js', 'ruler.js', 'input.js',
    'content.js', 'schedule.js', 'adpolicy.js', 'entry.js', 'events.js', 'present.js', 'service.js'].forEach((f) => add(rel('game', 'core', f)));
  list(rel('game', 'core'), /\.js$/).forEach(add);
  // 3. client
  ['build-config.js', 'util.js', 'store.js', 'api.js', 'functions.js', 'analytics.js', 'features.js', 'audio.js', 'share.js', 'privacy.js',
    'subscribe.js', 'ads.js', 'odc.js', 'vm.js', 'renderers.js', 'controller.js', 'main.js'].forEach((f) => add(rel('game', 'js', f)));
  list(rel('game', 'js', 'flows'), /\.js$/).forEach(add);
  // 4. render
  list(rel('game', 'js', 'render'), /\.js$/).forEach(add);
  // 5. open data domain
  ['sha256.js', 'match.js', 'peer.js', 'draw.js', 'index.js'].forEach((f) => add(rel('game', 'opendata', f)));
  // 6. cloud functions: shared helpers, then each function
  list(rel('cloudfunctions', 'common'), /\.js$/).forEach(add);
  fs.readdirSync(rel('cloudfunctions'), { withFileTypes: true })
    .filter((e) => e.isDirectory() && !['common', 'scripts', 'database', 'tests', 'node_modules'].includes(e.name))
    .map((e) => e.name).sort().forEach((n) => add(rel('cloudfunctions', n, 'index.js')));
  // excluded explicitly (content data, dev-only mock and stub)
  const skip = ['core/content/', 'mock-server.js', 'stub-render.js'];
  return files.filter((f) => !skip.some((s) => f.split(path.sep).join('/').includes(s)));
}

function wrap(line) {
  const out = [];
  let s = line;
  while (s.length > WRAP) { out.push(s.slice(0, WRAP)); s = '    ' + s.slice(WRAP); }
  out.push(s);
  return out;
}

function codeLines() {
  const all = [];
  const perFile = [];
  for (const f of sourceFiles()) {
    const text = fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n').replace(/\t/g, '  ');
    let n = 0;
    for (const raw of text.split('\n')) {
      const l = raw.replace(/\s+$/, '');
      if (!l.trim()) continue;
      wrap(l).forEach((x) => { all.push(x); n++; });
    }
    perFile.push([path.relative(APP, f).split(path.sep).join('/'), n]);
  }
  return { all, perFile };
}

function secretScan(lines) {
  const bad = lines.filter((l) => /(AppSecret\s*[:=]\s*['"][0-9a-f]{16,}|-----BEGIN [A-Z ]*PRIVATE KEY|wx[0-9a-f]{16}\b.*secret)/i.test(l));
  if (bad.length) { console.error('ABORT: key-like string found:', bad[0].slice(0, 60)); process.exit(2); }
}

function page(n, total, lines) {
  const head = NAME + ' ' + VERSION + ' 源程序';
  const right = '第 ' + n + ' 页 / 共 ' + total + ' 页';
  const pad = Math.max(1, WRAP - 14 - right.length - head.length * 2);
  return [head + ' '.repeat(pad) + right, '-'.repeat(WRAP)].concat(lines).join('\n');
}

const { all, perFile } = codeLines();
secretScan(all);
const per = LINES_PER_PAGE;
const totalPages = Math.ceil(all.length / per);
let pages;
if (totalPages <= FIRST_PAGES + LAST_PAGES) {
  pages = Array.from({ length: totalPages }, (_, i) => all.slice(i * per, (i + 1) * per));
} else {
  const first = Array.from({ length: FIRST_PAGES }, (_, i) => all.slice(i * per, (i + 1) * per));
  // the final 1,500 lines, so every printed page is full and the last page ends exactly at the end of the code
  const tail = all.slice(all.length - LAST_PAGES * per);
  const last = Array.from({ length: LAST_PAGES }, (_, i) => tail.slice(i * per, (i + 1) * per));
  pages = first.concat(last);
}
const body = pages.map((p, i) => page(i + 1, pages.length, p)).join('\n\f\n');
if (args.includes('--stats')) {
  console.log('files', perFile.length, 'lines (non-blank, wrapped)', all.length, 'full pages', totalPages, 'pages printed', pages.length);
  perFile.forEach(([f, n]) => console.log(String(n).padStart(6), f));
}
fs.writeFileSync(OUT, body + '\n', 'utf8');
console.log('wrote', path.relative(ROOT, OUT), '(' + pages.length + ' pages, ' + pages.reduce((a, p) => a + p.length, 0) + ' code lines)');
