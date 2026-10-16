#!/usr/bin/env node
'use strict';
/**
 * Release switch (studio standard, as for kedupan, bibiyi). Rewrites the files that make a build a release build, and nothing else:
 *   js/build-config.js     cloudEnv, fnPrefix, stubAds, adUnits (rewarded + interstitial ids)
 *   project.config.json    appid (release only, with --appid), packOptions.ignore entries for every dev-only file
 *                          (cloudfunctionRoot is set in both modes)
 *
 *   node tools/release-config.js --env <envId> [--appid <wx + 16 hex>] [--ad-rewarded <adunit-...>] [--ad-interstitial <adunit-...>]
 *       release: cloudEnv=<envId>, stubAds=false, fnPrefix 'dianjiangtai_' ALWAYS: `npm run pack` (alias `stage`) is the one supported deploy route and it
 *       names every function dianjiangtai_<name>. --prefixed-functions is accepted and says so explicitly; --shared-test-env is a deprecated
 *       alias of it (the old name suggested the prefix was optional; it is not).
 *       --appid writes the real AppID into project.config.json (else the shared test AppID stays and a warning is printed).
 *       --ad-rewarded / --ad-interstitial write the 流量主 unit ids into adUnits (else they stay empty and ads fail gracefully).
 *       The banner id is NOT here: it comes from app_config/live.ads.banner.adUnitId (server side).
 *   node tools/release-config.js --dev       back to the committed dev state (test AppID, empty cloudEnv and adUnits)
 *   node tools/release-config.js --status    print the current mode
 *
 * Never commit the release state: the committed tree is the dev state (cloudEnv ''). The tests are mode-aware
 * (tests/mode.js) and `npm test` is green in both states. Idempotent; running it twice changes nothing.
 */
const fs = require('node:fs');
const path = require('node:path');

const GAME = path.join(__dirname, '..');
const FN_PREFIX = 'dianjiangtai_';
/** the shared test AppID: the committed (dev) value, restored by --dev */
const TEST_APPID = 'wxcd03c1b62d7eb0e0';
/** files that exist only for development; a release package must not contain them (each is also lazily required) */
const DEV_ONLY_FILES = ['js/mock-server.js', 'js/stub-render.js'];
/** always ignored, in both modes */
const BASE_IGNORE = [{ value: 'cloudfunctions-deploy', type: 'folder' }, { value: 'RELEASE.md', type: 'file' }];
const AD_RE = /^adunit-[A-Za-z0-9]{8,}$/;

function setLine(src, name, expr) {
  const re = new RegExp('^const ' + name + ' = .*;$', 'm');
  if (!re.test(src)) throw new Error('build-config.js: line "const ' + name + ' = ...;" not found');
  return src.replace(re, () => 'const ' + name + ' = ' + expr + ';');
}

/** adUnits is an object-literal property line: `  adUnits: { rewarded: '', interstitial: '' },` */
function setAdUnits(src, rewarded, interstitial) {
  const re = /^([ \t]*)adUnits: \{[^\r\n]*\},(\r?)$/m;
  if (!re.test(src)) throw new Error('build-config.js: property line "adUnits: { ... }," not found');
  return src.replace(re, (all, indent, cr) => indent + "adUnits: { rewarded: '" + rewarded + "', interstitial: '" + interstitial + "' }," + cr);
}

