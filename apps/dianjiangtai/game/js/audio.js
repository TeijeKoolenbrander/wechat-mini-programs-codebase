/**
 * Sound (CTO-D3): a quiet looping 古琴/琵琶 track and four short effects, all in the "audio" subpackage
 * (audio/bgm.mp3, flip.mp3, drum.mp3, bell.mp3, tap.mp3), loaded after launch with wx.loadSubpackage.
 *
 * - Two persisted toggles, 音乐 (music) and 音效 (effects). Switching one off silences it immediately.
 *   The game is fully playable muted (AC 49); every call is a no-op when its channel is off.
 * - Music: setScene('music' | 'quiet'). 'music' fades in to a low volume, 'quiet' fades out (battle reveal).
 * - Lifecycle: onHide() pauses everything, onShow() resumes the music. Audio interruptions (phone call, other
 *   app) pause and resume the same way. One InnerAudioContext per cue, created lazily, never destroyed mid-play.
 * - Missing or unloaded audio fails silently: nothing here throws, and an error from a context is swallowed.
 *
 * createAudio(wx, opts). opts may also be a boolean (the legacy "muted" flag).
 *   opts: { legacyMuted, storageKey, root, subpackage, musicVolume, sfxVolume, fadeInMs, fadeOutMs,
 *           setInterval, clearInterval }
 */

const KEY = 'djt_audio_v1';
const SFX = ['flip', 'drum', 'bell', 'tap'];
const STEP_MS = 50;

