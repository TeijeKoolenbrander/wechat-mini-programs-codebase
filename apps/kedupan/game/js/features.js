/**
 * Remote feature config (spec 9, 10 Shared; app_config via getDaily.features). The server already builds it with
 * core/adpolicy.buildFeatures; the client clamps AGAIN (a bad value must never flood the player) and falls back to
 * the safe defaults for anything missing: subscribe hidden (no template id), banner off, interstitial on the core
 * defaults. Nothing here affects scoring (AC 81).
 */

const AD = require('../core/adpolicy');

const SAFE = () => AD.buildFeatures(null);

function normalizeFeatures(raw) {
  if (!raw || typeof raw !== 'object') return SAFE();
  // accept the server shape ({subscribe, banner, interstitial}) and the app_config shape ({subscribe, ads:{banner, interstitial}})
  const ads = raw.ads && typeof raw.ads === 'object' ? raw.ads : raw;
  const out = AD.buildFeatures({
    subscribe: raw.subscribe,
    ads: { banner: ads.banner, interstitial: ads.interstitial },
  });
  return out;
}

module.exports = { normalizeFeatures };
