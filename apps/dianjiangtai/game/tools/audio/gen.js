/**
 * Procedural audio for 点将台. Everything is synthesised here from scratch (no samples, no existing tunes):
 *   bgm   quiet looping 古琴 + 琵琶 piece, original melody on the 五声 scale (宫商角徵羽 = D E F# A B)
 *   flip  wood on lacquer (two short damped taps)
 *   drum  twelve 战鼓 hits, one per battle of the reveal (REVEAL_MS = 700 ms apart)
 *   bell  one 编钟 strike (12-0)
 *   tap   soft UI tap
 * Original, procedurally generated, (c) studio. Deterministic (seeded noise): same input, same bytes.
 *
 *   npm install && node gen.js            writes ../../audio/*.mp3
 *   node gen.js --wav                      also writes .wav next to them (listening / debugging)
 */
'use strict';
const fs = require('fs');
const path = require('path');
// lamejs's package entry is broken under Node (MPEGMode is not defined); the bundled build works when evaluated.
const lamejs = (() => {
  const m = { exports: {} };
  new Function('module', fs.readFileSync(require.resolve('lamejs/lame.all.js'), 'utf8') + '\n;module.exports = lamejs;')(m);
  return m.exports;
})();

const SR = 22050;
const OUT = path.join(__dirname, '..', '..', 'audio');

// ---------------------------------------------------------------- basics
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const R = rng(20261015);
const noise = () => R() * 2 - 1;
const buf = (sec) => new Float32Array(Math.round(sec * SR));

/** RBJ biquad over a Float32Array (in place copy) */
function biquad(x, type, f0, Q) {
  const w = (2 * Math.PI * f0) / SR;
  const al = Math.sin(w) / (2 * Q);
  const cs = Math.cos(w);
  let b0, b1, b2;
  const a0 = 1 + al, a1 = -2 * cs, a2 = 1 - al;
  if (type === 'lp') { b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = b0; }
  else if (type === 'hp') { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = b0; }
  else { b0 = al; b1 = 0; b2 = -al; } // bp (constant 0 dB peak)
  const y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = (b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v;
    y[i] = v;
  }
  return y;
}

function addInto(dst, src, at, gain, wrap) {
  const n = dst.length;
  for (let i = 0; i < src.length; i++) {
    let j = at + i;
    if (j >= n) { if (!wrap) break; j %= n; }
    dst[j] += src[i] * gain;
  }
}

function normalize(x, peak) {
  let m = 0;
  for (let i = 0; i < x.length; i++) m = Math.max(m, Math.abs(x[i]));
  const g = m > 0 ? peak / m : 1;
  for (let i = 0; i < x.length; i++) x[i] *= g;
  return x;
}

/** small Schroeder reverb; runs twice over the buffer so a looped file's tail wraps seamlessly */
function reverb(x, wet, loop) {
  const combs = [1116, 1188, 1277, 1356].map((d) => ({ d: Math.round(d * SR / 44100), b: null, i: 0 }));
  combs.forEach((c) => (c.b = new Float32Array(c.d)));
  const aps = [225, 556].map((d) => ({ d: Math.round(d * SR / 44100), b: null, i: 0 }));
  aps.forEach((c) => (c.b = new Float32Array(c.d)));
  const fb = 0.84, damp = 0.35;
  const out = new Float32Array(x.length);
  const passes = loop ? 2 : 1;
  const lp = combs.map(() => 0);
  for (let p = 0; p < passes; p++) {
    for (let n = 0; n < x.length; n++) {
      const inp = x[n] * 0.2;
      let s = 0;
      for (let k = 0; k < combs.length; k++) {
        const c = combs[k];
        const o = c.b[c.i];
        lp[k] = o * (1 - damp) + lp[k] * damp;
        c.b[c.i] = inp + lp[k] * fb;
        c.i = (c.i + 1) % c.d;
        s += o;
      }
      for (const a of aps) {
        const o = a.b[a.i];
        a.b[a.i] = s + o * 0.5;
        a.i = (a.i + 1) % a.d;
        s = o - s * 0.5; // Schroeder allpass
      }
      if (p === passes - 1) out[n] = x[n] + s * wet;
    }
  }
  return out;
}

