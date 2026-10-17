/**
 * Build-time switches (the founder supplies the real values, spec 16 H6/H8):
 *  - cloudEnv: the WeChat cloud environment id. Empty (default) = the in-memory mock server (js/mock-server.js) is
 *    used, so the game boots in DevTools with no backend.
 *  - fnPrefix: cloud function names are shared across apps in one environment, so they are deployed as
 *    `kedupan_<name>`. Empty by default (mock, or a dedicated environment); set 'kedupan_' together with cloudEnv when
 *    pointing at the shared test environment (TD-41). js/api.js resolves every callFunction name through it.
 *    (Collections are prefixed server-side: cloudfunctions/common/util.js COLLECTION_PREFIX.)
 *  - adUnits: 流量主 ad unit ids (rewarded, interstitial). Empty -> those placements behave as no-fill (spec 9). The
 *    banner unit id comes from remote app_config.
 *  - stubAds: QA only (AC 61). MUST be false in production builds.
 *  - shareSecondTap: [SPIKE E13] false = a passed typed clue opens the share sheet straight away; true = the button turns into
 *    "提示已通过 · 发到群里" and the second tap shares (for a platform that refuses the share sheet after the async check).
 *  - appVersion: sent with analytics events.
 */

module.exports = {
  cloudEnv: '',
  fnPrefix: '',
  adUnits: { rewarded: '', interstitial: '' },
  stubAds: false,
  shareSecondTap: false,
  appVersion: '1.0.0',
};
