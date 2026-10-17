/**
 * Privacy authorisation flow (spec 15, 8.13) [COMPLIANCE].
 *
 * 传画接龙 calls NO privacy interface (no open data domain, album, location, clipboard, profile; AC 79), so WeChat's own
 * popup never fires in normal play. Two things remain, both on a user tap only:
 *   - openContract(): 《用户隐私保护指引》 via wx.openPrivacyContract (the 公约 sheet and 设置 link to it)
 *   - requirePrivacy(trigger): the official authorisation popup (wx.requirePrivacyAuthorize) for the one case where the
 *     platform answers a call with "privacy not agreed" (errno 104), e.g. the group-entry API on some base libraries. The
 *     caller retries once after 'agreed'; a refusal never blocks browsing. We do NOT register onNeedPrivacyAuthorization:
 *     the official popup is used (as in 点将台 v1), so no own consent dialog exists to get wrong.
 * Never at launch, never during a turn, never repeated automatically.
 */

function errnoOf(e) {
  return e && (e.errno !== undefined ? e.errno : e.errCode);
}

function createPrivacy(opts) {
  const { wx, analytics } = opts;
  const p = { state: 'unknown' };

  /** true when an API failure means "the player has not agreed to the privacy guide" */
  p.isPrivacyError = (e) => errnoOf(e) === 104;

  /** Resolves 'opened' | 'unavailable'. */
  p.openContract = function () {
    return new Promise((resolve) => {
      if (!wx || !wx.openPrivacyContract) return resolve('unavailable');
      try {
        wx.openPrivacyContract({ success: () => resolve('opened'), fail: () => resolve('unavailable') });
      } catch (e) {
        resolve('unavailable');
      }
    });
  };

  /** Ask WeChat for the privacy agreement. Resolves 'agreed' | 'denied'. Only ever called from a tap. */
  p.requirePrivacy = function (trigger) {
    return new Promise((resolve) => {
      const done = (res) => {
        p.state = res;
        if (analytics && res === 'denied') analytics.track('error', { where: 'privacy_' + (trigger || 'tap'), code: 'denied' });
        resolve(res);
      };
      if (!wx || !wx.requirePrivacyAuthorize) return done(p.state === 'denied' ? 'denied' : 'agreed');
      const ask = () => {
        try {
          wx.requirePrivacyAuthorize({ success: () => done('agreed'), fail: () => done('denied') });
        } catch (e) {
          done('denied');
        }
      };
      if (wx.getPrivacySetting) {
        try {
          wx.getPrivacySetting({ success: (r) => (r && r.needAuthorization === false ? done('agreed') : ask()), fail: ask });
        } catch (e) {
          ask();
        }
      } else ask();
    });
  };

  return p;
}

module.exports = { createPrivacy };
