/** Entry point: every screen renderer (contract names), the layout builder, overlays, share cards and the strokes helper. */

const layout = require('./layout');

const screens = {
  home: require('./home'),
  rules: require('./rules'),
  warning: require('./warning'),
  howto: require('./howto'),
  startLimit: require('./startLimit'),
  pick: require('./pick'),
  draw: require('./draw'),
  describe: require('./describe'),
  roundWait: require('./roundWait'),
  lobby: require('./lobby'),
  roomEntry: require('./roomEntry'),
  sent: require('./sent'),
  entry: require('./entry'),
  overview: require('./overview'),
  stepthrough: require('./stepthrough'),
  teaser: require('./teaser'),
  group: require('./group'),
  album: require('./album'),
  mine: require('./mine'),
  report: require('./report'),
  settings: require('./settings'),
  terms: require('./terms'),
  overlay: require('./overlay'),
};

module.exports = {
  makeLayout: layout.makeLayout,
  hitTest: layout.hitTest,
  bannerRect: layout.bannerRect,
  screens,
  overlay: screens.overlay,
  shareCard: require('./shareCard'),
  strokes: require('./strokes'),
  theme: require('./theme'),
  chrome: require('./chrome'),
  /** geometry helpers logic calls at turn open (pure) */
  drawGeometry: screens.draw.geometry,
  canvasRectFor: screens.draw.canvasRectFor,
  describeGeometry: screens.describe.geometry,
};
