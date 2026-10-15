/**
 * Minimal sound: one InnerAudioContext per cue, silenced by the mute flag
 * (AC 79). The miss vibration follows the same flag. Cues are short and calm
 * (PO-35): no casino-style sounds (AC 10).
 */

function createAudio(wx, muted) {
  let m = !!muted;
  const cues = {};
  return {
    get muted() {
      return m;
    },
    setMuted(v) {
      m = !!v;
      if (m) for (const k of Object.keys(cues)) if (cues[k].stop) cues[k].stop();
    },
    /** name: turn | ok | miss (assets/sounds/<name>.mp3, shipped by frontend-ui). Never throws. */
    play(name) {
      if (m || !wx.createInnerAudioContext) return;
      try {
        if (!cues[name]) {
          cues[name] = wx.createInnerAudioContext();
          cues[name].src = 'assets/sounds/' + name + '.mp3';
        }
        cues[name].stop && cues[name].stop();
        cues[name].play();
      } catch (e) {
        /* missing asset: silent */
      }
    },
    /** Light vibration on a miss, only when sound is on. */
    vibrate() {
      if (m || !wx.vibrateShort) return;
      try {
        wx.vibrateShort({ type: 'light' });
      } catch (e) {
        /* optional */
      }
    },
  };
}

module.exports = { createAudio };
