#!/usr/bin/env node
/**
 * Content pipeline (spec 3.10, PO-31, AC 15).
 *
 *   node tools/build-content.js [--src DIR] [--version N] [--strict] [--spotcheck] [--check] [--write-pools]
 *
 * Reads apps/bibiyi/content-src/ (one file per measure: <measure>.jsonl, one
 * JSON object per line, or <measure>.csv with a header row; list fields are
 * separated by "|"). Two row shapes are accepted: the spec 3.2 shape (label, source,
 * url, ...) and the collector shape of content-src (subject, source_name, source_url,
 * retrieved_at, verified_by + verifier2, ...), which `fromCollector` converts. There is no
 * placeholder fallback any more: a missing or empty content-src is an error.
 *
 * Pools: content-src/pools.json maps fact id -> 'free' | 'daily'. Ids missing from it are
 * assigned deterministically (hash order, DAILY_SHARE of each measure to the daily pool)
 * and written back with --write-pools. Existing assignments never move (graduation is
 * one-way, spec 3.9); --check fails when pools.json is not up to date.
 *
 * Writes
 *   core/content/facts.free.js     free pool only, bundled in the game (display + value + source + url)
 *   tools/out/daily-facts.json     daily pool, SERVER ONLY, never shipped (the backend consumes it)
 *   tools/out/manifest.json        counts per measure / pool / licence
 *   tools/out/review/*.txt         with --spotcheck: 200 random legal pairs per measure for the author to read
 *
 * and fails (exit 1) when validation fails, or when any daily-pool fact id or
 * label would appear in the game output (--check re-runs the comparison against the
 * files on disk without writing, for CI drift checks).
 *
 * Excluded measures (spec 3.5) found in the source are skipped with a warning and
 * never emitted. Unknown measures are errors.
 */

const fs = require('node:fs');
const path = require('node:path');
const { hash32, sub, int } = require('../core/rng');
const { MEASURES, BY_KEY } = require('../core/measures');
const { validateContent, indexFacts } = require('../core/content');
const { getConfig, LATEST_CONFIG_VERSION } = require('../core/config');
const { pairLegal } = require('../core/deck');
const { valueText } = require('../core/format');

const GAME = path.join(__dirname, '..');
const DEFAULT_SRC = path.join(GAME, '..', 'content-src');
const POOLS_FILE = 'pools.json';
const OUT_FREE = path.join(GAME, 'core', 'content', 'facts.free.js');
const OUT_DIR = path.join(__dirname, 'out');

/** Measures that spec 3.5 excludes: skipped if they appear in a source folder. */
const EXCLUDED_MEASURES = ['prov_area', 'province_area', 'area', 'country_pop', 'country_area', 'border_len', 'gdp', 'income', 'house_price', 'price', 'person_height', 'death_toll'];

const CLIENT_FIELDS = ['id', 'measure', 'pool', 'label', 'sub', 'value', 'approx', 'uncertainty', 'year', 'source', 'publisher', 'url', 'licence', 'retrievedAt', 'note', 'method', 'attribution', 'noPairWith', 'status', 'since'];

/** Share of each measure's facts that goes to the (server-only) daily pool when pools.json has no entry yet. */
const DAILY_SHARE = {};
const DEFAULT_DAILY_SHARE = 0.55;

/** Tags a collector adds as advisory notes are dropped, except these (kept for reviewers or the removal check). */
const KEEP_TAGS = ['border-feature'];
/** A fact carrying one of these must not ship (the reviewer asked for removal, or it was moved out). */
const REMOVE_TAGS = ['recommend-remove', 'dropped'];

/** Publisher names shortened for the one-line source under a card. The full name stays in `source`. */
const PUBLISHER_SHORT = {
  'Human Ageing Genomic Resources (HAGR)': 'AnAge（HAGR）',
  'USDA Agricultural Research Service, FoodData Central': 'USDA FoodData Central',
  'NASA / NSSDCA': 'NASA',
};

// ---------------------------------------------------------------- parsing

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      cell = '';
      if (row.some((c) => c !== '')) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c !== '')) rows.push(row);
  if (!rows.length) return [];
  const head = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r) => {
    const o = {};
    head.forEach((h, i) => {
      if (r[i] !== undefined && r[i] !== '') o[h] = r[i];
    });
    return o;
  });
}

