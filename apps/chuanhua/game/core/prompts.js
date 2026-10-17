'use strict';
/**
 * Prompt bank access (spec 4.3, F-2). The data are .js modules (WeChat cannot require .json): core/content/prompts.v2.js
 * (`{version: 2, prompts: [{id, text, cat, retired?}]}`, >= 2,000 prompts, the 423 v1 ids kept) and prompts.v1.js (the seed,
 * `{PROMPTS_VERSION, CATEGORIES, PROMPTS}`). Prompts are never deleted: a retired one keeps its id so existing chains still resolve.
 *
 * SERVER-ONLY (CTO ruling, TD-103): the bank is not part of the client package. Only the cloud functions flagged `bank` in core/schema.js and the dev
 * mock server load this module; a release client never does (tools/release-config.js SERVER_ONLY_FILES, tests/release-gate.test.js).
 */

const v1 = require('./content/prompts.v1');

const v2 = require('./content/prompts.v2');

function normalise(m, version) {
  if (!m) return null;
  const list = m.PROMPTS || m.prompts;
  return { version: m.PROMPTS_VERSION || m.version || version, categories: m.CATEGORIES || m.categories || v1.CATEGORIES, list };
}

const BANKS = { 1: normalise(v1, 1) };
BANKS[2] = normalise(v2, 2);
const LATEST_PROMPTS_VERSION = 2;

const cache = {};

/** @returns {null | {version, categories, list, byId, active, byCat}} null for an unknown version */
function getPrompts(version) {
  const key = version === undefined ? LATEST_PROMPTS_VERSION : version;
  const m = BANKS[key];
  if (!m) return null;
  if (cache[key]) return cache[key];
  const byId = {};
  const byCat = {};
  for (const p of m.list) {
    byId[p.id] = p;
    if (!p.retired) (byCat[p.cat] = byCat[p.cat] || []).push(p);
  }
  cache[key] = {
    version: m.version,
    categories: m.categories,
    list: m.list,
    byId,
    active: m.list.filter((p) => !p.retired),
    byCat,
  };
  return cache[key];
}

/** a prompt by id, or null (works for retired prompts too; looks in the latest bank, then in older banks) */
function promptById(id, version) {
  if (version !== undefined) {
    const b = getPrompts(version);
    return (b && b.byId[id]) || null;
  }
  const keys = Object.keys(BANKS).map(Number).sort((a, b) => b - a);
  for (const k of keys) {
    const p = getPrompts(k).byId[id];
    if (p) return p;
  }
  return null;
}

module.exports = { getPrompts, promptById, LATEST_PROMPTS_VERSION };
