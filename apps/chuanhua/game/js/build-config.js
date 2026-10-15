/**
 * Build-time switches. The founder supplies the real values (Handoff H1, H4, H8):
 *  - cloudEnv: the WeChat cloud environment id. Empty -> the in-memory mock server (js/mock-server.js) is
 *    used, so the game runs without a backend.
 *  - adUnits: 流量主 ad unit ids. Empty -> ads run in stub mode.
 *  - stubAds: MUST be false in production builds once ad units exist.
 *  - appVersion: sent with analytics events.
 * TODO(founder, H1): replace "touristappid" in project.config.json with the real mini game AppID.
 * TODO(founder, H4): set cloudEnv.
 */

module.exports = {
  cloudEnv: '',
  adUnits: { rewarded: '', interstitial: '', banner: '' },
  stubAds: true,
  appVersion: '0.1.0',
};
