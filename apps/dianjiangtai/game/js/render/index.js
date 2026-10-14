/** Entry point: every screen renderer, the layout builder and overlays. */

module.exports = {
  makeLayout: require('./layout').makeLayout,
  hitTest: require('./layout').hitTest,
  screens: {
    home: require('./home'),
    draft: require('./draft'),
    result: require('./result'),
    challenge: require('./challenge'),
    board: require('./board'),
  },
  overlay: require('./overlay'),
  shareCard: require('./shareCard'),
};
