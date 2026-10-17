/**
 * Minimal sound: one InnerAudioContext per cue, silenced by the mute flag (AC 76). Cues: tick (every 5 steps while
 * placing), chime (心有灵犀). Assets live in assets/sounds/<name>.mp3 (frontend-ui); a missing file is silent.
 * `calls` records every cue asked for (QA), muted or not play nothing.
 */

function createAudio(wx, muted) {
  let m = !!muted;
  const cues = {};
  const a = {
    played: [],
    get muted() {
      return m;
    },
    setMuted(v) {
      m = !!v;
      if (m) for (const k of Object.keys(cues)) if (cues[k].stop) cues[k].stop();
    },
    /** name: tick | chime. Never throws; silent while muted. */
    play(name) {
      if (m) return false;
      a.played.push(name);
      if (!wx || !wx.createInnerAudioContext) return true;
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
      return true;
    },
  };
  return a;
}

module.exports = { createAudio };
