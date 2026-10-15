/**
 * Privacy and rules (spec 8.2, 8.13, 15, 7.3) [COMPLIANCE].
 *
 * 传画接龙 calls NO WeChat privacy interface: no open data domain, no setUserCloudStorage/getFriendCloudStorage,
 * no album, location, clipboard or getUserProfile (AC 79; tests/wechat-compat.test.js scans for them). So there
 * is no privacy-authorization flow here, only:
 *   - the 接龙公约 agreement (an active agreement for taking part in UGC, NOT a WeChat authorization),
 *   - opening the 用户隐私保护指引 (wx.openPrivacyContract) and the 用户协议,
 *   - the user-generated-content notice and the data inventory used by the release pack.
 */

const { CONFIG } = require('../core/config');

/** The 接龙公约 lines (spec 8.2); the renderer shows them as given. */
const RULES_LINES = [
  '画和字都会先审核，通过后才传给下一位',
  '不画、不写色情低俗、政治、辱骂、广告和联系方式',
  '违规内容会被隐藏，多次违规会被限制',
  '看到不合适的内容，请点「举报」',
];

const UGC_PURPOSE = '你在接龙中创作的画和文字，会经过内容安全审核后展示给同一条接龙的参与者';

/** APIs this game must never call (AC 79). Scanned by tests/wechat-compat.test.js over every shipped file. */
const FORBIDDEN_APIS = ['setUserCloudStorage', 'getFriendCloudStorage', 'getGroupCloudStorage', 'saveImageToPhotosAlbum', 'getLocation', 'chooseLocation', 'setClipboardData', 'getClipboardData', 'getUserProfile', 'getUserInfo', 'getShareInfo', 'getOpenDataContext', 'uploadFile', 'chooseImage', 'chooseMedia', 'openDataContext'];

function createPrivacy(opts) {
  const { wx, analytics, store } = opts;
  const p = { RULES_LINES, UGC_PURPOSE, rulesVersion: CONFIG.rulesVersion };

  /** The player has agreed to the current 公约 (server truth mirrored in the store). */
  p.rulesAgreed = (serverVersion) => (serverVersion !== undefined ? serverVersion : store.state.rulesVersion) >= CONFIG.rulesVersion;

  p.openContract = function () {
    if (wx.openPrivacyContract) {
      try {
        wx.openPrivacyContract({ fail() {} });
        return true;
      } catch (e) {
        /* fall through */
      }
    }
    analytics.track('error', { where: 'privacy_contract', code: 'unsupported' });
    return false;
  };

  /**
   * 《用户协议》: written and hosted by the release pack (Handoff H6). Until a page exists this explains in a
   * modal where to find it. TODO(release): replace with the hosted agreement.
   */
  p.openAgreement = function () {
    if (p.agreementOpener) return p.agreementOpener();
    if (wx.showModal) wx.showModal({ title: '用户协议', content: '用户协议即将在此处开放。你创作的内容仅在同一条接龙的参与者之间展示，违规内容会被隐藏。', showCancel: false });
    return false;
  };

  return p;
}

module.exports = { createPrivacy, RULES_LINES, UGC_PURPOSE, FORBIDDEN_APIS };
