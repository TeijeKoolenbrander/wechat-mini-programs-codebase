/**
 * V1-4: the 声音 toggle is real. Four original synthesised cues (tools/gen-sounds.js) ship as small WAV files and play
 * through js/audio.js, which honours the mute setting (AC 49).
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { createAudio, CUES } = require('../js/audio');
const { generate, RATE, CUE_NAMES } = require('../tools/gen-sounds');
const { boot, playDraft } = require('./harness');

const GAME = path.join(__dirname, '..');
const SND = path.join(GAME, 'assets', 'sounds');

function fakeWx(log) {
  return {
    createInnerAudioContext() {
      const a = { src: '', stopped: 0, play: () => log.plays.push(a.src), stop: () => a.stopped++, onError: (f) => (a.fail = f) };
      log.ctx.push(a);
      return a;
    },
  };
}
const newLog = () => ({ plays: [], ctx: [] });

test('the cue list is flip, pick, win, loss and matches the generator', () => {
  assert.deepStrictEqual(CUES, ['flip', 'pick', 'win', 'loss']);
  assert.deepStrictEqual(CUE_NAMES, CUES);
});

test('every cue is a small, valid 16-bit mono PCM WAV, 0.1-0.6 s, quiet, and the committed bytes equal the generator output', () => {
  const gen = generate();
  let total = 0;
  for (const name of CUES) {
    const buf = fs.readFileSync(path.join(SND, name + '.wav'));
    total += buf.length;
    assert.ok(buf.equals(gen[name]), name + ' differs from tools/gen-sounds.js: run node tools/gen-sounds.js');
    assert.strictEqual(buf.toString('ascii', 0, 4), 'RIFF');
    assert.strictEqual(buf.toString('ascii', 8, 16), 'WAVEfmt ');
    assert.strictEqual(buf.readUInt16LE(20), 1, 'PCM');
    assert.strictEqual(buf.readUInt16LE(22), 1, 'mono');
    assert.strictEqual(buf.readUInt32LE(24), RATE);
    assert.strictEqual(buf.readUInt16LE(34), 16);
    assert.strictEqual(buf.readUInt32LE(40), buf.length - 44);
    const secs = (buf.length - 44) / 2 / RATE;
    assert.ok(secs >= 0.1 && secs <= 0.6, name + ' ' + secs);
    let peak = 0;
    for (let i = 44; i < buf.length; i += 2) peak = Math.max(peak, Math.abs(buf.readInt16LE(i)));
    assert.ok(peak > 8000 && peak <= 0.55 * 32767, name + ' peak ' + peak);
    assert.ok(buf.length < 16 * 1024, name + ' is small');
  }
  assert.ok(total < 48 * 1024, 'all cues together stay under 48 KB: ' + total);
});

test('the generator is deterministic and the four cues differ', () => {
  const a = generate();
  const b = generate();
  for (const n of CUES) assert.ok(a[n].equals(b[n]));
  assert.strictEqual(new Set(CUES.map((n) => a[n].toString('hex'))).size, 4);
});

test('createAudio: plays assets/sounds/<name>.wav, reuses the context, stops before replaying', () => {
  const log = newLog();
  const au = createAudio(fakeWx(log), false);
  au.play('win');
  au.play('win');
  assert.deepStrictEqual(log.plays, ['assets/sounds/win.wav', 'assets/sounds/win.wav']);
  assert.strictEqual(log.ctx.length, 1);
  assert.ok(log.ctx[0].stopped >= 2);
  au.play('nope');
  assert.strictEqual(log.ctx.length, 1, 'unknown cue names do nothing');
});

test('createAudio: muted plays nothing and creates no context; unmuting works; muting stops what is playing', () => {
  const log = newLog();
  const au = createAudio(fakeWx(log), true);
  au.preload();
  for (const n of CUES) au.play(n);
  assert.strictEqual(log.plays.length, 0);
  assert.strictEqual(log.ctx.length, 0);
  au.setMuted(false);
  au.play('flip');
  assert.deepStrictEqual(log.plays, ['assets/sounds/flip.wav']);
  const before = log.ctx[0].stopped;
  au.setMuted(true);
  assert.ok(log.ctx[0].stopped > before);
  au.play('flip');
  assert.strictEqual(log.plays.length, 1);
});

test('createAudio never throws: no audio API, a throwing context, a load error', () => {
  assert.doesNotThrow(() => createAudio({}, false).play('flip'));
  assert.doesNotThrow(() => createAudio({ createInnerAudioContext() { throw new Error('x'); } }, false).play('flip'));
  const log = newLog();
  const au = createAudio(fakeWx(log), false);
  au.play('pick');
  log.ctx[0].fail({ errCode: 10001 });
  assert.doesNotThrow(() => au.play('pick'));
});

const played = (g) => g.log.calls.filter((c) => c.startsWith('audio.play')).map((c) => JSON.parse(c.slice('audio.play:'.length)).replace('assets/sounds/', '').replace('.wav', ''));

test('wired in the game: flip and pick play per round, the reveal plays one win/loss per battle', async (t) => {
  const g = boot(t);
  await g.settle();
  g.tapId('sheet:close');
  g.tapId('home:free');
  await playDraft(g);
  g.frame();
  assert.strictEqual(g.app.ctl.view().vm.status, 'revealing');
  let seq = played(g);
  assert.strictEqual(seq.filter((n) => n === 'flip').length, 5, 'one flip per round');
  assert.strictEqual(seq.filter((n) => n === 'pick').length, 5, 'one pick per general');
  const battles = g.app.ctl.view().vm.battles;
  const base = seq.length;
  for (let i = 0; i < 12; i++) {
    g.wait(700);
    g.frame();
  }
  seq = played(g).slice(base);
  assert.deepStrictEqual(seq, battles.map((b) => (b.win ? 'win' : 'loss')), 'one cue per battle, in order');
});

test('muted in the game: no cue plays through a whole run, and the toggle is remembered', async (t) => {
  const g = boot(t);
  await g.settle();
  g.tapId('sheet:close');
  g.tapId('home:sound');
  assert.strictEqual(g.app.ctl.view().vm.muted, true);
  g.tapId('home:free');
  await playDraft(g);
  g.frame();
  g.tapId('result:skip');
  assert.deepStrictEqual(played(g), []);
});

test('a skipped reveal plays one verdict cue', async (t) => {
  const g = boot(t);
  await g.settle();
  g.tapId('sheet:close');
  g.tapId('home:free');
  await playDraft(g);
  g.frame();
  const before = played(g).length;
  g.tapId('result:skip');
  const added = played(g).slice(before);
  assert.strictEqual(added.length, 1);
  assert.ok(added[0] === 'win' || added[0] === 'loss');
});
