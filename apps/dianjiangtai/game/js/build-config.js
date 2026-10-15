/**
 * Build-time switches. The founder supplies the real values (D9):
 *  - cloudEnv: the WeChat cloud environment id. Empty -> the in-memory mock
 *    server (js/mock-server.js) is used, so the game runs without a backend.
 *  - adUnits: 流量主 ad unit ids. Empty -> ads run in stub mode (D5).
 *  - stubAds: MUST be false in production builds once ad units exist (AC 43).
 *  - appVersion: sent with analytics events.
 * TODO(founder): real AppID in project.config.json, cloudEnv, adUnits.
 */

module.exports = {
  cloudEnv: '',
  adUnits: { rewarded: '', interstitial: '' },
  stubAds: true,
  /** One-time subscribe message template id (H3). Empty -> the 提醒我 offer is hidden everywhere. The remote app_config value wins when present. */
  subscribeTmplId: '',
  appVersion: '1.0.0',
};
