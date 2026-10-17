/** Entry point: every screen renderer, the layout builder, geometry helpers and overlays. */

const layout = require('./layout');

module.exports = {
  makeLayout: layout.makeLayout,
  hitTest: layout.hitTest,
  boardRect: layout.boardRect,
  bannerRect: layout.bannerRect,
  listRect: require('./round').listRect,
  screens: {
    home: require('./home'),
    card: require('./card'),
    result: require('./result'),
    create: require('./create'),
    round: require('./round'),
    group: require('./group'),
    archive: require('./archive'),
    terms: require('./terms'),
  },
  overlay: require('./overlay'),
  shareCard: require('./shareCard'),
  ruler: require('./ruler'),
  theme: require('./theme'),
};
