/**
 * Sound (V1-4, AC 49). Four tiny original cues synthesised by tools/gen-sounds.js and shipped as assets/sounds/<name>.wav
 * (about 30 KB together): flip (token flip), pick (a general placed), win and loss (one battle result in the reveal).
 * One InnerAudioContext per cue, created when sound is on; the 声音 toggle (home and settings) mutes everything and a
 * muted game never creates a context. Never throws: a missing or failing asset is silent.
 */

const CUES = ['flip', 'pick', 'win', 'loss'];

function createAudio(wx, muted) {
  let m = !!muted;
  const cues = {};
  const failed = {};

  function ensure(name) {
    if (cues[name] || failed[name]) return cues[name] || null;
    if (!wx || !wx.createInnerAudioContext) return null;
    try {
      const a = wx.createInnerAudioContext();
      a.src = 'assets/sounds/' + name + '.wav';
      if (a.onError) a.onError(() => { failed[name] = true; cues[name] = null; });
      cues[name] = a;
    } catch (e) {
      failed[name] = true;
    }
    return cues[name] || null;
  }

  return {
    get muted() {
      return m;
    },
    setMuted(v) {
      m = !!v;
      if (m) {
        for (const k of Object.keys(cues)) if (cues[k] && cues[k].stop) cues[k].stop();
      }
    },
    /** Create the contexts early so the first cue is not late. No-op while muted. */
    preload() {
      if (m) return;
      for (const n of CUES) ensure(n);
    },
    /** name: flip | pick | win | loss. Never throws. */
    play(name) {
      if (m || CUES.indexOf(name) < 0) return;
      try {
        const a = ensure(name);
        if (!a) return;
        if (a.stop) a.stop();
        a.play();
      } catch (e) {
        /* silent */
      }
    },
  };
}

module.exports = { createAudio, CUES };
