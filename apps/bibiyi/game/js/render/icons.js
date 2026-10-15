/**
 * Category icons drawn in code (direction 6): no image files, no likeness of
 * any real building, no maps, nothing to license. Every icon is a few canvas
 * paths inside a square of side `size` centred on (cx, cy), stroked in one
 * colour. Pure.
 *
 * Keys: logic puts a category or measure key in CardFace.icon; ALIASES maps
 * every spec key to a drawing. Unknown keys fall back to a plain diamond.
 */

const ALIASES = {
  city: 'blocks',
  city_pop: 'blocks',
  prov_pop: 'blocks',
  geo: 'mountain',
  mountain: 'mountain',
  river: 'river',
  lake: 'lake',
  era: 'pagoda',
  year: 'pagoda',
  animal: 'paw',
  animal_weight: 'paw',
  animal_life: 'paw',
  space: 'planet',
  space_diameter: 'planet',
  build: 'bridge',
  structure_len: 'bridge',
  structure_height: 'tower',
  food: 'bowl',
  food_kcal: 'bowl',
  dist: 'compass',
  distance: 'compass',
};

function begin(ctx, color, lw) {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = lw;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
}

function circle(ctx, x, y, r, fill) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  if (fill) ctx.fill();
  else ctx.stroke();
}

function ellipse(ctx, x, y, rx, ry, rot, fill) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot || 0);
  ctx.scale(1, ry / rx);
  ctx.beginPath();
  ctx.arc(0, 0, rx, 0, Math.PI * 2);
  ctx.restore();
  if (fill) ctx.fill();
  else ctx.stroke();
}