const NUM_FIELDS = ['value', 'uncertainty', 'year', 'since'];
const LIST_FIELDS = ['verifiedBy', 'tags', 'noPairWith'];

/** Where a reader can open the value: USDA API URLs (with a demo key) become the public food page; http becomes https. */
function publicUrl(url, sourceName) {
  let u = String(url || '');
  const fdc = /fdcId\s+(\d+)/.exec(sourceName || '');
  if (/^https:\/\/api\.nal\.usda\.gov\//.test(u) && fdc) u = 'https://fdc.nal.usda.gov/fdc-app.html#/food-details/' + fdc[1] + '/nutrients';
  return u.replace(/^http:\/\//i, 'https://');
}

/**
 * Collector row (content-src) -> spec 3.2 fact. Rows already in the spec shape (no `subject`) pass through.
 * verified_by names the author; verifier2 must start with "ok" or the row has only one role and the validator rejects it.
 */
function fromCollector(r) {
  if (r.subject === undefined) return r;
  const f = {
    id: r.id, measure: r.measure, label: r.subject, value: r.value, year: r.as_of_year, source: r.source_name,
    publisher: PUBLISHER_SHORT[r.publisher] || r.publisher, url: publicUrl(r.source_url, r.source_name), licence: r.licence, retrievedAt: r.retrieved_at,
    note: r.note || null, tags: (r.tags || []).filter((t) => KEEP_TAGS.indexOf(t) >= 0 || REMOVE_TAGS.indexOf(t) >= 0),
  };
  if (r.approx) f.approx = true;
  if (f.measure === 'prov_pop' && !/普查|七普/.test(f.note || '')) f.note = '七普口径：2020年11月1日零时';
  if (r.method) f.method = r.method;
  if (r.attribution) f.attribution = r.attribution;
  const author = String(r.verified_by || '').split(/[\s:]/)[0];
  const second = /^ok\b/.test(String(r.verifier2 || ''));
  f.verifiedBy = author && second ? ['author:' + author, 'verifier:second-check'] : author ? ['author:' + author] : [];
  return f;
}

/** Fill pools from pools.json; assign new ids stratified per measure by hash order. Existing entries never move. */
function assignPools(facts, existing) {
  const pools = Object.assign({}, existing || {});
  const byMeasure = {};
  facts.forEach((f) => {
    (byMeasure[f.measure] = byMeasure[f.measure] || []).push(f);
  });
  Object.keys(byMeasure).forEach((m) => {
    const list = byMeasure[m];
    const share = DAILY_SHARE[m] !== undefined ? DAILY_SHARE[m] : DEFAULT_DAILY_SHARE;
    const want = Math.round(list.length * share);
    let daily = list.filter((f) => pools[f.id] === 'daily').length;
    list
      .filter((f) => !pools[f.id])
      .sort((a, b) => hash32('pool|' + a.id) - hash32('pool|' + b.id))
      .forEach((f) => {
        if (daily < want) {
          pools[f.id] = 'daily';
          daily++;
        } else pools[f.id] = 'free';
      });
  });
  return pools;
}

function normaliseRow(o, measureKey, contentVersion) {
  const f = Object.assign({}, fromCollector(o));
  if (!f.measure) f.measure = measureKey;
  NUM_FIELDS.forEach((k) => {
    if (typeof f[k] === 'string') f[k] = Number(f[k]);
  });
  if (typeof f.approx === 'string') f.approx = /^(1|true|yes|y)$/i.test(f.approx);
  LIST_FIELDS.forEach((k) => {
    if (typeof f[k] === 'string') f[k] = f[k].split('|').map((s) => s.trim()).filter(Boolean);
  });
  if (f.sub === '') f.sub = null;
  if (!f.id && f.label) f.id = 'f_' + f.measure + '_' + hash32(f.measure + '|' + f.label).toString(36);
  if (f.approx === undefined) f.approx = false;
  if (!f.status) f.status = 'active';
  if (!f.tags) f.tags = [];
  if (f.since === undefined) f.since = contentVersion;
  return f;
}

function readSource(dir, contentVersion) {
  const facts = [];
  const warnings = [];
  const files = fs.readdirSync(dir).filter((n) => /\.(jsonl|csv)$/i.test(n)).sort();
  files.forEach((name) => {
    const key = name.replace(/\.(jsonl|csv)$/i, '');
    if (EXCLUDED_MEASURES.indexOf(key) >= 0) {
      warnings.push('skipped excluded measure file ' + name);
      return;
    }
    const text = fs.readFileSync(path.join(dir, name), 'utf8').replace(/^﻿/, '');
    let rows;
    if (/\.csv$/i.test(name)) rows = parseCsv(text);
    else {
      rows = [];
      text.split(/\r?\n/).forEach((line, i) => {
        const t = line.trim();
        if (!t || t[0] === '#' || t.startsWith('//')) return;
        try {
          rows.push(JSON.parse(t));
        } catch (e) {
          throw new Error(name + ' line ' + (i + 1) + ': invalid JSON');
        }
      });
    }
    rows.forEach((r) => {
      if (r.measure && EXCLUDED_MEASURES.indexOf(r.measure) >= 0) {
        warnings.push('skipped excluded measure row ' + (r.label || '?') + ' (' + r.measure + ')');
        return;
      }
      facts.push(normaliseRow(r, key, contentVersion));
    });
  });
  return { facts, warnings, files };
}

// ---------------------------------------------------------------- outputs

function clientFact(f) {
  const o = {};
  CLIENT_FIELDS.forEach((k) => {
    if (f[k] !== undefined && f[k] !== null) o[k] = f[k];
  });
  return o;
}

function freeModuleText(info) {
  const lines = info.facts.map((f) => '  ' + JSON.stringify(clientFact(f)));
  return (
    '/* GENERATED by tools/build-content.js, DO NOT EDIT. Free pool only (spec 3.9); the daily pool never ships.\n' +
    ' * source: ' + info.generatedFrom + (info.placeholder ? '  (PLACEHOLDER facts, not real data)' : '') + ' */\n' +
    'module.exports = {\n' +
    '  contentVersion: ' + info.contentVersion + ',\n' +
    '  placeholder: ' + info.placeholder + ',\n' +
    '  facts: [\n' + lines.join(',\n') + '\n  ],\n};\n'
  );
}

function manifestOf(info, validation) {
  const licences = {};
  const sources = {};
  info.all.forEach((f) => {
    licences[f.licence] = (licences[f.licence] || 0) + 1;
    sources[f.publisher] = (sources[f.publisher] || 0) + 1;
  });
  return { contentVersion: info.contentVersion, placeholder: info.placeholder, generatedFrom: info.generatedFrom, total: info.all.length, free: info.facts.length, daily: info.daily.length, perMeasure: validation.counts, licences, publishers: sources };
}

/** AC 15: no daily-pool id or label may appear in the game output text. */
function leaks(dailyFacts, freeText, freeFacts) {
  const bad = [];
  const freeLabels = new Set(freeFacts.map((f) => f.measure + '|' + f.label));
  dailyFacts.forEach((f) => {
    if (freeText.indexOf('"id":"' + f.id + '"') >= 0) bad.push('daily id in game output: ' + f.id);
    if (freeLabels.has(f.measure + '|' + f.label)) bad.push('daily label in game output: ' + f.label);
  });
  return bad;
}

function spotcheck(info, dir) {
  const config = getConfig(LATEST_CONFIG_VERSION);
  fs.mkdirSync(dir, { recursive: true });
  const idx = indexFacts(info.all, info.contentVersion);
  MEASURES.forEach((m) => {
    const list = idx.byMeasure[m.key];
    const rng = sub(1, 'spot:' + m.key);
    const lines = [];
    let guard = 0;
    while (lines.length < 200 && list.length > 1 && guard++ < 20000) {
      const a = list[int(rng, list.length)];
      const b = list[int(rng, list.length)];
      if (pairLegal(config, a, b)) lines.push(a.label + ' ' + valueText(m, a) + m.unit + '  vs  ' + b.label + ' ' + valueText(m, b) + m.unit);
    }
    fs.writeFileSync(path.join(dir, m.key + '.txt'), lines.join('\n') + '\n', 'utf8');
  });
}

// ---------------------------------------------------------------- main

function build(opts) {
  const o = opts || {};
  const contentVersion = o.version || 1;
  const src = o.src || DEFAULT_SRC;
  const placeholder = false;
  const haveData = (d) => fs.existsSync(d) && fs.readdirSync(d).some((n) => /\.(jsonl|csv)$/i.test(n));
  if (!haveData(src)) throw new Error('no .jsonl / .csv files in ' + src + ' (there is no placeholder fallback)');
  const read = readSource(src, contentVersion);
  const poolsPath = path.join(src, POOLS_FILE);
  const existing = fs.existsSync(poolsPath) ? JSON.parse(fs.readFileSync(poolsPath, 'utf8')) : {};
  const pools = assignPools(read.facts, o.pools || existing);
  read.facts.forEach((f) => {
    if (!f.pool) f.pool = pools[f.id];
  });
  const removed = read.facts.filter((f) => (f.tags || []).some((t) => REMOVE_TAGS.indexOf(t) >= 0));
  const all = read.facts.filter((f) => removed.indexOf(f) < 0);
  removed.forEach((f) => read.warnings.push('skipped ' + f.id + ' (tagged ' + f.tags.join(',') + ')'));
  const validation = validateContent(all, { strict: !!o.strict });
  const keep = {};
  all.forEach((f) => {
    keep[f.id] = pools[f.id] || f.pool;
  });
  const sorted = {};
  Object.keys(keep).sort().forEach((id) => {
    sorted[id] = keep[id];
  });
  const info = {
    contentVersion, placeholder, generatedFrom: path.relative(path.join(GAME, '..', '..'), src).split(path.sep).join('/'),
    all, facts: all.filter((f) => f.pool === 'free'), daily: all.filter((f) => f.pool === 'daily'), warnings: read.warnings, poolsPath, poolsText: JSON.stringify(sorted, null, 1) + '\n',
  };
  const freeText = freeModuleText(info);
  const problems = validation.errors.slice();
  leaks(info.daily, freeText, info.facts).forEach((l) => problems.push(l));
  return { info, validation, freeText, problems, manifest: manifestOf(info, validation) };
}

function main() {
  const argv = process.argv.slice(2);
  const opt = (name) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const r = build({ src: opt('--src'), version: opt('--version') ? Number(opt('--version')) : 1, strict: argv.indexOf('--strict') >= 0 });
  r.info.warnings.forEach((w) => console.warn('warning: ' + w));
  if (r.problems.length) {
    console.error(r.problems.length + ' problem(s):');
    r.problems.slice(0, 50).forEach((p) => console.error('  ' + p));
    process.exit(1);
  }
  if (argv.indexOf('--check') >= 0) {
    const onDisk = fs.existsSync(OUT_FREE) ? fs.readFileSync(OUT_FREE, 'utf8').split(String.fromCharCode(13)).join('') : '';
    if (onDisk !== r.freeText) {
      console.error('drift: core/content/facts.free.js is out of date, run tools/build-content.js');
      process.exit(1);
    }
    const poolsOnDisk = fs.existsSync(r.info.poolsPath) ? fs.readFileSync(r.info.poolsPath, 'utf8').split(String.fromCharCode(13)).join('') : '';
    if (poolsOnDisk !== r.info.poolsText) {
      console.error('drift: content-src/pools.json is out of date, run tools/build-content.js --write-pools');
      process.exit(1);
    }
    console.log('content up to date: ' + r.info.facts.length + ' free, ' + r.info.daily.length + ' daily');
    return;
  }
  if (argv.indexOf('--write-pools') >= 0) fs.writeFileSync(r.info.poolsPath, r.info.poolsText, 'utf8');
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(path.dirname(OUT_FREE), { recursive: true });
  fs.writeFileSync(OUT_FREE, r.freeText, 'utf8');
  fs.writeFileSync(path.join(OUT_DIR, 'daily-facts.json'), JSON.stringify({ contentVersion: r.info.contentVersion, placeholder: r.info.placeholder, pool: 'daily', facts: r.info.daily }, null, 1) + '\n', 'utf8');
  fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), JSON.stringify(r.manifest, null, 2) + '\n', 'utf8');
  if (argv.indexOf('--spotcheck') >= 0) spotcheck(r.info, path.join(OUT_DIR, 'review'));
  console.log('built content v' + r.info.contentVersion + ': ' + r.info.facts.length + ' free (game), ' + r.info.daily.length + ' daily (server only)' + (r.info.placeholder ? ' [PLACEHOLDER]' : ''));
}

if (require.main === module) main();

module.exports = { build, parseCsv, readSource, normaliseRow, fromCollector, assignPools, publicUrl, clientFact, leaks, EXCLUDED_MEASURES, DAILY_SHARE };
