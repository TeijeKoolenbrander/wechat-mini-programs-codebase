'use strict';
/**
/**
 * M2 / TD-62 release gate: a RELEASE package (packOptions.ignore as written by tools/release-config.js) must not
 * contain the answer key (anchors, the tags that reveal them) or the 365-day schedule. The two server-only files are
 * ignored in release mode ONLY: the committed dev state keeps them in the project so the mock server boots in WeChat
 * DevTools, and a dev-mode test asserts they are not ignored there. qa-release.test.js runs this file on a temp copy
 * switched to release.
 */
const test = require('node:test');
const { devOnly, releaseOnly } = require('./mode');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const GAME = path.join(__dirname, '..');
const SERVER_ONLY = ['core/content/anchors.v1.js', 'core/content/schedule.v1.js'];
const cfg = JSON.parse(fs.readFileSync(path.join(GAME, 'project.config.json'), 'utf8'));

function walk(d, rel, out) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const r = rel ? rel + '/' + e.name : e.name;
    if (r === 'project.private.config.json') continue; // DevTools-local, gitignored, never uploaded
    if (cfg.packOptions.ignore.some((i) => r === i.value || (i.type === 'folder' && r.startsWith(i.value + '/')))) continue;
    if (e.isDirectory()) walk(path.join(d, e.name), r, out);
    else out.push(r);
  }
  return out;
}
const packed = () => walk(GAME, '', []);

// data patterns, not the word: the core code legitimately says `anchor` as a variable name
const LEAKS = {
  'anchor value': /\banchor['"]?\s*:\s*\d/,
  'easy/split tag': /tags['"]?\s*:\s*\[\s*['"](easy|split|season:|festival:)/,
  'schedule header': /scheduleVersion['"]?\s*:\s*\d+\s*,\s*['"]?contentVersion['"]?\s*:\s*\d/,
  'two adjacent item ids (schedule day)': /['"]s\d{3}i\d{2}['"]\s*,\s*['"]s\d{3}i\d{2}['"]/,
};

test('the server-only files exist (the cloud functions are synced from them) and release-config manages exactly them', () => {
  for (const f of SERVER_ONLY) assert.ok(fs.existsSync(path.join(GAME, f)), f);
  assert.deepEqual(require('../tools/release-config').SERVER_ONLY_FILES, SERVER_ONLY);
});

test('DEV config: the server-only files are NOT ignored, so the mock server can load them in DevTools', devOnly, () => {
  const ignored = cfg.packOptions.ignore.map((i) => i.value);
  for (const f of SERVER_ONLY) assert.ok(!ignored.includes(f), f + ' must not be in packOptions.ignore in the dev state');
  const c = require('../core/content');
  assert.ok(c.getServerContent().hasAnchors, 'the mock can build the server content');
  assert.ok(require('../core/schedule').getSchedule(), 'and the schedule');
});

test('RELEASE config: both server-only files are in packOptions.ignore', releaseOnly, () => {
  const ignored = cfg.packOptions.ignore.map((i) => i.value);
  for (const f of SERVER_ONLY) assert.ok(ignored.includes(f), f + ' must be in packOptions.ignore');
});

test('RELEASE package: the packed files hold neither anchors, the easy/split tags nor schedule data', releaseOnly, () => {
  const files = packed();
  assert.ok(files.includes('core/content/spectra.v1.js') && files.includes('core/content.js'), 'the pack walk found the client library');
  const bad = [];
  for (const f of files.filter((x) => /\.(js|json)$/.test(x))) {
    const src = fs.readFileSync(path.join(GAME, f), 'utf8');
    for (const [name, re] of Object.entries(LEAKS)) if (re.test(src)) bad.push(f + ': ' + name);
  }
  assert.deepEqual(bad, []);
  for (const f of SERVER_ONLY) assert.ok(!files.includes(f), f);
});

test('the grep is not vacuous: it matches the server-only files', () => {
  const key = fs.readFileSync(path.join(GAME, SERVER_ONLY[0]), 'utf8');
  const sch = fs.readFileSync(path.join(GAME, SERVER_ONLY[1]), 'utf8');
  assert.ok(LEAKS['anchor value'].test(key) && LEAKS['easy/split tag'].test(key));
  assert.ok(LEAKS['schedule header'].test(sch) && LEAKS['two adjacent item ids (schedule day)'].test(sch));
});

test('the client content object has no anchor and no tags, and the client never needs the schedule', () => {
  const c = require('../core/content').getContent();
  assert.ok(c && !c.hasAnchors);
  const flat = JSON.stringify(c.spectra);
  assert.ok(!/"anchor"|"tags"/.test(flat));
});
