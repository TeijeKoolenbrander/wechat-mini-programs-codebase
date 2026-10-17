// 传画接龙 shipped assets. Usage: cd tools/assets && npm i && node build-assets.js
//   ../../assets/share-fallback.png  500x400 (5:4), code-drawn in the avatar's style (docs/chuanhua/release/registration/avatar):
//                                    orange field, taped paper note, blue doodle, brush baton, six chain dots. No text, NO user drawings.
//   ../../assets/tick.mp3            the single soft tick at 10 s left (spec 8.4): synthesized, mono 22.05 kHz 48 kbps, ~0.12 s
// Everything is original: shapes and tones are generated here, no third-party art or samples.
const fs = require('fs');
const path = require('path');
const { createCanvas } = require('@napi-rs/canvas');
// lamejs' npm entry point is broken under Node (MPEGMode is not defined); its prebuilt bundle defines a global function.
const lamejs = new Function(fs.readFileSync(require.resolve('lamejs/lame.all.js'), 'utf8') + '\nreturn lamejs;')();

const ASSETS = path.join(__dirname, '..', '..', 'assets');
fs.mkdirSync(ASSETS, { recursive: true });

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ---------- share fallback image ----------
function shareImage() {
  const W = 500;
  const H = 400;
  const c = createCanvas(W, H);
  const ctx = c.getContext('2d');
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#F7B04B');
  bg.addColorStop(1, '#EE8A1F');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // the note, tilted, with a hard offset shadow and tape
  ctx.save();
  ctx.translate(250, 166);
  ctx.rotate((-6 * Math.PI) / 180);
  ctx.fillStyle = 'rgba(168,87,12,0.28)';
  rr(ctx, -150 + 9, -104 + 11, 300, 220, 22);
  ctx.fill();
  ctx.fillStyle = '#FFFDF8';
  rr(ctx, -150, -104, 300, 220, 22);
  ctx.fill();
  ctx.save();
  ctx.translate(0, -104);
  ctx.rotate((3 * Math.PI) / 180);
  ctx.fillStyle = 'rgba(242,201,76,0.92)';
  rr(ctx, -50, -16, 100, 32, 5);
  ctx.fill();
  ctx.restore();

  // a doodle line that drifts and wobbles, with a little sun (our own shapes, not a user drawing)
  ctx.strokeStyle = '#3C78C8';
  ctx.lineWidth = 17;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(-104, 58);
  ctx.bezierCurveTo(-88, -4, -40, -4, -34, 40);
  ctx.bezierCurveTo(-28, 84, 14, 84, 38, 24);
  ctx.bezierCurveTo(62, -28, 88, -30, 96, -8);
  ctx.stroke();
  ctx.strokeStyle = '#D8433B';
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.arc(-92, -52, 16, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // brush-shaped baton crossing the note: bristles, ferrule, handle
  ctx.save();
  ctx.translate(318, 168);
  ctx.rotate((-52 * Math.PI) / 180);
  ctx.scale(0.62, 0.62);
  ctx.fillStyle = '#1E1B18';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(22, -26, 64, -34, 96, -30);
  ctx.lineTo(96, 30);
  ctx.bezierCurveTo(64, 34, 22, 26, 0, 0);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#C9CED6';
  rr(ctx, 96, -32, 54, 64, 8);
  ctx.fill();
  ctx.fillStyle = '#9AA1AB';
  ctx.fillRect(110, -32, 8, 64);
  ctx.fillStyle = '#D8433B';
  ctx.beginPath();
  ctx.moveTo(150, -30);
  ctx.lineTo(350, -18);
  ctx.quadraticCurveTo(372, 0, 350, 18);
  ctx.lineTo(150, 30);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(250,247,240,0.85)';
  ctx.fillRect(196, -25, 18, 50);
  ctx.restore();

  // six baton dots: the chain (alternating a pencil stroke = a drawing and two lines = a sentence), joined by a pen line
  const y = 352;
  const xs = [90, 154, 218, 282, 346, 410];
  ctx.strokeStyle = 'rgba(30,27,24,0.55)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(xs[0], y);
  ctx.lineTo(xs[5], y);
  ctx.stroke();
  xs.forEach((x, i) => {
    ctx.beginPath();
    ctx.arc(x, y, 15, 0, Math.PI * 2);
    ctx.fillStyle = i < 3 ? '#FFFDF8' : 'rgba(255,253,248,0.4)';
    ctx.fill();
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = '#1E1B18';
    ctx.stroke();
    ctx.lineWidth = 3;
    ctx.beginPath();
    if (i % 2 === 0) {
      ctx.moveTo(x - 6, y + 4);
      ctx.quadraticCurveTo(x - 1, y - 8, x + 6, y - 3);
    } else {
      ctx.moveTo(x - 6, y - 3);
      ctx.lineTo(x + 6, y - 3);
      ctx.moveTo(x - 6, y + 4);
      ctx.lineTo(x + 3, y + 4);
    }
    ctx.stroke();
  });
  return c.toBuffer('image/png');
}

// ---------- tick sound ----------
const RATE = 22050;

/** notes: [{f, t0, dur, gain}], each a sine plus a quiet inharmonic partial, 3 ms attack, fast exponential decay. */
function synth(notes, total) {
  const n = Math.round(total * RATE);
  const out = new Float32Array(n);
  notes.forEach((nt) => {
    const s0 = Math.round(nt.t0 * RATE);
    const len = Math.round(nt.dur * RATE);
    for (let i = 0; i < len && s0 + i < n; i++) {
      const t = i / RATE;
      const env = Math.min(1, t / 0.003) * Math.exp((-7 * t) / nt.dur);
      const ph = 2 * Math.PI * nt.f * t;
      out[s0 + i] += nt.gain * env * (Math.sin(ph) + 0.3 * Math.sin(2.76 * ph));
    }
  });
  const fade = Math.round(0.01 * RATE);
  for (let i = 0; i < fade; i++) out[n - 1 - i] *= i / fade;
  return out;
}

function mp3(samples) {
  const enc = new lamejs.Mp3Encoder(1, RATE, 48);
  const pcm = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) pcm[i] = Math.max(-1, Math.min(1, samples[i])) * 0.7 * 32767;
  const parts = [];
  for (let i = 0; i < pcm.length; i += 1152) {
    const b = enc.encodeBuffer(pcm.subarray(i, i + 1152));
    if (b.length) parts.push(Buffer.from(b));
  }
  const tail = enc.flush();
  if (tail.length) parts.push(Buffer.from(tail));
  return Buffer.concat(parts);
}

const files = {
  'share-fallback.png': shareImage(),
  // tick: a soft wooden "tok" (1.3 kHz with a bell-ish partial), 90 ms, quiet
  'tick.mp3': mp3(synth([{ f: 1320, t0: 0, dur: 0.09, gain: 0.55 }], 0.12)),
};
Object.keys(files).forEach((name) => {
  fs.writeFileSync(path.join(ASSETS, name), files[name]);
  console.log(name, files[name].length, 'bytes');
});
