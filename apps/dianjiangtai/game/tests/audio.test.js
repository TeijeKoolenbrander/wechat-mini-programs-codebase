'use strict';
// js/audio.js against a fake wx: toggles persist, mute stops everything, fades, hide/show, interruptions, silent failure.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createAudio } = require('../js/audio');

function fakeWx(o) {
  o = o || {};
  const storage = o.storage || {};
  const ctxs = [];
  const handlers = {};
  const wx = {
    storage,
    ctxs,
    handlers,
    loads: [],
    getStorageSync: (k) => storage[k],
    setStorageSync: (k, v) => {
      storage[k] = v;
    },
    createInnerAudioContext() {
      if (o.noContext) throw new Error('no audio');
      const c = { src: '', loop: false, volume: 1, playing: false, plays: 0, stops: 0, pauses: 0, play() { this.playing = true; this.plays++; }, stop() { this.playing = false; this.stops++; }, pause() { this.playing = false; this.pauses++; }, onError() {} };
      ctxs.push(c);
      return c;
    },
    loadSubpackage(opt) {
      wx.loads.push(opt.name);
      if (o.loadFails) opt.fail({ errMsg: 'fail' });
      else opt.success({});
    },
    onAudioInterruptionBegin: (f) => (handlers.begin = f),
    onAudioInterruptionEnd: (f) => (handlers.end = f),
  };
  return wx;
}
const bySrc = (wx, name) => wx.ctxs.find((c) => c.src === 'audio/' + name + '.mp3');

function ready(t, o) {
  t.mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
  const wx = fakeWx(o);
  const a = createAudio(wx, o && o.opts);
  a.load();
  return { wx, a };
}

test('defaults: both channels on, nothing starts before the subpackage has loaded', (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const wx = fakeWx();
  const a = createAudio(wx);
  assert.deepEqual([a.musicOn, a.sfxOn, a.muted], [true, true, false]);
  a.setScene('music');
  a.play('flip');
  assert.equal(wx.ctxs.length, 0, 'unloaded audio is silent');
  assert.deepEqual(wx.loads, []);
  a.load();
  assert.deepEqual(wx.loads, ['audio']);
  assert.ok(bySrc(wx, 'bgm').playing, 'music starts once loaded because the scene wants it');
});

test('toggles persist and are read back by a new instance; legacy muted flag migrates only when nothing is saved', (t) => {
  const { wx, a } = ready(t);
  a.setMusicOn(false);
  assert.deepEqual(wx.storage.djt_audio_v1, { music: false, sfx: true });
  a.setSfxOn(false);
  const b = createAudio(wx);
  assert.deepEqual([b.musicOn, b.sfxOn, b.muted], [false, false, true]);
  const c = createAudio(fakeWx(), { legacyMuted: true });
  assert.deepEqual([c.musicOn, c.sfxOn], [false, false]);
  assert.equal(createAudio(fakeWx(), true).muted, true, 'boolean argument is the legacy flag');
  const d = createAudio(fakeWx({ storage: { djt_audio_v1: { music: true, sfx: false } } }), { legacyMuted: true });
  assert.deepEqual([d.musicOn, d.sfxOn], [true, false], 'saved choice wins over the legacy flag');
});

test('music fades in to a low volume, fades out for the reveal and pauses, then comes back', (t) => {
  const { wx, a } = ready(t);
  a.setScene('music');
  const m = bySrc(wx, 'bgm');
  assert.equal(m.loop, true);
  assert.equal(m.volume, 0, 'starts silent');
  t.mock.timers.tick(600);
  assert.ok(m.volume > 0 && m.volume < 0.3, 'mid fade ' + m.volume);
  t.mock.timers.tick(1000);
  assert.ok(Math.abs(m.volume - 0.3) < 1e-9 && m.volume <= 0.35, 'low final volume');
  a.setScene('quiet'); // battle reveal
  assert.ok(m.playing, 'still audible while fading');
  t.mock.timers.tick(300);
  assert.ok(m.volume < 0.3 && m.volume > 0);
  t.mock.timers.tick(600);
  assert.equal(m.volume, 0);
  assert.equal(m.playing, false, 'paused at the end of the fade');
  a.setScene('music');
  assert.ok(m.playing, 'resumes the same context');
  assert.equal(wx.ctxs.filter((c) => c.src.endsWith('bgm.mp3')).length, 1);
});

