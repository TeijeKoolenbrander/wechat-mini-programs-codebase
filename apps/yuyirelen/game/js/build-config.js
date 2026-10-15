/**
 * Build-time switches. The founder supplies the real values:
 *  - cloudEnv: the WeChat cloud environment id (H6). Empty -> the in-memory mock server
 *    (js/dev/mock-server.js) is used, so the game runs without a backend.
 *  - adUnits: 流量主 ad unit ids (H9). Empty -> ads run in stub mode.
 *  - stubAds: MUST be false in production builds once ad units exist.
 *  - appVersion: sent with analytics events.
 * TODO(founder): real AppID in project.config.json (H1), cloudEnv (H6), adUnits (H9).
 * RELEASE: exclude js/dev/ from the package (packOptions.ignore) so no fixture ships.
 */

module.exports = {
  cloudEnv: '',
  adUnits: { rewarded: '', interstitial: '' },
  stubAds: true,
  appVersion: '0.1.0',
};
