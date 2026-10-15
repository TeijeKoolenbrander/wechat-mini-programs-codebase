/** Entry point: every screen renderer, the layout builder, overlays and share cards. */

module.exports = {
  makeLayout: require('./layout').makeLayout,
  hitTest: require('./layout').hitTest,
  screens: {
    home: require('./home'),
    picker: require('./picker'),
    draw: require('./draw'),
    describe: require('./describe'),
    sent: require('./sent'),
  },
  overlay: require('./overlay'),
  strokes: require('./strokes'),
  theme: require('./theme'),
  shareCard: null,
};
