'use strict';
/** Which configuration the tree is in. Dev-mode assertions use `devOnly`, release-gate assertions use `releaseOnly`. */
const build = require('../js/build-config');
const RELEASE = !!build.cloudEnv;
/** the build the harness boots by default, independent of the config file, so gameplay tests run in both modes */
const DEV_BUILD = { cloudEnv: '', fnPrefix: '', stubAds: false, adUnits: { rewarded: '', interstitial: '' }, appVersion: build.appVersion };
const TEST_APPID = 'wxcd03c1b62d7eb0e0';
/** dev: exactly the shared test AppID; release: any valid wx + 16 hex (a warning, not a failure, while it is still the test AppID) */
function checkAppId(appid) {
  const assert = require('node:assert/strict');
  if (!RELEASE) return assert.equal(appid, TEST_APPID);
  assert.match(appid, /^wx[0-9a-f]{16}$/, 'release AppID must be wx + 16 lowercase hex');
  if (appid === TEST_APPID) console.warn('WARNING: release build still uses the shared test AppID');
}
module.exports = {
  checkAppId,
  TEST_APPID,
  RELEASE,
  DEV_BUILD,
  devOnly: { skip: RELEASE ? 'release configuration (cloudEnv set)' : false },
  releaseOnly: { skip: RELEASE ? false : 'dev configuration (cloudEnv empty)' },
};
