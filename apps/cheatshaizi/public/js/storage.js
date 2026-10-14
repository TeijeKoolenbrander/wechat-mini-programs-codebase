/**
 * The little the game remembers on the device: the last mode played, and
 * whether the Controlled-mode introduction was dismissed for good. Nothing
 * leaves the device. Every call tolerates storage being unavailable, in
 * which case the game simply forgets.
 */

const MODE_IDS = ['regular', 'lucky', 'crazy', 'controlled'];

const LAST_MODE_KEY = 'lastMode';
const INTRO_SEEN_KEY = 'controlledIntroSeen';

function get(key) {
  try {
    return typeof wx.getStorageSync === 'function' ? wx.getStorageSync(key) : undefined;
  } catch (e) {
    return undefined;
  }
}

function set(key, value) {
  try {
    if (typeof wx.setStorageSync === 'function') wx.setStorageSync(key, value);
  } catch (e) {
    // Not fatal: the setting is just not remembered.
  }
}

/** The last mode played, or null on first launch. */
function lastMode() {
  const mode = get(LAST_MODE_KEY);
  return MODE_IDS.includes(mode) ? mode : null;
}

function rememberMode(mode) {
  if (MODE_IDS.includes(mode)) set(LAST_MODE_KEY, mode);
}

function introSeen() {
  return get(INTRO_SEEN_KEY) === true;
}

function rememberIntroSeen() {
  set(INTRO_SEEN_KEY, true);
}

module.exports = { MODE_IDS, lastMode, rememberMode, introSeen, rememberIntroSeen };
