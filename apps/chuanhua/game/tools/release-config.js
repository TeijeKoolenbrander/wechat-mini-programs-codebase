#!/usr/bin/env node
'use strict';
/**
 * Release switch (studio standard). Rewrites the files that make a build a release build, and nothing else:
 *   js/build-config.js     cloudEnv, fnPrefix, stubAds, adUnits.rewarded + adUnits.interstitial (banner is left alone)
 *   project.config.json    appid (release only, with --appid), packOptions.ignore entries for every dev-only file
 *
 *   node tools/release-config.js --env <envId> [--appid <wx + 16 hex>] [--ad-rewarded <adunit-...>] [--ad-interstitial <adunit-...>] [--prefixed-functions]
 *       release: cloudEnv=<envId>, stubAds=false, fnPrefix 'chuanhua_' ALWAYS: `npm run pack` names every function chuanhua_<name>.
 *       --prefixed-functions is accepted and says so explicitly; --shared-test-env is a deprecated alias (the old name suggested the
 *       prefix was optional; it is not).
 *       --appid writes the real AppID into project.config.json (else the shared test AppID stays and a warning is printed).
 *       --ad-rewarded / --ad-interstitial write the 流量主 unit ids into adUnits (else they stay empty and ads fail gracefully).
 *   node tools/release-config.js --dev       back to the committed dev state (test AppID, empty ad units)
 *   node tools/release-config.js --status    print the current mode
 *
 * Release mode is REFUSED while js/terms-text.js still carries the 【草稿…】 marker or a 【…】 placeholder (QA-7); finish
 * docs/chuanhua/release/user-agreement.txt and run `node tools/build-terms.js --release` first.
 * Never commit the release state: the committed tree is the dev state (cloudEnv ''). The tests are mode-aware
 * (tests/mode.js) and `npm test` is green in both states. Idempotent.
 */
const fs = require('node:fs');
const path = require('node:path');

const GAME = path.join(__dirname, '..');
const FN_PREFIX = 'chuanhua_';
/** the shared test AppID: the committed (dev) value, restored by --dev */
const TEST_APPID = 'wxcd03c1b62d7eb0e0';
const AD_RE = /^adunit-[A-Za-z0-9]{4,}$/;
/** files that exist only for development; a release package must not contain them (each is also lazily required) */
const DEV_ONLY_FILES = ['js/mock-server.js', 'js/stub-render.js'];
/**
 * The prompt bank is SERVER-ONLY (CTO ruling, TD-103): rolls happen in the cloud functions, which return just the 3 rolled texts. The bank
 * (v2 is about 124 KB) must not ship in the client or be scrapeable from the package. The dev mock server loads it through core/prompts.js,
 * so in a dev build these ship (DevTools has no backend) and in a release build they are ignored together with the mock.
 */
const SERVER_ONLY_FILES = ['core/prompts.js', 'core/content/prompts.v1.js', 'core/content/prompts.v2.js'];

function setLine(src, name, expr) {
  const re = new RegExp('^const ' + name + ' = .*;$', 'm');
  if (!re.test(src)) throw new Error('build-config.js: line "const ' + name + ' = ...;" not found');
  return src.replace(re, () => 'const ' + name + ' = ' + expr + ';');
}

/** adUnits is one property line: `  adUnits: { rewarded: '', interstitial: '', banner: '' },`; only rewarded and interstitial are managed */
function setAdUnits(src, rewarded, interstitial) {
  const re = /^([ \t]*adUnits: \{ rewarded: ')[^']*(', interstitial: ')[^']*('.*\},\r?)$/m;
  if (!re.test(src)) throw new Error("build-config.js: property line \"adUnits: { rewarded: '...', interstitial: '...', ... },\" not found");
  return src.replace(re, (all, a, b, c) => a + rewarded + b + interstitial + c);
}

/** the draft marker / placeholders still in the generated terms module under `game` (empty = final) */
function termsProblems(game) {
  const f = path.join(game, 'js', 'terms-text.js');
  if (!fs.existsSync(f)) return ['js/terms-text.js is missing: run node tools/build-terms.js'];
  const m = { exports: {} };
  new Function('module', 'exports', fs.readFileSync(f, 'utf8'))(m, m.exports);
  return require('./build-terms').releaseProblems(m.exports);
}