test('mute is immediate: music stops at once, effects stop and stay silent; unmuting brings music back', (t) => {
  const { wx, a } = ready(t);
  a.setScene('music');
  t.mock.timers.tick(2000);
  a.play('drum');
  const m = bySrc(wx, 'bgm');
  const d = bySrc(wx, 'drum');
  assert.ok(m.playing && d.playing);
  a.setMuted(true);
  assert.equal(m.playing, false);
  assert.equal(d.playing, false);
  assert.equal(a.state().fading, false);
  const before = wx.ctxs.map((c) => c.plays);
  a.play('flip');
  a.play('bell');
  a.setScene('quiet');
  a.setScene('music');
  t.mock.timers.tick(5000);
  assert.deepEqual(wx.ctxs.slice(0, before.length).map((c) => c.plays), before, 'nothing plays while muted');
  assert.equal(wx.ctxs.length, before.length, 'no new contexts while muted');
  a.setMuted(false);
  assert.ok(m.playing);
});

test('one channel off leaves the other running', (t) => {
  const { wx, a } = ready(t);
  a.setScene('music');
  a.setMusicOn(false);
  assert.equal(bySrc(wx, 'bgm').playing, false);
  a.play('tap');
  assert.ok(bySrc(wx, 'tap').playing, 'effects still sound');
  a.setMusicOn(true);
  a.setSfxOn(false);
  a.play('flip');
  assert.equal(bySrc(wx, 'flip'), undefined);
  assert.ok(bySrc(wx, 'bgm').playing);
  assert.equal(a.muted, false);
});

test('effects: only the four known cues, restart on repeat, stop(name) ends one, played counter counts', (t) => {
  const { wx, a } = ready(t);
  a.play('nonsense');
  assert.equal(wx.ctxs.length, 0);
  a.play('flip');
  a.play('flip');
  const f = bySrc(wx, 'flip');
  assert.equal(f.plays, 2);
  assert.equal(a.played, 2);
  a.play('drum');
  a.stop('drum');
  assert.equal(bySrc(wx, 'drum').playing, false);
});

test('wx.onHide pauses everything and onShow resumes the music; hidden effects are dropped', (t) => {
  const { wx, a } = ready(t);
  a.setScene('music');
  t.mock.timers.tick(2000);
  a.play('bell');
  a.onHide();
  assert.equal(bySrc(wx, 'bgm').playing, false);
  assert.equal(bySrc(wx, 'bgm').pauses, 1, 'paused, not stopped: resumes where it was');
  assert.equal(bySrc(wx, 'bell').playing, false);
  a.play('flip');
  assert.equal(bySrc(wx, 'flip'), undefined);
  a.onShow();
  assert.equal(bySrc(wx, 'bgm').playing, true);
  a.setMusicOn(false);
  a.onHide();
  a.onShow();
  assert.equal(bySrc(wx, 'bgm').playing, false, 'a muted player is not un-muted by returning to the app');
});

test('audio interruption (call, other app) pauses and resumes', (t) => {
  const { wx, a } = ready(t);
  a.setScene('music');
  t.mock.timers.tick(2000);
  assert.ok(wx.handlers.begin && wx.handlers.end);
  wx.handlers.begin();
  assert.equal(bySrc(wx, 'bgm').playing, false);
  a.play('flip');
  assert.equal(bySrc(wx, 'flip'), undefined);
  wx.handlers.end();
  assert.equal(bySrc(wx, 'bgm').playing, true);
});

test('failures are silent: subpackage fails, no audio context, throwing context, missing wx hooks', (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const w1 = fakeWx({ loadFails: true });
  const a1 = createAudio(w1);
  a1.setScene('music');
  a1.load();
  a1.play('flip');
  assert.equal(a1.loaded, false);
  assert.equal(w1.ctxs.length, 0);
  w1.loadSubpackage = (opt) => opt.success({});
  a1.onShow(); // retries
  assert.equal(a1.loaded, true);
  assert.ok(bySrc(w1, 'bgm').playing);

  const a2 = createAudio(fakeWx({ noContext: true }));
  a2.load();
  a2.setScene('music');
  a2.play('bell');
  a2.setMuted(true);
  a2.onHide();
  a2.onShow();

  const w3 = fakeWx();
  w3.createInnerAudioContext = () => ({ play() { throw new Error('boom'); }, stop() { throw new Error('boom'); }, pause() { throw new Error('boom'); } });
  const a3 = createAudio(w3);
  a3.load();
  a3.setScene('music');
  a3.play('flip');
  a3.setMuted(true);

  const a4 = createAudio({});
  a4.load();
  a4.play('flip');
  a4.setScene('music');
  a4.onHide();
  assert.equal(a4.muted, false);
});
