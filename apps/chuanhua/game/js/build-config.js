/**
 * Build-time switches (one place). `node tools/release-config.js --env <id> [--shared-test-env]` flips them for a release
 * and `--dev` flips them back; never commit the release state (RELEASE.md).
 *  - cloudEnv: the WeChat cloud environment id. EMPTY by default -> the in-memory mock server (js/mock-server.js) is used, so
 *    the game runs without a backend. The shared test AppID's cloud environment is shared across apps: set the id HERE and
 *    nowhere else. Every collection the backend touches is prefixed with the app slug (chuanhua_chains, ...), see
 *    cloudfunctions/CONTRACT.md.
 *  - fnPrefix (TD-35): every function is deployed as `chuanhua_<name>` when the environment is the shared test env; js/api.js
 *    resolves `fnPrefix + name` through ONE table, so nothing else knows the prefix.
 *  - stubAds: the "广告位（测试）" ads. `!cloudEnv`: a cloud build never shows them (js/app.js also forces it off).
 *  - envKind: derived, 'prod' whenever cloudEnv is set. A prod build never constructs the mock server (PO-14).
 *  - adUnits: empty ad units -> ads behave as no-fill.
 *  - subscribeTmplId: one-time template id (Handoff H7); the remote app_config value wins when present.
 *  - mockMediaDelaySec: how long the in-memory mock takes to "moderate" a drawing (dev only; the mock ticks itself).
 */

const FN_PREFIX = 'chuanhua_';

/** '' unless the cloud env is the shared test env (CTO rule, TD-35) */
function resolveFnPrefix(cloudEnv, sharedTestEnv) {
  return cloudEnv && sharedTestEnv && cloudEnv === sharedTestEnv ? FN_PREFIX : '';
}

// The next three lines are rewritten by tools/release-config.js (each must stay one `const NAME = ...;` line).
const cloudEnv = '';
const fnPrefix = cloudEnv ? 'chuanhua_' : '';
const stubAds = !cloudEnv;

// derived, never set by hand (QA-2)
const envKind = cloudEnv ? 'prod' : 'dev';
const sharedTestEnv = fnPrefix ? cloudEnv : '';

module.exports = {
  cloudEnv,
  sharedTestEnv,
  fnPrefix,
  resolveFnPrefix,
  FN_PREFIX,
  envKind,
  adUnits: { rewarded: '', interstitial: '', banner: '' },
  stubAds,
  subscribeTmplId: '',
  mockMediaDelaySec: 4,
  appVersion: '1.0.0',
};
