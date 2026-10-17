#!/usr/bin/env node
'use strict';
/**
 * Release switch (studio standard, TD-64 / TD-61). Rewrites the two files that make a build a release build, and
 * nothing else:
 *   js/build-config.js     cloudEnv, fnPrefix, stubAds (adUnits are founder-supplied and never touched)
 *   project.config.json    packOptions.ignore entries for every dev-only file AND the server-only content files (release only; the dev state ignores neither so the mock boots in DevTools); cloudfunctionRoot is set in both modes
 *
 *   node tools/release-config.js --env <envId> [--shared-test-env]   release: cloudEnv=<envId>, stubAds=false,
 *                                        fnPrefix 'kedupan_' with --shared-test-env (shared test environment) else ''
 *                                        --appid <wx + 16 hex> writes the real AppID into project.config.json (else the
 *                                        shared test AppID stays and a warning is printed)
 *   node tools/release-config.js --dev                                 back to the committed dev state
 *   node tools/release-config.js --status                              print the current mode
 *
 * Never commit the release state: the committed tree is the dev state (cloudEnv ''). The tests are mode-aware
 * (tests/mode.js) and `npm test` is green in both states. Idempotent; running it twice changes nothing.
 */
const fs = require('node:fs');
const path = require('node:path');

const GAME = path.join(__dirname, '..');
const FN_PREFIX = 'kedupan_';
/** files that exist only for development; a release package must not contain them (each is also lazily required) */
const DEV_ONLY_FILES = ['js/mock-server.js', 'js/stub-render.js'];
/** the shared test AppID: the committed (dev) value, restored by --dev */
const TEST_APPID = 'wxcd03c1b62d7eb0e0';
/**
 * server-only content (TD-62): the answer key and the 365-day schedule. Ignored in RELEASE mode only: the dev state
 * must keep them in the project so the mock server boots in WeChat DevTools (the simulator honours packOptions.ignore).
 * The release gate (tests/release-gate-pack.test.js) proves a release package carries neither.
 */
const SERVER_ONLY_FILES = ['core/content/anchors.v1.js', 'core/content/schedule.v1.js'];
/** always ignored, in both modes */
const BASE_IGNORE = [{ value: 'cloudfunctions-deploy', type: 'folder' }];

/** the draft marker / placeholders still in the generated terms module under `game` (empty = final) */
function termsProblems(game) {
  const f = path.join(game, 'js', 'terms-text.js');
  if (!fs.existsSync(f)) return ['js/terms-text.js is missing: run node tools/build-terms.js'];
  const m = { exports: {} };
  new Function('module', 'exports', fs.readFileSync(f, 'utf8'))(m, m.exports);
  return require('./build-terms').releaseProblems(m.exports);
}

/** build-config.js is an object literal: one `  name: value,` property per line */
function setLine(src, name, expr) {
  const re = new RegExp('^([ \\t]*)' + name + ': [^\\r\\n]*,(\\r?)$', 'm');
  if (!re.test(src)) throw new Error('build-config.js: property line "' + name + ': ...," not found');
  return src.replace(re, (all, indent, cr) => indent + name + ': ' + expr + ',' + cr);
}