// ---------------------------------------------------------------- instruments
/** Karplus-Strong string with an optional pitch glide (滑音). f in Hz, t60 in seconds. */
function pluck(f, dur, o) {
  o = o || {};
  const N = Math.round(dur * SR);
  const y = new Float32Array(N);
  const glide = o.glide || 0; // semitones below the target at the start
  const gt = o.glideT || 0.22;
  const fAt = (n) => f * Math.pow(2, -glide * Math.max(0, 1 - n / SR / gt) / 12);
  const L0 = Math.ceil(SR / fAt(0)) + 2;
  // excitation: noise, low-passed for a softer attack, comb-shaped by the pluck position
  let exc = new Float32Array(L0);
  for (let i = 0; i < L0; i++) exc[i] = noise();
  exc = biquad(exc, 'lp', o.excLp || 2500, 0.7);
  const pos = Math.max(2, Math.round(L0 * (o.pos || 0.2)));
  for (let i = L0 - 1; i >= pos; i--) exc[i] -= exc[i - pos] * 0.8;
  let mean = 0;
  for (let i = 0; i < L0; i++) mean += exc[i];
  mean /= L0;
  for (let i = 0; i < L0; i++) y[i] = (exc[i] - mean) * 0.9;
  const w = o.bright == null ? 0.55 : o.bright;
  const t60 = o.t60 || 3;
  for (let n = L0; n < N; n++) {
    const fr = fAt(n);
    const L = SR / fr;
    const g = Math.pow(10, -3 / (t60 * fr));
    const pp = n - L;
    const i = Math.floor(pp);
    const fc = pp - i;
    const a = y[i] * (1 - fc) + y[i + 1] * fc;
    const b = y[i - 1] * (1 - fc) + y[i] * fc;
    y[n] = g * (w * a + (1 - w) * b);
  }
  // soft onset (1.5 ms) and release so every note starts and ends cleanly
  const on = Math.round(0.0015 * SR);
  for (let i = 0; i < on; i++) y[i] *= i / on;
  const rel = Math.min(N, Math.round(0.15 * SR));
  for (let i = 0; i < rel; i++) y[N - 1 - i] *= i / rel;
  // wooden body: a gentle resonance around the fundamental's 3rd harmonic region
  return y;
}

const guqin = (f, dur, o) => pluck(f, dur, Object.assign({ t60: 4.2, bright: 0.52, excLp: 1400, pos: 0.13 }, o));
const pipa = (f, dur, o) => pluck(f, dur, Object.assign({ t60: 1.4, bright: 0.72, excLp: 5200, pos: 0.18 }, o));

// ---------------------------------------------------------------- the piece
const BPM = 56;
const BEAT = 60 / BPM;
const BARS = 16;
const TOTAL = BARS * 4 * BEAT; // 68.57 s
const D3 = 146.8324;
const PENTA = [0, 2, 4, 7, 9]; // 宫 商 角 徵 羽 in semitones
/** degree 0 = 宫 (D3); 5 = D4; -5 = D2 */
function freq(deg) {
  const oct = Math.floor(deg / 5);
  const s = PENTA[((deg % 5) + 5) % 5] + 12 * oct;
  return D3 * Math.pow(2, s / 12);
}

// [beat in bar, degree, glide semitones (optional)] per bar. Original phrases A A' B A''.
const MELODY = [
  // A
  [[0, 0], [2, 3], [3, 4]],
  [[0, 5, 2], [2.5, 4], [3, 3]],
  [[0, 2], [1.5, 3], [2, 1]],
  [[0, 0], [3, -2]],
  // A'
  [[0, 0], [1, 1], [2, 3], [3.5, 5]],
  [[0, 6], [2, 5], [3, 4]],
  [[0, 3, 2], [2, 4], [3, 3]],
  [[0, 1], [2, 0], [3.5, -2]],
  // B (higher, brighter)
  [[0, 8], [1.5, 7], [2, 5], [3, 6]],
  [[0, 7], [2, 5], [3, 4]],
  [[0, 3], [1, 4], [2, 5], [3, 7]],
  [[0, 6], [2, 4, 2], [3, 3]],
  // A'' (closing)
  [[0, 5], [1, 4], [2, 3], [3, 4]],
  [[0, 3], [2, 1], [3, 2]],
  [[0, 1], [2, 0]],
  [[0, 0], [2.5, -2]],
];
// 琵琶 chord tones per bar (degrees), plucked on the off-beats
const PIPA_TONES = [[0, 3], [0, 3], [2, 4], [0, 3], [0, 3], [1, 4], [0, 3], [0, 2], [3, 5], [3, 5], [2, 4], [3, 6], [3, 5], [1, 3], [0, 2], [0, 3]];

