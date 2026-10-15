/** Entry point: every screen renderer, sheet, overlay, the layout builder and the share card. */

const layout = require('./layout');

module.exports = {
  makeLayout: layout.makeLayout,
  hitTest: layout.hitTest,
  mergeHits: layout.mergeHits,
  // full screens
  screens: {
    home: require('./home'),
    play: require('./play'),
    result: require('./result'),
    challenge: require('./challenge'),
    board: require('./board'),
    history: require('./history'),
    issue: require('./issue'),
    sources: require('./sources'),
  },
  // sheets: draw after the screen they open over
  sheets: {
    howto: require('./howto'),
    settings: require('./settings'),
    picker: require('./picker'),
    report: require('./report'),
    source: require('./source'),
    rewarded: require('./rewarded'),
    questions: require('./questions'),
  },
  overlay: require('./overlay'),
  shareCard: require('./shareCard'),
  fmt: require('./fmt'),
  theme: require('./theme'),
};
