/**
 * Build-time switches. The founder supplies the real values (spec 16):
 *  - cloudEnv: the WeChat cloud environment id (H6). Empty -> the in-memory mock server (js/mock-server.js)
 *    is used, so the whole game runs offline.
 *  - adUnits: 流量主 ad unit ids (H8). Empty -> ads run in stub mode and behave as no-fill.
 *  - stubAds: MUST be false in production builds once ad units exist (AC 61).
 *  - mockPopulation: synthetic players per day the mock server pretends already played (offline demo only).
 * TODO(founder): real AppID in project.config.json (H1), cloudEnv (H6), adUnits (H8).
 */

module.exports = {
  cloudEnv: '',
  adUnits: { rewarded: '', interstitial: '', banner: '' },
  stubAds: true,
  appVersion: '0.1.0',
  mockPopulation: 120,
};