function music() {
  const N = Math.round(TOTAL * SR);
  const mix = new Float32Array(N);
  const at = (bar, beat) => Math.round((bar * 4 + beat) * BEAT * SR);
  MELODY.forEach((notes, bar) => {
    notes.forEach(([beat, deg, gl]) => {
      const dur = deg <= -2 ? 6 : 5;
      addInto(mix, guqin(freq(deg), dur, { glide: gl || 0 }), at(bar, beat), 0.9, true);
    });
    // 散音 drone on the first beat of each phrase: open 宫 string an octave below
    if (bar % 4 === 0) addInto(mix, guqin(freq(-5), 7, { t60: 6, bright: 0.45 }), at(bar, 0), 0.5, true);
  });
  PIPA_TONES.forEach((tones, bar) => {
    const busy = bar >= 8 && bar < 12;
    const grid = busy ? [0.5, 1, 1.5, 2.5, 3, 3.5] : [0.5, 1.5, 2.5, 3.5];
    grid.forEach((beat, k) => {
      const deg = tones[k % tones.length] + 5 + (k % 3 === 2 ? 0 : 0);
      addInto(mix, pipa(freq(deg), 1.8), at(bar, beat), busy ? 0.34 : 0.22, true);
    });
  });
  return normalize(reverb(mix, 0.5, true), 0.85);
}

// ---------------------------------------------------------------- effects
const env = (n, tau) => Math.exp(-n / SR / tau);

function flip() {
  const out = buf(0.35);
  function click(at, amp, base) {
    const len = Math.round(0.12 * SR);
    const nz = new Float32Array(len);
    for (let i = 0; i < len; i++) nz[i] = noise() * env(i, 0.004);
    const nb = biquad(nz, 'bp', 2400 * base, 1.2);
    for (let i = 0; i < len; i++) {
      const t = i / SR;
      const ring = Math.sin(2 * Math.PI * 360 * base * t) * env(i, 0.03) + 0.6 * Math.sin(2 * Math.PI * 790 * base * t) * env(i, 0.018) + 0.35 * Math.sin(2 * Math.PI * 1310 * base * t) * env(i, 0.009);
      out[at + i] += (nb[i] * 1.6 + ring * 0.55) * amp;
    }
  }
  click(0, 1, 1);
  click(Math.round(0.085 * SR), 0.6, 1.12);
  return normalize(out, 0.8);
}

function drum() {
  const hits = 12;
  const gap = 0.7;
  const out = buf(hits * gap + 1.4);
  function hit(at, amp) {
    const len = Math.round(1.1 * SR);
    let ph = 0;
    const nz = new Float32Array(len);
    for (let i = 0; i < len; i++) nz[i] = noise() * env(i, 0.012);
    const skin = biquad(nz, 'lp', 520, 0.8);
    for (let i = 0; i < len; i++) {
      const t = i / SR;
      const f = 52 + 46 * Math.exp(-t / 0.09);
      ph += (2 * Math.PI * f) / SR;
      const body = Math.sin(ph) * env(i, 0.2) + 0.3 * Math.sin(ph * 1.6 + 0.4) * env(i, 0.09);
      out[at + i] += (body * 0.9 + skin[i] * 2.2) * amp;
    }
  }
  const accents = [1, 0.55, 0.7, 0.55];
  for (let k = 0; k < hits; k++) hit(Math.round(k * gap * SR), k === hits - 1 ? 1.25 : accents[k % 4] * (0.8 + 0.2 * (k / hits)));
  return normalize(biquad(out, 'hp', 30, 0.7), 0.85);
}

