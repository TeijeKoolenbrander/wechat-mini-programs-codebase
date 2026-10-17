'use strict';
// strokes -> the 512 x 512 PNG that mediaCheckAsync checks (spec 5.4, 6.3 step 2). Wraps core/raster.js (pure JS, shared
// geometry with the client renderer) and ./png.js (zlib). `../core` exists after scripts/sync-core.js copies it in.
const strokes = require('../core/strokes');
const { rasterize } = require('../core/raster');
const { encodePng } = require('./png');
const { CONFIG } = require('../core/config');

/**
 * Server-side ink budget (TD-24, TD-56): total path length of all strokes, in grid units (1 unit = 1/1024 of the canvas
 * width). It lives in core (CONFIG.strokes.maxPathUnits, checked by core/strokes.validate with reason 'pathLength') so the
 * client recorder, the mock and these functions stop at the same line. 250,000 units is about 240 canvas widths of ink,
 * several times what a 60 s drawing produces, and keeps the hostile worst case under 800 ms (tests/raster-limit.test.js).
 */
const MAX_PATH_UNITS = CONFIG.strokes.maxPathUnits;
const pathLength = strokes.pathLength;

/** core validation, which includes the path-length budget. @returns {{ok:true}|{ok:false, reason:string}} */
function validateDrawing(drawing) {
  return strokes.validate(drawing);
}

/**
 * Validate, rasterise and encode. Never throws for bad input.
 * @param {*} drawing wire-format strokes from the client (untrusted)
 * @param {number} [size] default 512
 * @returns {{ok:true, png:Buffer, width:number, height:number, ms:number} | {ok:false, code:'INVALID_STROKES', reason:string}}
 */
function strokesToPng(drawing, size) {
  const v = validateDrawing(drawing);
  if (!v.ok) return { ok: false, code: 'INVALID_STROKES', reason: v.reason };
  const t0 = Date.now();
  const img = rasterize(drawing, { size: size || CONFIG.raster.size });
  const png = encodePng(img);
  return { ok: true, png, width: img.width, height: img.height, ms: Date.now() - t0 };
}

module.exports = { strokesToPng, validateDrawing, pathLength, MAX_PATH_UNITS };
