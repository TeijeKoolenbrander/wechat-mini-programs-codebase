/**
 * Sound (muted by default state comes from the store). The only sound in v1 is the single soft tick at 10 s left (8.4).
 * No audio asset ships yet: an empty source makes play() a no-op, so the game is silent until the art/audio owner adds
 * `assets/tick.mp3` and fills SOUND_SRC (compressed audio only, spec 1 package budget).
 */

const SOUND_SRC = { tick: 'assets/tick.mp3' };

function createAudio(wx, muted) {
  const a = { muted: !!muted, played: [] };
  const cache = {};
  a.setMuted = (m) => {
    a.muted = !!m;
  };
  a.play = function (name) {
    if (a.muted) return false;
    const src = SOUND_SRC[name];
    a.played.push(name);
    if (!src || !wx || !wx.createInnerAudioContext) return false;
    try {
      const ctx = cache[name] || (cache[name] = wx.createInnerAudioContext());
      ctx.src = src;
      ctx.stop();
      ctx.play();
      return true;
    } catch (e) {
      return false;
    }
  };
  return a;
}

module.exports = { createAudio, SOUND_SRC };
