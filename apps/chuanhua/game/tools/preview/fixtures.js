/**
 * Fixture view models for every screen x state (spec 8, 12). The same data
 * drives the PNG preview (render.js) and tests/render*.test.js, so they never
 * drift. buildFixtures({L, mode}) -> { screen: { state: vm | {vm, overlay} } }.
 */

const MODES = {
  standard: { largeText: false, highContrast: false },
  large: { largeText: true, highContrast: false },
  hc: { largeText: false, highContrast: true },
};

const SIZES = [
  { w: 375, h: 667, sb: 20, menu: { top: 26, bottom: 58, left: 281, right: 368 }, bottomInset: 0 },
  { w: 320, h: 568, sb: 20, menu: { top: 26, bottom: 58, left: 226, right: 313 }, bottomInset: 0 },
  { w: 430, h: 932, sb: 54, menu: { top: 60, bottom: 92, left: 336, right: 423 }, bottomInset: 34 },
  { w: 375, h: 812, sb: 47, menu: { top: 53, bottom: 85, left: 281, right: 368 }, bottomInset: 34 },
  { w: 768, h: 1024, sb: 24, menu: { top: 30, bottom: 62, left: 674, right: 761 }, bottomInset: 20 },
];

function buildFixtures(env) {
  const fx = {};
  require('./fixtures_home.js').add(fx, env);
  require('./fixtures_turn.js').add(fx, env);
  require('./fixtures_chain.js').add(fx, env);
  require('./fixtures_misc.js').add(fx, env);
  return fx;
}

module.exports = { buildFixtures, MODES, SIZES };
