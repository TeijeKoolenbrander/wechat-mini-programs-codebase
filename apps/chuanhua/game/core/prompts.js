/**
 * Prompt bank access (spec 4.2, PO-30). Pure.
 *
 *   PROMPTS, CATEGORIES, byId(id), active()
 *   batch(rng, excludeIds, n = 3) -> [{id, text}]   (换一批: random non-retired prompts, not in excludeIds)
 */

const bank = require('./content/prompts.v1');
const { shuffle } = require('./rng');

const PROMPTS = bank.prompts;
const CATEGORIES = bank.categories;
const BY_ID = {};
for (const p of PROMPTS) BY_ID[p.id] = p;

function byId(id) {
  return BY_ID[id] || null;
}

function active() {
  return PROMPTS.filter((p) => !p.retired);
}

function batch(rng, excludeIds, n) {
  const ex = {};
  (excludeIds || []).forEach((id) => (ex[id] = true));
  const pool = active().filter((p) => !ex[p.id]);
  shuffle(rng, pool);
  return pool.slice(0, n || 3).map((p) => ({ id: p.id, text: p.text }));
}

module.exports = { PROMPTS, CATEGORIES, byId, active, batch };