/** edit the files under `game`; mode is { dev: true } or { env, appid, adRewarded, adInterstitial } (release functions are always dianjiangtai_-prefixed) */
function apply(game, mode) {
  const bcPath = path.join(game, 'js', 'build-config.js');
  let bc = fs.readFileSync(bcPath, 'utf8');
  if (mode.dev) {
    bc = setLine(bc, 'cloudEnv', "''");
    bc = setLine(bc, 'fnPrefix', "cloudEnv ? '" + FN_PREFIX + "' : ''");
    bc = setLine(bc, 'stubAds', 'true');
    bc = setAdUnits(bc, '', '');
  } else {
    if (!/^[A-Za-z0-9_-]+$/.test(mode.env || '')) throw new Error('--env needs an environment id (letters, digits, - and _)');
    if (mode.appid !== undefined && !/^wx[0-9a-f]{16}$/.test(mode.appid)) throw new Error('--appid must be wx followed by 16 lowercase hex characters');
    if (mode.adRewarded !== undefined && !AD_RE.test(mode.adRewarded)) throw new Error('--ad-rewarded must look like adunit-<letters/digits>');
    if (mode.adInterstitial !== undefined && !AD_RE.test(mode.adInterstitial)) throw new Error('--ad-interstitial must look like adunit-<letters/digits>');
    bc = setLine(bc, 'cloudEnv', "'" + mode.env + "'");
    bc = setLine(bc, 'fnPrefix', "'" + FN_PREFIX + "'");
    bc = setLine(bc, 'stubAds', 'false');
    bc = setAdUnits(bc, mode.adRewarded || '', mode.adInterstitial || '');
  }
  if (bc !== fs.readFileSync(bcPath, 'utf8')) fs.writeFileSync(bcPath, bc);

  const pcPath = path.join(game, 'project.config.json');
  const raw = fs.readFileSync(pcPath, 'utf8');
  const cfg = JSON.parse(raw);
  const managed = new Set(DEV_ONLY_FILES.concat(BASE_IGNORE.map((b) => b.value)));
  const keep = cfg.packOptions.ignore.filter((i) => !managed.has(i.value));
  cfg.packOptions.ignore = keep.concat(BASE_IGNORE, mode.dev ? [] : DEV_ONLY_FILES.map((value) => ({ value, type: 'file' })));
  cfg.cloudfunctionRoot = 'cloudfunctions-deploy/';
  cfg.appid = mode.dev ? TEST_APPID : mode.appid || cfg.appid;
  const out = Object.assign({ appid: cfg.appid, compileType: cfg.compileType, cloudfunctionRoot: cfg.cloudfunctionRoot }, cfg);
  // byte-exact round trip (B-11): keep the file's own line ending (a Windows checkout with core.autocrlf is CRLF, the repository blob
  // LF) and its trailing newline, and do not touch the file at all when nothing changes
  const eol = raw.indexOf('\r\n') >= 0 ? '\r\n' : '\n';
  const text = JSON.stringify(out, null, 2).replace(/\n/g, eol) + (/\n$/.test(raw) ? eol : '');
  if (text !== raw) fs.writeFileSync(pcPath, text);
}

function status(game) {
  const src = fs.readFileSync(path.join(game, 'js', 'build-config.js'), 'utf8');
  const m = /^const cloudEnv = '(.*)';$/m.exec(src);
  return m && m[1] ? 'release (cloudEnv ' + m[1] + ')' : 'dev';
}

module.exports = { apply, status, TEST_APPID, DEV_ONLY_FILES, FN_PREFIX };

if (require.main === module) {
  const a = process.argv.slice(2);
  const val = (f) => (a.indexOf(f) >= 0 ? a[a.indexOf(f) + 1] : undefined);
  try {
    if (a.includes('--status')) console.log(status(GAME));
    else if (a.includes('--dev')) { apply(GAME, { dev: true }); console.log('dev mode: cloudEnv empty, test AppID, mock server + stub renderer shipped'); }
    else if (a.includes('--env')) {
      ['--env', '--appid', '--ad-rewarded', '--ad-interstitial'].forEach((f) => {
        if (a.includes(f) && (!val(f) || val(f).startsWith('--'))) throw new Error(f + ' needs a value');
      });
      apply(GAME, { env: val('--env'), appid: val('--appid'), adRewarded: val('--ad-rewarded'), adInterstitial: val('--ad-interstitial') });
      console.log('release mode: ' + status(GAME) + '; fnPrefix ' + FN_PREFIX + '; ignoring ' + DEV_ONLY_FILES.join(', ') + '. Do NOT commit; run --dev to switch back.');
      if (!a.includes('--appid')) console.warn('WARNING: release build still uses the shared test AppID (' + TEST_APPID + '). Pass --appid <wx...> for the real one.');
      if (!a.includes('--ad-rewarded') || !a.includes('--ad-interstitial')) console.warn('NOTE: adUnits not fully set (rewarded/interstitial stay empty and fail gracefully). Pass --ad-rewarded / --ad-interstitial <adunit-...>. The banner id is server side (app_config).');
    } else throw new Error('usage: release-config.js --env <envId> [--appid <wx...>] [--ad-rewarded <id>] [--ad-interstitial <id>] [--prefixed-functions] | --dev | --status');
  } catch (e) { console.error(e.message); process.exit(1); }
}