function createAudio(wx, opts) {
  if (typeof opts !== 'object' || opts === null) opts = { legacyMuted: !!opts };
  const root = opts.root || 'audio/';
  const musicVol = opts.musicVolume == null ? 0.3 : opts.musicVolume;
  const sfxVol = opts.sfxVolume == null ? 0.8 : opts.sfxVolume;
  const fadeInMs = opts.fadeInMs == null ? 1200 : opts.fadeInMs;
  const fadeOutMs = opts.fadeOutMs == null ? 700 : opts.fadeOutMs;
  const key = opts.storageKey || KEY;
  const setI = opts.setInterval || ((f, ms) => setInterval(f, ms));
  const clearI = opts.clearInterval || ((h) => clearInterval(h));

  let musicOn = !opts.legacyMuted;
  let sfxOn = !opts.legacyMuted;
  try {
    const raw = wx.getStorageSync && wx.getStorageSync(key);
    const v = raw && (typeof raw === 'string' ? JSON.parse(raw) : raw);
    if (v && typeof v === 'object') {
      if (typeof v.music === 'boolean') musicOn = v.music;
      if (typeof v.sfx === 'boolean') sfxOn = v.sfx;
    }
  } catch (e) {
    /* unreadable: keep the defaults */
  }

  let loaded = false;
  let loading = false;
  let hidden = false;
  let interrupted = false;
  let scene = 'quiet'; // 'music' on home and draft; 'quiet' elsewhere and during the reveal
  let music = null; // InnerAudioContext
  let musicPlaying = false;
  let vol = 0; // current music volume (0..musicVol)
  let fade = null; // { timer }
  const sfx = {};
  let played = 0;

  function persist() {
    try {
      wx.setStorageSync && wx.setStorageSync(key, { music: musicOn, sfx: sfxOn });
    } catch (e) {
      /* storage full: the toggle still works for this session */
    }
  }

  function safe(fn) {
    try {
      return fn();
    } catch (e) {
      return undefined;
    }
  }

  function clearFade() {
    if (fade) {
      clearI(fade.timer);
      fade = null;
    }
  }

  function setVol(v) {
    vol = Math.max(0, Math.min(musicVol, v));
    if (music) safe(() => (music.volume = vol));
  }

  function stopMusic() {
    clearFade();
    musicPlaying = false;
    vol = 0;
    if (music) safe(() => music.stop());
  }

  function pauseMusic() {
    clearFade();
    if (music && musicPlaying) safe(() => music.pause());
    musicPlaying = false;
  }

  function fadeTo(target, ms, then) {
    clearFade();
    if (ms <= 0 || Math.abs(target - vol) < 1e-6) {
      setVol(target);
      if (then) then();
      return;
    }
    const steps = Math.max(1, Math.ceil(ms / STEP_MS));
    const delta = (target - vol) / steps;
    let n = 0;
    const f = { timer: null };
    f.timer = setI(() => {
      n++;
      if (n >= steps) {
        clearFade();
        setVol(target);
        if (then) then();
      } else setVol(vol + delta);
    }, STEP_MS);
    fade = f;
  }

  function ensureMusic() {
    if (music) return music;
    music = safe(() => wx.createInnerAudioContext && wx.createInnerAudioContext()) || null;
    if (!music) return null;
    safe(() => {
      music.src = root + 'bgm.mp3';
      music.loop = true;
      music.volume = 0;
      if (music.onError) music.onError(() => {});
    });
    return music;
  }

  /** bring the music in line with: toggle, scene, load state, hidden, interruption */
  function applyMusic() {
    const allowed = musicOn && loaded && !hidden && !interrupted;
    if (!allowed) {
      if (!musicOn || !loaded) stopMusic();
      else pauseMusic(); // hidden / interrupted: resume where it was
      return;
    }
    if (scene === 'music') {
      const ctx = ensureMusic();
      if (!ctx) return;
      if (!musicPlaying) {
        safe(() => ctx.play());
        musicPlaying = true;
      }
      fadeTo(musicVol, fadeInMs);
    } else if (musicPlaying) {
      fadeTo(0, fadeOutMs, () => pauseMusic());
    }
  }

  function stopAllSfx() {
    for (const k of Object.keys(sfx)) safe(() => sfx[k].stop());
  }

  const api = {
    get musicOn() {
      return musicOn;
    },
    get sfxOn() {
      return sfxOn;
    },
    /** true when nothing is audible by the player's choice */
    get muted() {
      return !musicOn && !sfxOn;
    },
    /** how many effects have been started; the controller uses it to add a UI tap only when nothing else sounded */
    get played() {
      return played;
    },
    get loaded() {
      return loaded;
    },
    /** debug / test view of the music channel */
    state() {
      return { musicPlaying, volume: vol, scene, loaded, hidden, interrupted, fading: !!fade };
    },

    /** Load the audio subpackage (call after launch; safe to call again until it has loaded). */
    load() {
      if (loaded || loading) return;
      if (!wx.loadSubpackage) {
        loaded = true; // devtools / old base library: the folder is on disk
        applyMusic();
        return;
      }
      loading = true;
      safe(() =>
        wx.loadSubpackage({
          name: opts.subpackage || 'audio',
          success() {
            loading = false;
            loaded = true;
            applyMusic();
          },
          fail() {
            loading = false; // silent; load() is tried again on the next onShow
          },
        })
      );
    },

    setMusicOn(v) {
      musicOn = !!v;
      persist();
      applyMusic();
    },
    setSfxOn(v) {
      sfxOn = !!v;
      persist();
      if (!sfxOn) stopAllSfx();
    },
    /** both channels at once (the home screen's single sound link) */
    setMuted(v) {
      musicOn = !v;
      sfxOn = !v;
      persist();
      if (!sfxOn) stopAllSfx();
      applyMusic();
    },

    /** 'music' (home, draft) or 'quiet' (battle reveal and everywhere else) */
    setScene(s) {
      const n = s === 'music' ? 'music' : 'quiet';
      if (n === scene) return;
      scene = n;
      applyMusic();
    },

    /** name: flip | drum | bell | tap. Never throws. */
    play(name) {
      if (!sfxOn || !loaded || hidden || interrupted || SFX.indexOf(name) < 0 || !wx.createInnerAudioContext) return;
      safe(() => {
        let ctx = sfx[name];
        if (!ctx) {
          ctx = sfx[name] = wx.createInnerAudioContext();
          ctx.src = root + name + '.mp3';
          ctx.volume = name === 'tap' ? sfxVol * 0.8 : sfxVol;
          if (ctx.onError) ctx.onError(() => {});
        }
        ctx.stop && ctx.stop();
        ctx.play();
        played++;
      });
    },
    stop(name) {
      if (sfx[name]) safe(() => sfx[name].stop());
    },

    onHide() {
      hidden = true;
      pauseMusic();
      stopAllSfx();
    },
    onShow() {
      hidden = false;
      if (!loaded) api.load();
      applyMusic();
    },
  };

  // phone call / another app took the audio focus
  if (wx.onAudioInterruptionBegin) {
    safe(() =>
      wx.onAudioInterruptionBegin(() => {
        interrupted = true;
        pauseMusic();
        stopAllSfx();
      })
    );
  }
  if (wx.onAudioInterruptionEnd) {
    safe(() =>
      wx.onAudioInterruptionEnd(() => {
        interrupted = false;
        applyMusic();
      })
    );
  }
  return api;
}

module.exports = { createAudio, KEY };