/** edit both files under `game`; mode is { dev: true } or { env, sharedTestEnv } */
function apply(game, mode) {
  const bcPath = path.join(game, 'js', 'build-config.js');
  let bc = fs.readFileSync(bcPath, 'utf8');
  if (mode.dev) {
    bc = setLine(bc, 'cloudEnv', "''");
    bc = setLine(bc, 'fnPrefix', "''");
    bc = setLine(bc, 'stubAds', 'false');
  } else {
    if (!/^[A-Za-z0-9_-]+$/.test(mode.env || '')) throw new Error('--env needs an environment id (letters, digits, - and _)');
    if (mode.appid !== undefined && !/^wx[0-9a-f]{16}$/.test(mode.appid)) throw new Error('--appid must be wx followed by 16 lowercase hex characters');
    // the 用户协议 draft must not ship (D-2): a release build is refused while the draft marker or a 【…】 placeholder remains
    const problems = mode.allowDraftTerms ? [] : termsProblems(game);
    if (problems.length) throw new Error('release refused, the user agreement is not final:\n  ' + problems.join('\n  '));
    bc = setLine(bc, 'cloudEnv', "'" + mode.env + "'");
    bc = setLine(bc, 'fnPrefix', mode.sharedTestEnv ? "'" + FN_PREFIX + "'" : "''");
    bc = setLine(bc, 'stubAds', 'false');
  }
  fs.writeFileSync(bcPath, bc);

  const pcPath = path.join(game, 'project.config.json');
  const raw = fs.readFileSync(pcPath, 'utf8');
  const cfg = JSON.parse(raw);
  const managed = new Set(DEV_ONLY_FILES.concat(SERVER_ONLY_FILES, BASE_IGNORE.map((b) => b.value)));
  const keep = cfg.packOptions.ignore.filter((i) => !managed.has(i.value));
  cfg.packOptions.ignore = keep.concat(BASE_IGNORE, mode.dev ? [] : DEV_ONLY_FILES.concat(SERVER_ONLY_FILES).map((value) => ({ value, type: 'file' })));
  cfg.cloudfunctionRoot = 'cloudfunctions-deploy/';
  cfg.appid = mode.dev ? TEST_APPID : mode.appid || cfg.appid;
  const out = Object.assign({ appid: cfg.appid, compileType: cfg.compileType, cloudfunctionRoot: cfg.cloudfunctionRoot }, cfg);
  const eol = /\r\n/.test(raw) ? '\r\n' : '\n';
  fs.writeFileSync(pcPath, JSON.stringify(out, null, 2).replace(/\n/g, eol) + (/\n$/.test(raw) ? eol : ''));
}

function status(game) {
  const src = fs.readFileSync(path.join(game, 'js', 'build-config.js'), 'utf8');
  const m = /^[ \t]*cloudEnv: '(.*)',\r?$/m.exec(src);
  return m && m[1] ? 'release (cloudEnv ' + m[1] + ')' : 'dev';
}

module.exports = { apply, status, termsProblems, TEST_APPID, DEV_ONLY_FILES, SERVER_ONLY_FILES, FN_PREFIX };

if (require.main === module) {
  const a = process.argv.slice(2);
  const val = (f) => (a.indexOf(f) >= 0 ? a[a.indexOf(f) + 1] : undefined);
  try {
    if (a.includes('--status')) console.log(status(GAME));
    else if (a.includes('--dev')) { apply(GAME, { dev: true }); console.log('dev mode: cloudEnv empty, mock server + stub renderer shipped'); }
    else if (a.includes('--env')) {
      if (a.includes('--appid') && !val('--appid')) throw new Error('--appid needs a value');
      if (a.includes('--allow-draft-terms') && process.env.NODE_ENV !== 'test') throw new Error('--allow-draft-terms is test-only (NODE_ENV=test); a release build needs the final 用户协议. Refused.');
      apply(GAME, { env: val('--env'), sharedTestEnv: a.includes('--shared-test-env'), appid: val('--appid'), allowDraftTerms: a.includes('--allow-draft-terms') });
      console.log('release mode: ' + status(GAME) + '; ignoring ' + DEV_ONLY_FILES.join(', ') + '. Do NOT commit; run --dev to switch back.');
      if (!a.includes('--appid')) console.warn('WARNING: release build still uses the shared test AppID (' + TEST_APPID + '). Pass --appid <wx...> for the real one.');
    } else throw new Error('usage: release-config.js --env <envId> [--shared-test-env] [--appid <wx...>] | --dev | --status');
  } catch (e) { console.error(e.message); process.exit(1); }
}
