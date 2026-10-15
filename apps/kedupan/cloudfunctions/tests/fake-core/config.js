'use strict';
// TEST DOUBLE of apps/kedupan/game/core/config.js (same shape as the real getConfig(1)).
const V1 = {
  configVersion: 1,
  daily: { cards: 5, launchDateKey: '20261101', graceMs: 30 * 60 * 1000 },
  score: {
    priorVotes: 10, perStep: 2.5, agreeRadius: 10, agreeMinN: 30, percentileMinN: 30,
    groupMinForScore: 2, groupMinForMq: 3, groupRowCap: 500,
    labels: [
      { max: 2, key: 'bullseye', label: '心有灵犀' }, { max: 6, key: 'close', label: '很同频' },
      { max: 12, key: 'near', label: '差不多' }, { max: 20, key: 'off', label: '有点偏' },
      { max: Infinity, key: 'unique', label: '想法独特' },
    ],
    bands: [
      { min: 450, key: 'soul', label: '灵魂同频' }, { min: 380, key: 'tacit', label: '默契十足' },
      { min: 300, key: 'broad', label: '大体同频' }, { min: 200, key: 'own', label: '各有想法' },
      { min: 0, key: 'unique', label: '独树一帜' },
    ],
  },
  rounds: {
    targetMin: 5, targetMax: 95, targetBand: 2, revealMinGuesses: 2, autoRevealAt: 8, autoRevealMs: 24 * 3600e3,
    guessWindowMs: 7 * 24 * 3600e3, draftMs: 30 * 60 * 1000, perDayLimit: 20, spectraOffered: 3, clueOptions: 6,
    adSwapsPerRound: 3, groupRefsCap: 10,
  },
  extras: { bonusPerDay: 3, distributionPerDay: 3, reportsPerDay: 10 },
  ads: { interstitial: { enabled: true, everyNSets: 2, minLifetimeSets: 3, minGapSec: 120, maxPerDay: 6 }, banner: { enabled: false, adUnitId: null }, stubDelayMs: 3000 },
  boardListCap: 3000,
  analytics: { flushMs: 20000, maxBatch: 50, sessionGapMs: 30 * 60 * 1000 },
};
const LATEST_CONFIG_VERSION = 1;
const getConfig = (v) => (Number(v) === 1 ? V1 : null);
function normalizeFeatures(remote) {
  const r = remote || {};
  const sub = r.subscribe && typeof r.subscribe.tmplId === 'string' && r.subscribe.tmplId ? { tmplId: r.subscribe.tmplId } : null;
  const ban = r.banner || {};
  return { subscribe: sub, banner: { enabled: !!ban.enabled && !!ban.adUnitId, adUnitId: ban.adUnitId || null }, interstitial: V1.ads.interstitial };
}
module.exports = { getConfig, normalizeFeatures, LATEST_CONFIG_VERSION };