/** edit the files under `game`; mode is { dev: true } or { env, appid, adRewarded, adInterstitial } (release functions are always chuanhua_-prefixed) */
function apply(game, mode) {
  const bcPath = path.join(game, 'js', 'build-config.js');
  let bc = fs.readFileSync(bcPath, 'utf8');
  if (mode.dev) {
    bc = setLine(bc, 'cloudEnv', "''");
    bc = setLine(bc, 'fnPrefix', "cloudEnv ? '" + FN_PREFIX + "' : ''");
    bc = setLine(bc, 'stubAds', '!cloudEnv');
    bc = setAdUnits(bc, '', '');
  } else {
    if (!/^[A-Za-z0-9_-]+$/.test(mode.env || '')) throw new Error('--env needs an environment id (letters, digits, - and _)');
    if (mode.appid !== undefined && !/^wx[0-9a-f]{16}$/.test(mode.appid)) throw new Error('--appid must be wx followed by 16 lowercase hex characters');
    if (mode.adRewarded !== undefined && !AD_RE.test(mode.adRewarded)) throw new Error('--ad-rewarded must look like adunit-<letters/digits>');
    if (mode.adInterstitial !== undefined && !AD_RE.test(mode.adInterstitial)) throw new Error('--ad-interstitial must look like adunit-<letters/digits>');
    const problems = termsProblems(game);
    if (problems.length) throw new Error('release refused, the user agreement is not final (QA-7):\n  ' + problems.join('\n  '));
    bc = setLine(bc, 'cloudEnv', "'" + mode.env + "'");
    bc = setLine(bc, 'fnPrefix', "'" + FN_PREFIX + "'");
    bc = setLine(bc, 'stubAds', 'false');
    bc = setAdUnits(bc, mode.adRewarded || '', mode.adInterstitial || '');
  }
  if (bc !== fs.readFileSync(bcPath, 'utf8')) fs.writeFileSync(bcPath, bc);

  const pcPath = path.join(game, 'project.config.json');
  const raw = fs.readFileSync(pcPath, 'utf8');
  const cfg = JSON.parse(raw);
  const IGNORED_IN_RELEASE = DEV_ONLY_FILES.concat(SERVER_ONLY_FILES);
  const managed = new Set(IGNORED_IN_RELEASE);
  cfg.packOptions.ignore = cfg.packOptions.ignore.filter((i) => !managed.has(i.value)).concat(mode.dev ? [] : IGNORED_IN_RELEASE.map((value) => ({ value, type: 'file' })));
  cfg.appid = mode.dev ? TEST_APPID : mode.appid || cfg.appid;
  // byte-exact round trip: keep the file's own line ending and trailing newline, and do not touch the file when nothing changes
  const eol = raw.indexOf('\r\n') >= 0 ? '\r\n' : '\n';
  const text = JSON.stringify(cfg, null, 2).replace(/\n/g, eol) + (/\n$/.test(raw) ? eol : '');
  if (text !== raw) fs.writeFileSync(pcPath, text);
}

function status(game) {
  const src = fs.readFileSync(path.join(game, 'js', 'build-config.js'), 'utf8');
  const m = /^const cloudEnv = '(.*)';$/m.exec(src);
  return m && m[1] ? 'release (cloudEnv ' + m[1] + ')' : 'dev';
}

module.exports = { apply, status, termsProblems, TEST_APPID, DEV_ONLY_FILES, SERVER_ONLY_FILES, FN_PREFIX };

if (require.main === module) {
  const a = process.argv.slice(2);
  const val = (f) => (a.indexOf(f) >= 0 ? a[a.indexOf(f) + 1] : undefined);
  try {
    if (a.includes('--status')) console.log(status(GAME));
    else if (a.includes('--dev')) { apply(GAME, { dev: true }); console.log('dev mode: cloudEnv empty, test AppID, mock + stub renderer shipped, stub ads on'); }
    else if (a.includes('--env')) {
      ['--env', '--appid', '--ad-rewarded', '--ad-interstitial'].forEach((f) => {
        if (a.includes(f) && (!val(f) || val(f).startsWith('--'))) throw new Error(f + ' needs a value');
      });
      apply(GAME, { env: val('--env'), appid: val('--appid'), adRewarded: val('--ad-rewarded'), adInterstitial: val('--ad-interstitial') });
      console.log('release mode: ' + status(GAME) + '; fnPrefix ' + FN_PREFIX + '; ignoring ' + DEV_ONLY_FILES.concat(SERVER_ONLY_FILES).join(', ') + '. Do NOT commit; run --dev to switch back.');
      if (a.includes('--shared-test-env')) console.warn('NOTE: --shared-test-env is a deprecated alias of --prefixed-functions; release is always ' + FN_PREFIX + '-prefixed.');
      if (!a.includes('--appid')) console.warn('WARNING: release build still uses the shared test AppID (' + TEST_APPID + '). Pass --appid <wx...> for the real one.');
      if (!a.includes('--ad-rewarded') || !a.includes('--ad-interstitial')) console.warn('NOTE: adUnits not fully set (rewarded/interstitial stay empty and fail gracefully). Pass --ad-rewarded / --ad-interstitial <adunit-...>.');
    } else throw new Error('usage: release-config.js --env <envId> [--appid <wx...>] [--ad-rewarded <id>] [--ad-interstitial <id>] [--prefixed-functions] | --dev | --status');
  } catch (e) { console.error(e.message); process.exit(1); }
}