function bell() {
  const out = buf(4.2);
  const f0 = 293.66; // D4, the 宫 an octave up
  // [ratio, amp, t60]: a bronze 编钟 is inharmonic and rings two tones (the 1.19 pair is the 一钟双音 minor third)
  const P = [[1, 1, 3.6], [1.0035, 0.8, 3.2], [1.19, 0.75, 3.0], [1.195, 0.5, 2.6], [2.0, 0.55, 2.2], [2.38, 0.38, 1.8], [3.01, 0.26, 1.2], [4.2, 0.17, 0.9], [5.43, 0.1, 0.6], [6.8, 0.06, 0.4]];
  for (const [r, a, t60] of P) {
    const w = (2 * Math.PI * f0 * r) / SR;
    const tau = t60 / 6.9;
    for (let i = 0; i < out.length; i++) {
      const att = Math.min(1, i / (0.0025 * SR));
      out[i] += Math.sin(w * i) * a * att * env(i, tau);
    }
  }
  const nz = buf(0.05);
  for (let i = 0; i < nz.length; i++) nz[i] = noise() * env(i, 0.006);
  const strike = biquad(nz, 'bp', 1800, 0.9);
  for (let i = 0; i < strike.length; i++) out[i] += strike[i] * 1.1;
  const tail = Math.round(0.4 * SR);
  for (let i = 0; i < tail; i++) out[out.length - 1 - i] *= i / tail;
  return normalize(reverb(out, 0.25, false), 0.8);
}

function tap() {
  const out = buf(0.1);
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    out[i] = (Math.sin(2 * Math.PI * 520 * t) * env(i, 0.014) + 0.4 * Math.sin(2 * Math.PI * 1040 * t) * env(i, 0.007)) * Math.min(1, i / (0.001 * SR));
  }
  const nz = buf(0.1);
  for (let i = 0; i < nz.length; i++) nz[i] = noise() * env(i, 0.002);
  const c = biquad(nz, 'lp', 3000, 0.7);
  for (let i = 0; i < out.length; i++) out[i] += c[i] * 0.5;
  return normalize(out, 0.5);
}

// ---------------------------------------------------------------- encode
function toInt16(x) {
  const o = new Int16Array(x.length);
  for (let i = 0; i < x.length; i++) o[i] = Math.max(-32768, Math.min(32767, Math.round(x[i] * 32767)));
  return o;
}
function mp3(x, kbps) {
  const enc = new lamejs.Mp3Encoder(1, SR, kbps);
  const pcm = toInt16(x);
  const parts = [];
  for (let i = 0; i < pcm.length; i += 1152) {
    const b = enc.encodeBuffer(pcm.subarray(i, i + 1152));
    if (b.length) parts.push(Buffer.from(b));
  }
  const f = enc.flush();
  if (f.length) parts.push(Buffer.from(f));
  return Buffer.concat(parts);
}
function wav(x) {
  const pcm = toInt16(x);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length * 2, 4); h.write('WAVEfmt ', 8);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(SR, 24);
  h.writeUInt32LE(SR * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length * 2, 40);
  return Buffer.concat([h, Buffer.from(pcm.buffer)]);
}

const JOBS = [
  ['bgm', music, 48],
  ['flip', flip, 48],
  ['drum', drum, 48],
  ['bell', bell, 48],
  ['tap', tap, 48],
];

if (require.main === module) {
  fs.mkdirSync(OUT, { recursive: true });
  for (const [name, fn, kbps] of JOBS) {
    const x = fn();
    const m = mp3(x, kbps);
    fs.writeFileSync(path.join(OUT, name + '.mp3'), m);
    if (process.argv.includes('--wav')) fs.writeFileSync(path.join(OUT, name + '.wav'), wav(x));
    console.log(name.padEnd(5), (x.length / SR).toFixed(2) + ' s', m.length + ' bytes');
  }
}

module.exports = { music, flip, drum, bell, tap, freq, SR, BPM, TOTAL };
