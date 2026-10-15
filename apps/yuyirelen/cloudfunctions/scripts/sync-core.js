#!/usr/bin/env node
'use strict';
// Copies shared code and data into every cloud function folder (a function deploys as one folder).
//   cloudfunctions/common/**              -> <fn>/common/**   (source of truth: cloudfunctions/common; committed)
//   apps/yuyirelen/game/core/**           -> <fn>/core/**     (source of truth: the game; generated, git-ignored)
//   cloudfunctions/data/manifest.json     -> <fn>/data/       every function (versions)
//   cloudfunctions/data/vocab.v*.txt      -> <fn>/data/       functions that map words (VOCAB_FUNCTIONS)
//   cloudfunctions/data/near.v*.bin       -> <fn>/data/       functions that serve 联想词 (NEAR_FUNCTIONS)
// Usage:
//   node scripts/sync-core.js                 copy everything
//   node scripts/sync-core.js --check         exit 1 if any copy is missing or differs (the drift check)
//   node scripts/sync-core.js --src <dir>     use another core source
//   node scripts/sync-core.js --common-only   skip core and data (tests use this)
//   node scripts/sync-core.js --allow-no-core copy common and data even if game/core does not exist yet
const fs = require('fs');
const path = require('path');

const CF_ROOT = path.resolve(__dirname, '..');
const DEFAULT_CORE = path.resolve(CF_ROOT, '..', 'game', 'core');
const NOT_FUNCTIONS = new Set(['common', 'scripts', 'tests', 'database', 'data', 'node_modules']);
const VOCAB_FUNCTIONS = new Set(['guess', 'near', 'useHint', 'startPuzzle', 'getReveal', 'getChallenge', 'genDaily', 'getDaily']);
const NEAR_FUNCTIONS = new Set(['guess', 'near', 'useHint']);

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

/** which data files (relative names in cloudfunctions/data) a function gets */
function dataFilesFor(fn, dataDir) {
  if (!fs.existsSync(dataDir)) return [];
  return fs.readdirSync(dataDir).filter((f) => {
    if (f === 'manifest.json') return true;
    if (/^vocab\.v\d+\.txt$/.test(f)) return VOCAB_FUNCTIONS.has(fn);
    if (/^near\.v\d+\.bin$/.test(f)) return NEAR_FUNCTIONS.has(fn);
    return false;
  }).sort();
}
function copyData(fn, root) {
  const srcDir = path.join(root, 'data');
  const dest = path.join(root, fn, 'data');
  fs.rmSync(dest, { recursive: true, force: true });
  const files = dataFilesFor(fn, srcDir);
  if (!files.length) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const f of files) fs.copyFileSync(path.join(srcDir, f), path.join(dest, f));
}
function diffData(fn, root) {
  const srcDir = path.join(root, 'data');
  const dest = path.join(root, fn, 'data');
  const want = dataFilesFor(fn, srcDir);
  const have = fs.existsSync(dest) ? fs.readdirSync(dest).sort() : [];
  const problems = [];
  for (const f of want) {
    if (!have.includes(f)) problems.push(`missing ${path.join(dest, f)}`);
    else if (!fs.readFileSync(path.join(srcDir, f)).equals(fs.readFileSync(path.join(dest, f)))) problems.push(`differs ${path.join(dest, f)}`);
  }
  for (const f of have) if (!want.includes(f)) problems.push(`stale ${path.join(dest, f)}`);
  return problems;
}

/** @param {{root?:string, coreSrc?:string|null, commonOnly?:boolean, allowNoCore?:boolean}} o */
function syncAll({ root = CF_ROOT, coreSrc = DEFAULT_CORE, commonOnly = false, allowNoCore = false } = {}) {
  const fns = listFunctions(root);
  const haveCore = !!coreSrc && fs.existsSync(coreSrc);
  if (!commonOnly && !haveCore && !allowNoCore) throw new Error(`core source not found: ${coreSrc}`);
  for (const fn of fns) {
    copyDir(path.join(root, 'common'), path.join(root, fn, 'common'));
    if (commonOnly) continue;
    copyData(fn, root);
    if (haveCore) copyDir(coreSrc, path.join(root, fn, 'core'));
  }
  return fns;
}

function checkDrift({ root = CF_ROOT, coreSrc = DEFAULT_CORE, commonOnly = false } = {}) {
  const problems = [];
  for (const fn of listFunctions(root)) {
    problems.push(...diffDirs(path.join(root, 'common'), path.join(root, fn, 'common')));
    if (commonOnly) continue;
    problems.push(...diffData(fn, root));
    if (!coreSrc || !fs.existsSync(coreSrc)) problems.push(`core source not found: ${coreSrc}`);
    else problems.push(...diffDirs(coreSrc, path.join(root, fn, 'core')));
  }
  return problems;
}

module.exports = {
  listFunctions, syncAll, checkDrift, diffDirs, walk, copyDir, dataFilesFor,
  CF_ROOT, DEFAULT_CORE, VOCAB_FUNCTIONS, NEAR_FUNCTIONS,
};

if (require.main === module) {
  const args = process.argv.slice(2);
  const i = args.indexOf('--src');
  const coreSrc = i >= 0 ? path.resolve(args[i + 1]) : DEFAULT_CORE;
  const commonOnly = args.includes('--common-only');
  const allowNoCore = args.includes('--allow-no-core');
  if (args.includes('--check')) {
    const problems = checkDrift({ coreSrc, commonOnly });
    if (problems.length) {
      console.error('DRIFT:\n' + problems.join('\n') + '\nrun: npm run sync');
      process.exit(1);
    }
    console.log('no drift');
  } else {
    const fns = syncAll({ coreSrc, commonOnly, allowNoCore });
    console.log(`synced ${fns.length} functions (${commonOnly ? 'common only' : fs.existsSync(coreSrc) ? 'core ' + coreSrc : 'no core yet'})`);
  }
}
