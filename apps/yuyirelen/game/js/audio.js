/** Minimal sound: one InnerAudioContext per cue, silenced by the mute flag. */

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
    /** name: tap | chime (assets/sounds/<name>.mp3, shipped by frontend-ui). Never throws. */
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
  };
}

module.exports = { createAudio };
