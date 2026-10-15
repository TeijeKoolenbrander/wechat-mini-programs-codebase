/** Entry point: every screen renderer, the layout builder, overlays and share cards. */

const album = require('./album');

module.exports = {
  makeLayout: require('./layout').makeLayout,
  hitTest: require('./layout').hitTest,
  screens: {
    home: require('./home'),
    picker: require('./picker'),
    draw: require('./draw'),
    describe: require('./describe'),
    sent: require('./sent'),
    entry: require('./entry'),
    reveal: require('./reveal'),
    teaser: require('./teaser'),
    group: require('./group'),
    album: album,
    detail: { draw: album.drawDetail },
    settings: require('./settings'),
  },
  overlay: require('./overlay'),
  strokes: require('./strokes'),
  reveal: require('./reveal'),
  theme: require('./theme'),
  shareCard: require('./shareCard'),
};
