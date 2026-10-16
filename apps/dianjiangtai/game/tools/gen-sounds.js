#!/usr/bin/env node
'use strict';
/**
 * Synthesises the four original sound cues (V1-4) into assets/sounds/*.wav. No samples, no third-party audio: every
 * waveform below is computed here (sines, decaying envelopes and a seeded noise burst), so the files are original and
 * reproducible byte for byte (a test regenerates them and compares).
 *
 *   node tools/gen-sounds.js            write assets/sounds/{flip,pick,win,loss}.wav
 *   node tools/gen-sounds.js --check    exit 1 if the committed files differ from the generator
 *
 * Format: RIFF/WAVE, PCM 16-bit mono, 11025 Hz (supported by wx.createInnerAudioContext on iOS and Android); each cue is
 * 0.2-0.5 s, so the four files together are about 30 KB. Cues: flip (wood-click of the token flip), pick (seal stamp when
 * a general is placed), win and loss (one battle result during the 战报 reveal; win is a rising plucked three-note figure,
 * loss a soft falling two-note figure). Quiet by design (peak about 0.5): no casino sounds (spec section 4).
 */

const fs = require('fs');
const path = require('path');

const RATE = 11025;
const OUT_DIR = path.join(__dirname, '..', 'assets', 'sounds');

function makeNoise(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2147483648 - 1;
  };
}

/** mix a decaying tone into buf at time t0 (seconds). */
function tone(buf, t0, freq, dur, amp, decay, harm2) {
  const start = Math.round(t0 * RATE);
  const n = Math.round(dur * RATE);
  for (let i = 0; i < n && start + i < buf.length; i++) {
    const t = i / RATE;
    const attack = Math.min(1, i / (0.004 * RATE));
    const env = attack * Math.exp(-t * decay);
    const v = Math.sin(2 * Math.PI * freq * t) + (harm2 || 0) * Math.sin(2 * Math.PI * freq * 2 * t);
    buf[start + i] += amp * env * v;
  }
}

/** short filtered-noise click (wood) at t0. */
function click(buf, t0, amp, decay, seed, bright) {
  const noise = makeNoise(seed);
  const start = Math.round(t0 * RATE);
  const n = Math.round(0.05 * RATE);
  let lp = 0;
  for (let i = 0; i < n && start + i < buf.length; i++) {
    const t = i / RATE;
    lp += (noise() - lp) * bright; // one-pole low-pass
    buf[start + i] += amp * Math.exp(-t * decay) * lp;
  }
}

const CUES = {
  flip() {
    const buf = new Float64Array(Math.round(0.26 * RATE));
    click(buf, 0.0, 0.9, 90, 11, 0.55);
    tone(buf, 0.0, 820, 0.09, 0.28, 55, 0.3);
    click(buf, 0.13, 0.7, 100, 29, 0.5);
    tone(buf, 0.13, 640, 0.09, 0.24, 60, 0.3);
    return buf;
  },
  pick() {
    const buf = new Float64Array(Math.round(0.24 * RATE));
    click(buf, 0.0, 0.6, 140, 5, 0.35);
    tone(buf, 0.0, 170, 0.22, 0.6, 22, 0.4);
    tone(buf, 0.0, 340, 0.1, 0.18, 40, 0);
    return buf;
  },
  win() {
    const buf = new Float64Array(Math.round(0.55 * RATE));
    tone(buf, 0.0, 523.25, 0.3, 0.3, 9, 0.25); // C5
    tone(buf, 0.1, 659.25, 0.3, 0.3, 9, 0.25); // E5
    tone(buf, 0.2, 783.99, 0.34, 0.34, 8, 0.25); // G5
    return buf;
  },
  loss() {
    const buf = new Float64Array(Math.round(0.5 * RATE));
    tone(buf, 0.0, 293.66, 0.3, 0.34, 8, 0.15); // D4
    tone(buf, 0.16, 196.0, 0.34, 0.36, 8, 0.15); // G3
    return buf;
  },
};

function toWav(buf) {
  // normalise so the peak is 0.5, with a 5 ms fade-out so no file ends on a click
  let peak = 0;
  for (const v of buf) peak = Math.max(peak, Math.abs(v));
  const g = peak > 0 ? 0.5 / peak : 1;
  const fade = Math.round(0.005 * RATE);
  const n = buf.length;
  const data = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) {
    let v = buf[i] * g;
    if (i > n - fade) v *= (n - i) / fade;
    data.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(v * 32767))), i * 2);
  }
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + data.length, 4);
  h.write('WAVEfmt ', 8);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); // PCM
  h.writeUInt16LE(1, 22); // mono
  h.writeUInt32LE(RATE, 24);
  h.writeUInt32LE(RATE * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write('data', 36);
  h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

function generate() {
  const out = {};
  for (const name of Object.keys(CUES)) out[name] = toWav(CUES[name]());
  return out;
}

if (require.main === module) {
  const files = generate();
  if (process.argv.includes('--check')) {
    let bad = 0;
    for (const [name, buf] of Object.entries(files)) {
      const p = path.join(OUT_DIR, name + '.wav');
      if (!fs.existsSync(p) || !fs.readFileSync(p).equals(buf)) {
        console.error('differs or missing: ' + p);
        bad++;
      }
    }
    process.exit(bad ? 1 : 0);
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const [name, buf] of Object.entries(files)) {
    fs.writeFileSync(path.join(OUT_DIR, name + '.wav'), buf);
    console.log(name + '.wav ' + buf.length + ' bytes');
  }
}

module.exports = { generate, RATE, CUE_NAMES: Object.keys(CUES) };
