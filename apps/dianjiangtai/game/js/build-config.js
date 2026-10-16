/**
 * Build-time switches. The founder supplies the real values (D9):
 *  - cloudEnv: the WeChat cloud environment id. Empty -> the in-memory mock
 *    server (js/mock-server.js) is used, so the game runs without a backend.
 *  - adUnits: 流量主 ad unit ids. Empty with stubAds=false -> rewarded/interstitial behave as no-fill (D6, H4), banner off.
 *  - stubAds: the "广告位（测试）" overlay (D5). true only in the dev state; release-config forces false and the release gate fails otherwise (AC 43).
 *  - appVersion: sent with analytics events.
 * RELEASE: `node tools/release-config.js --env <id> --appid <wx...> [--ad-rewarded <id>] [--ad-interstitial <id>]` sets cloudEnv,
 * fnPrefix, stubAds, adUnits, the AppID and packOptions.ignore of the dev-only files; `--dev` restores the committed state.
 * Never commit the release state. See RELEASE.md.
 * TODO(founder): real AppID (--appid), cloudEnv, adUnits.
 */

// The three switches below and the adUnits line are the ONLY lines tools/release-config.js edits (with project.config.json): see RELEASE.md.
const cloudEnv = '';
const fnPrefix = cloudEnv ? 'dianjiangtai_' : '';
const stubAds = true;

module.exports = {
  cloudEnv,
  /** Cloud function name prefix: 'dianjiangtai_' once cloudEnv is set (all apps share one environment, names would collide), '' for the mock. js/api.js resolves every call as fnPrefix + name. */
  fnPrefix,
  adUnits: { rewarded: '', interstitial: '' },
  stubAds,
  /** One-time subscribe message template id (H3). Empty -> the 提醒我 offer is hidden everywhere. The remote app_config value wins when present. */
  subscribeTmplId: '',
  appVersion: '1.0.0',
};
