/**
 * Save the result card to the album (spec 8.12) [COMPLIANCE: album permission].
 *
 *  - runs ONLY from the 保存图片 tap on the result screen; nothing album
 *    related (getSetting for the scope, authorize, save) happens before it
 *  - the scope is never forced: if it is already refused, or the privacy
 *    agreement (104) / the scope is refused now, resolve 'needSettings' and
 *    the controller shows the 去设置 sheet (wx.openSetting only on its tap)
 *  - 2x card (1000 x 800), rendered through share.cardFile
 *
 * save(card) resolves { result: 'saved'|'privacyDenied'|'scopeDenied'|'renderFallback'|'error', errCode?, needSettings }
 */

const SCOPE = 'scope.writePhotosAlbum';

function errnoOf(e) {
  return e && (e.errno !== undefined ? e.errno : e.errCode);
}

function createAlbum(opts) {
  const { wx, share, analytics } = opts;
  const album = { scope: 'unknown' };

  function readScope() {
    return new Promise((resolve) => {
      if (!wx.getSetting) return resolve('unknown');
      wx.getSetting({
        success: (r) => {
          const v = r && r.authSetting && r.authSetting[SCOPE];
          resolve(v === true ? 'granted' : v === false ? 'denied' : 'unknown');
        },
        fail: () => resolve('unknown'),
      });
    });
  }

  function saveFile(path) {
    return new Promise((resolve) => {
      if (!wx.saveImageToPhotosAlbum) return resolve({ ok: false, errCode: 'unsupported' });
      wx.saveImageToPhotosAlbum({ filePath: path, success: () => resolve({ ok: true }), fail: (e) => resolve({ ok: false, errCode: errnoOf(e), errMsg: (e && e.errMsg) || '' }) });
    });
  }

  album.save = async function (card, mode) {
    const done = (result, extra) => {
      analytics.track('save_image', Object.assign({ mode, result }, extra && extra.errCode !== undefined ? { errCode: extra.errCode } : {}));
      return Object.assign({ result, needSettings: result === 'privacyDenied' || result === 'scopeDenied' }, extra || {});
    };
    album.scope = await readScope();
    if (album.scope === 'denied') return done('scopeDenied');
    const file = await share.cardFile(card, { pixelScale: 2 });
    const r = await saveFile(file.path);
    if (r.ok) {
      album.scope = 'granted';
      return done(file.fallback ? 'renderFallback' : 'saved');
    }
    if (r.errCode === 104) return done('privacyDenied', { errCode: 104 });
    if (/auth deny|authorize|scope|permission/i.test(r.errMsg || '')) {
      album.scope = 'denied';
      return done('scopeDenied', { errCode: r.errCode });
    }
    return done('error', { errCode: r.errCode });
  };

  /** [去设置], on tap only. Resolves the scope after the settings page. */
  album.openSetting = function () {
    return new Promise((resolve) => {
      if (!wx.openSetting) return resolve(album.scope);
      wx.openSetting({
        success: (r) => {
          const v = r && r.authSetting && r.authSetting[SCOPE];
          if (v === true) album.scope = 'granted';
          else if (v === false) album.scope = 'denied';
          resolve(album.scope);
        },
        fail: () => resolve(album.scope),
      });
    });
  };

  return album;
}

module.exports = { createAlbum, SCOPE };