const DRAW = {
  blocks(ctx, h) {
    // three building blocks of different heights, with window dots
    ctx.strokeRect(-h * 0.85, -h * 0.05, h * 0.5, h * 0.9);
    ctx.strokeRect(-h * 0.3, -h * 0.85, h * 0.6, h * 1.7);
    ctx.strokeRect(h * 0.35, -h * 0.35, h * 0.5, h * 1.2);
    [-0.5, -0.15, 0.2, 0.55].forEach((y) => {
      ctx.fillRect(-h * 0.1, h * y - h * 0.05, h * 0.08, h * 0.1);
      ctx.fillRect(h * 0.1, h * y - h * 0.05, h * 0.08, h * 0.1);
    });
  },
  mountain(ctx, h) {
    ctx.beginPath();
    ctx.moveTo(-h * 0.95, h * 0.7);
    ctx.lineTo(-h * 0.25, -h * 0.55);
    ctx.lineTo(h * 0.2, h * 0.2);
    ctx.lineTo(h * 0.5, -h * 0.2);
    ctx.lineTo(h * 0.95, h * 0.7);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath(); // snow line
    ctx.moveTo(-h * 0.5, -h * 0.1);
    ctx.lineTo(-h * 0.25, h * 0.08);
    ctx.lineTo(-h * 0.02, -h * 0.12);
    ctx.stroke();
  },
  river(ctx, h) {
    [-0.55, 0, 0.55].forEach((y) => {
      ctx.beginPath();
      for (let i = 0; i <= 16; i++) {
        const x = -h * 0.95 + (i / 16) * h * 1.9;
        const yy = h * y + Math.sin((i / 16) * Math.PI * 3) * h * 0.2;
        if (i === 0) ctx.moveTo(x, yy);
        else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    });
  },
  lake(ctx, h) {
    ellipse(ctx, 0, 0, h * 0.95, h * 0.62, 0, false);
    ctx.beginPath();
    ctx.moveTo(-h * 0.45, -h * 0.1);
    ctx.quadraticCurveTo(-h * 0.25, -h * 0.28, 0, -h * 0.1);
    ctx.quadraticCurveTo(h * 0.25, h * 0.08, h * 0.45, -h * 0.1);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-h * 0.3, h * 0.25);
    ctx.quadraticCurveTo(-h * 0.1, h * 0.1, h * 0.1, h * 0.25);
    ctx.quadraticCurveTo(h * 0.25, h * 0.35, h * 0.35, h * 0.25);
    ctx.stroke();
  },
  pagoda(ctx, h) {
    // three tiers of upswept roofs on a spire
    ctx.beginPath();
    ctx.moveTo(0, -h * 0.98);
    ctx.lineTo(0, -h * 0.7);
    ctx.stroke();
    [
      [-0.7, 0.42],
      [-0.2, 0.62],
      [0.3, 0.84],
    ].forEach((t) => {
      const y = h * t[0];
      const w = h * t[1];
      ctx.beginPath();
      ctx.moveTo(-w - h * 0.12, y + h * 0.12);
      ctx.quadraticCurveTo(-w * 0.4, y + h * 0.14, 0, y - h * 0.1);
      ctx.quadraticCurveTo(w * 0.4, y + h * 0.14, w + h * 0.12, y + h * 0.12);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-w * 0.62, y + h * 0.12);
      ctx.lineTo(-w * 0.62, y + h * 0.4);
      ctx.moveTo(w * 0.62, y + h * 0.12);
      ctx.lineTo(w * 0.62, y + h * 0.4);
      ctx.stroke();
    });
    ctx.beginPath();
    ctx.moveTo(-h * 0.9, h * 0.9);
    ctx.lineTo(h * 0.9, h * 0.9);
    ctx.stroke();
  },
  bridge(ctx, h) {
    ctx.beginPath(); // deck
    ctx.moveTo(-h, h * 0.15);
    ctx.lineTo(h, h * 0.15);
    ctx.stroke();
    ctx.beginPath(); // arch under the deck
    ctx.arc(0, h * 0.15, h * 0.7, 0, Math.PI);
    ctx.stroke();
    ctx.beginPath(); // arch over the deck (suspension feel)
    ctx.arc(0, h * 0.15, h * 0.7, Math.PI, Math.PI * 2);
    ctx.stroke();
    [-0.45, 0, 0.45].forEach((x) => {
      ctx.beginPath();
      ctx.moveTo(h * x, h * 0.15);
      ctx.lineTo(h * x, h * 0.15 - Math.sqrt(Math.max(0, 0.49 - x * x)) * h);
      ctx.stroke();
    });
  },
  tower(ctx, h) {
    ctx.beginPath();
    ctx.moveTo(-h * 0.45, h * 0.95);
    ctx.lineTo(-h * 0.14, -h * 0.35);
    ctx.lineTo(h * 0.14, -h * 0.35);
    ctx.lineTo(h * 0.45, h * 0.95);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -h * 0.35);
    ctx.lineTo(0, -h * 0.98);
    ctx.moveTo(-h * 0.3, h * 0.3);
    ctx.lineTo(h * 0.3, h * 0.3);
    ctx.moveTo(-h * 0.22, -h * 0.05);
    ctx.lineTo(h * 0.22, -h * 0.05);
    ctx.stroke();
  },
  planet(ctx, h) {
    circle(ctx, 0, 0, h * 0.52, false);
    ellipse(ctx, 0, 0, h * 1.0, h * 0.3, -0.35, false);
    circle(ctx, h * 0.8, -h * 0.65, h * 0.08, true);
  },
  bowl(ctx, h) {
    ctx.beginPath();
    ctx.moveTo(-h * 0.9, -h * 0.05);
    ctx.lineTo(h * 0.9, -h * 0.05);
    ctx.arc(0, -h * 0.05, h * 0.9, 0, Math.PI);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-h * 0.35, h * 0.95);
    ctx.lineTo(h * 0.35, h * 0.95);
    ctx.stroke();
    [-0.4, 0, 0.4].forEach((x) => {
      ctx.beginPath();
      ctx.moveTo(h * x, -h * 0.3);
      ctx.quadraticCurveTo(h * (x + 0.15), -h * 0.55, h * x, -h * 0.75);
      ctx.stroke();
    });
  },
  paw(ctx, h) {
    ellipse(ctx, 0, h * 0.35, h * 0.55, h * 0.45, 0, true);
    [
      [-0.7, -0.1, 0.2],
      [-0.28, -0.6, 0.22],
      [0.28, -0.6, 0.22],
      [0.7, -0.1, 0.2],
    ].forEach((t) => ellipse(ctx, h * t[0], h * t[1], h * t[2], h * t[2] * 1.2, 0, true));
  },
  compass(ctx, h) {
    circle(ctx, 0, 0, h * 0.95, false);
    ctx.beginPath(); // needle
    ctx.moveTo(0, -h * 0.65);
    ctx.lineTo(h * 0.22, 0);
    ctx.lineTo(0, h * 0.65);
    ctx.lineTo(-h * 0.22, 0);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -h * 0.65);
    ctx.lineTo(h * 0.22, 0);
    ctx.lineTo(-h * 0.22, 0);
    ctx.closePath();
    ctx.fill();
  },
  generic(ctx, h) {
    ctx.beginPath();
    ctx.moveTo(0, -h * 0.8);
    ctx.lineTo(h * 0.8, 0);
    ctx.lineTo(0, h * 0.8);
    ctx.lineTo(-h * 0.8, 0);
    ctx.closePath();
    ctx.stroke();
  },
};

/** Draw the icon for `key` (stroke only), centred, fitting a `size` square. */
function drawIcon(ctx, key, cx, cy, size, color) {
  const name = DRAW[key] ? key : ALIASES[key] || 'generic';
  const h = size / 2;
  ctx.save();
  ctx.translate(cx, cy);
  begin(ctx, color, Math.max(1.5, size / 14));
  DRAW[name](ctx, h);
  ctx.restore();
  return name;
}

/** Round accent chip with the white icon inside. */
function iconChip(ctx, key, cx, cy, size, fill, ring) {
  ctx.beginPath();
  ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  if (ring) {
    ctx.strokeStyle = ring;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  drawIcon(ctx, key, cx, cy, size * 0.58, '#FFFFFF');
}

module.exports = { drawIcon, iconChip, ALIASES, KEYS: Object.keys(DRAW) };
