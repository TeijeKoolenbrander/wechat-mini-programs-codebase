/**
 * Minimal PNG encoder (RGB, 8 bit) for the server-rendered moderation image (spec 5.4).
 * Pure JS. By default the zlib stream uses *stored* (uncompressed) deflate blocks, so it works
 * everywhere (including the WeChat runtime); a cloud function passes Node's `zlib.deflateSync`
 * to get a 10-40 KB file instead of ~786 KB:
 *
 *   const png = encodePng(rasterize(strokes), { deflate: (buf) => require('zlib').deflateSync(buf) });
 *
 * `crc32` and `adler32` are exported for tests.
 */

let CRC_TABLE = null;

function crcTable() {
  if (CRC_TABLE) return CRC_TABLE;
  CRC_TABLE = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    CRC_TABLE[n] = c >>> 0;
  }
  return CRC_TABLE;
}

function crc32(bytes, start, end) {
  const t = crcTable();
  let c = 0xffffffff;
  for (let i = start || 0; i < (end === undefined ? bytes.length : end); i++) c = t[(c ^ bytes[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function adler32(bytes) {
  let a = 1;
  let b = 0;
  for (let i = 0; i < bytes.length; i++) {
    a = (a + bytes[i]) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

/** zlib stream made of stored blocks. */
function zlibStored(raw) {
  const blocks = Math.max(1, Math.ceil(raw.length / 65535));
  const out = new Uint8Array(2 + raw.length + blocks * 5 + 4);
  let o = 0;
  out[o++] = 0x78;
  out[o++] = 0x01;
  for (let i = 0; i < blocks; i++) {
    const start = i * 65535;
    const len = Math.min(65535, raw.length - start);
    out[o++] = i === blocks - 1 ? 1 : 0;
    out[o++] = len & 255;
    out[o++] = len >>> 8;
    out[o++] = ~len & 255;
    out[o++] = (~len >>> 8) & 255;
    out.set(raw.subarray(start, start + len), o);
    o += len;
  }
  const ad = adler32(raw);
  out[o++] = ad >>> 24;
  out[o++] = (ad >>> 16) & 255;
  out[o++] = (ad >>> 8) & 255;
  out[o++] = ad & 255;
  return out;
}

function u32(n) {
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
}

/** raster = { width, height, data: RGB bytes }. opts.deflate(Uint8Array) -> zlib stream bytes (optional). Returns Uint8Array. */
function encodePng(raster, opts) {
  const { width, height, data } = raster;
  const raw = new Uint8Array((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0; // filter: none
    raw.set(data.subarray(y * width * 3, (y + 1) * width * 3), y * (width * 3 + 1) + 1);
  }
  const z = opts && opts.deflate ? Uint8Array.from(opts.deflate(raw)) : zlibStored(raw);
  const chunks = [];
  function chunk(type, body) {
    const buf = new Uint8Array(12 + body.length);
    buf.set(u32(body.length), 0);
    for (let i = 0; i < 4; i++) buf[4 + i] = type.charCodeAt(i);
    buf.set(body, 8);
    buf.set(u32(crc32(buf, 4, 8 + body.length)), 8 + body.length);
    chunks.push(buf);
  }
  chunk('IHDR', Uint8Array.from([...u32(width), ...u32(height), 8, 2, 0, 0, 0]));
  chunk('IDAT', z);
  chunk('IEND', new Uint8Array(0));
  const sig = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
  let total = sig.length;
  for (const c of chunks) total += c.length;
  const out = new Uint8Array(total);
  out.set(sig, 0);
  let o = sig.length;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

module.exports = { encodePng, crc32, adler32, zlibStored };
