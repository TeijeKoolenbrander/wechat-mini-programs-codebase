/** Entry point: every screen renderer, the layout builder, overlays and the share card. */

module.exports = {
  makeLayout: require('./layout').makeLayout,
  hitTest: require('./layout').hitTest,
  theme: require('./theme'),
  screens: {
    home: require('./home'),
    play: require('./play'),
    reveal: require('./reveal'),
    challenge: require('./challenge'),
    board: require('./board'),
    archive: require('./archive'),
    howto: require('./howto'),
    settings: require('./settings'),
  },
  boardRect: require('./board').boardRect,
  bannerRect: require('./board').bannerRect,
  overlay: require('./overlay'),
  shareCard: require('./shareCard'),
};
