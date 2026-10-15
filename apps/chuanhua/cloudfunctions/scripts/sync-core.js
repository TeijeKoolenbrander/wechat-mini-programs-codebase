#!/usr/bin/env node
'use strict';
// Copies shared code into every cloud function folder (a function deploys as one folder).
//   cloudfunctions/common/**        -> <fn>/common/**   (source of truth: cloudfunctions/common)
//   apps/chuanhua/game/core/**      -> <fn>/core/**     (source of truth: the game; git-ignored copies)
// Usage:
//   node scripts/sync-core.js                 copy common + core
//   node scripts/sync-core.js --check         exit 1 if any copy is missing or differs (drift check)
//   node scripts/sync-core.js --src <dir>     use another core source (tests use tests/fake-core)
//   node scripts/sync-core.js --common-only   skip core
// The backend only needs core/content/prompts.v1.js and core/content/blocklist.v1.js (see common/coreapi.js).
// If the core source does not exist yet the core copy is skipped with a warning (deploys must run the
// plain `npm run check`, which requires it).
const fs = require('fs');
const path = require('path');

const CF_ROOT = path.resolve(__dirname, '..');
const DEFAULT_CORE = path.resolve(CF_ROOT, '..', 'game', 'core');
const NOT_FUNCTIONS = new Set(['common', 'scripts', 'tests', 'database', 'node_modules']);

function listFunctions(root = CF_ROOT) {
  return fs.readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !NOT_FUNCTIONS.has(d.name) && fs.existsSync(path.join(root, d.name, 'index.js')))
    .map((d) => d.name)
    .sort();
}

function walk(dir, base = dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p, base));
    else out.push(path.relative(base, p).split(path.sep).join('/'));
  }
  return out.sort();
}

function copyDir(src, dest) {
  fs.rmSync(dest, { recursive: true, force: true });
  for (const rel of walk(src)) {
    fs.mkdirSync(path.dirname(path.join(dest, rel)), { recursive: true });
    fs.copyFileSync(path.join(src, rel), path.join(dest, rel));
  }
}

/** list differences between src and dest trees (missing, extra, changed) */
function diffDirs(src, dest) {
  const problems = [];
  if (!fs.existsSync(dest)) return [`missing directory ${dest}`];
  const a = walk(src);
  const b = walk(dest);
  for (const rel of a) {
    if (!b.includes(rel)) problems.push(`missing ${path.join(dest, rel)}`);
    else if (!fs.readFileSync(path.join(src, rel)).equals(fs.readFileSync(path.join(dest, rel)))) problems.push(`differs ${path.join(dest, rel)}`);
  }
  for (const rel of b) if (!a.includes(rel)) problems.push(`stale ${path.join(dest, rel)}`);
  return problems;
}

/** @param {{root?:string, coreSrc?:string|null, commonOnly?:boolean}} o */
function syncAll({ root = CF_ROOT, coreSrc = DEFAULT_CORE, commonOnly = false } = {}) {
  const fns = listFunctions(root);
  const haveCore = !commonOnly && coreSrc && fs.existsSync(coreSrc);
  if (!commonOnly && !haveCore) console.warn(`warning: core source not found (${coreSrc}); copying common only`);
  for (const fn of fns) {
    copyDir(path.join(root, 'common'), path.join(root, fn, 'common'));
    if (haveCore) copyDir(coreSrc, path.join(root, fn, 'core'));
  }
  return fns;
}

function checkDrift({ root = CF_ROOT, coreSrc = DEFAULT_CORE, commonOnly = false } = {}) {
  const problems = [];
  const haveCore = !commonOnly && coreSrc && fs.existsSync(coreSrc);
  if (!commonOnly && !haveCore) problems.push(`core source not found: ${coreSrc}`);
  for (const fn of listFunctions(root)) {
    problems.push(...diffDirs(path.join(root, 'common'), path.join(root, fn, 'common')));
    if (haveCore) problems.push(...diffDirs(coreSrc, path.join(root, fn, 'core')));
  }
  return problems;
}

module.exports = { listFunctions, syncAll, checkDrift, diffDirs, walk, copyDir, CF_ROOT, DEFAULT_CORE };

if (require.main === module) {
  const args = process.argv.slice(2);
  const i = args.indexOf('--src');
  const coreSrc = i >= 0 ? path.resolve(args[i + 1]) : DEFAULT_CORE;
  const commonOnly = args.includes('--common-only');
  if (args.includes('--check')) {
    const problems = checkDrift({ coreSrc, commonOnly });
    if (problems.length) {
      console.error('DRIFT:\n' + problems.join('\n') + '\nrun: npm run sync');
      process.exit(1);
    }
    console.log('no drift');
  } else {
    const fns = syncAll({ coreSrc, commonOnly });
    console.log(`synced ${fns.length} functions from ${commonOnly ? 'common only' : coreSrc}`);
  }
}
