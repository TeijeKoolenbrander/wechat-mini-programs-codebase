/** Entry point: every screen renderer, the layout builder and overlays. */

module.exports = {
  makeLayout: require('./layout').makeLayout,
  hitTest: require('./layout').hitTest,
  boardRect: require('./layout').boardRect,
  bannerRect: require('./layout').bannerRect,
  screens: {
    home: require('./home'),
    draft: require('./draft'),
    result: require('./result'),
    challenge: require('./challenge'),
    board: require('./board'),
    history: require('./history'),
    historyIssue: require('./historyIssue'),
  },
  overlay: require('./overlay'),
  shareCard: require('./shareCard'),
  seal: require('./seal'),
  theme: require('./theme'),
};
