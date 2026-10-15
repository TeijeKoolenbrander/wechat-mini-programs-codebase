/** Entry point: every screen renderer, the layout builder, overlays and share cards. */

const R = require('./ruler');

module.exports = {
  makeLayout: require('./layout').makeLayout,
  hitTest: require('./layout').hitTest,
  /** Map a touch x to 0-100 using `hitAreas.ruler` from the last draw. */
  posFromX: R.posFromX,
  applyDisplay: require('./theme').applyDisplay,
  screens: {
    home: require('./home'),
    play: require('./play'),
    result: require('./result'),
    host: require('./host'),
    round: require('./round'),
    group: require('./group'),
    friend: require('./friend'),
    archive: require('./archive'),
    review: require('./review'),
  },
  overlay: require('./overlay'),
  shareCard: require('./shareCard'),
};
