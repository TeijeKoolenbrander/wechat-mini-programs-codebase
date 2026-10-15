#!/usr/bin/env node
/**
 * Computed measure `distance` (spec 3.1, 3.4): great-circle distances between major
 * Chinese cities, computed from GeoNames coordinates (CC BY 4.0).
 *
 *   node tools/make-distances.js [--zip FILE | --txt FILE] [--out DIR] [--pairs N]
 *
 * Without --zip / --txt the tool downloads https://download.geonames.org/export/dump/cities15000.zip
 * (about 3 MB) and reads the single txt inside it with Node's zlib (no external tool).
 * The download is treated as untrusted data: it is only parsed, never executed, and only the
 * fields we need are kept.
 *
 * Writes (default DIR = apps/bibiyi/content-src)
 *   distance.jsonl         one fact per city pair, collector schema (same as the other measures),
 *                          method "computed", pool assigned later by build-content
 *   distance-cities.json   the cities used with their GeoNames id and coordinates (audit trail)
 *
 * Method: haversine on a sphere (R = 6371.0088 km) between the GeoNames city points, rounded to
 * 10 km. Every value is cross-checked against Vincenty's inverse formula on the WGS-84 ellipsoid;
 * the tool fails if they differ by more than 0.6 %.
 *
 * The cities are chosen from names that already have a population fact in content-src
 * (city_pop / prov_pop), so every city in a distance question is one the game already knows.
 * Pairs are neutral: two mainland cities, never a border city, nothing about borders or regions.
 * Selection is deterministic (hash order) with a cap per city and an even spread of distances.
 *
 * Exit codes: 0 done; 2 GeoNames could not be fetched (the measure is skipped, nothing is written).
 */

const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const zlib = require('node:zlib');
const { hash32 } = require('../core/rng');

const GAME = path.join(__dirname, '..');
const SRC_DIR_DEFAULT = path.join(GAME, '..', 'content-src');
const GEONAMES_URL = 'https://download.geonames.org/export/dump/cities15000.zip';
const RETRIEVED_AT = '2026-10-15';
const DATA_YEAR = 2026;
const R_KM = 6371.0088;

/** ~40 well-known cities. Each must have a population fact in content-src (checked at run time). */
const CITIES = [
  ['北京', 'beijing', 'f_prov_pop_beijing'], ['上海', 'shanghai', 'f_prov_pop_shanghai'], ['天津', 'tianjin', 'f_prov_pop_tianjin'], ['重庆', 'chongqing', 'f_prov_pop_chongqing'],
  ['广州', 'guangzhou', 'f_city_pop_guangzhou'], ['东莞', 'dongguan', 'f_city_pop_dongguan'], ['西安', 'xian', 'f_city_pop_xian'], ['郑州', 'zhengzhou', 'f_city_pop_zhengzhou'],
  ['武汉', 'wuhan', 'f_city_pop_wuhan'], ['宜昌', 'yichang', 'f_city_pop_yichang'], ['襄阳', 'xiangyang', 'f_city_pop_xiangyang'], ['十堰', 'shiyan', 'f_city_pop_shiyan'],
  ['南京', 'nanjing', 'f_city_pop_nanjing'], ['苏州', 'suzhou', 'f_city_pop_suzhou'], ['无锡', 'wuxi', 'f_city_pop_wuxi'], ['徐州', 'xuzhou', 'f_city_pop_xuzhou'],
  ['南通', 'nantong', 'f_city_pop_nantong'], ['扬州', 'yangzhou', 'f_city_pop_yangzhou'], ['连云港', 'lianyungang', 'f_city_pop_lianyungang'], ['盐城', 'yancheng', 'f_city_pop_yancheng'],
  ['哈尔滨', 'haerbin', 'f_city_pop_haerbin'], ['齐齐哈尔', 'qiqihaer', 'f_city_pop_qiqihaer'], ['大庆', 'daqing', 'f_city_pop_daqing'], ['牡丹江', 'mudanjiang', 'f_city_pop_mudanjiang'],
  ['沈阳', 'shenyang', 'f_city_pop_shenyang'], ['大连', 'dalian', 'f_city_pop_dalian'], ['鞍山', 'anshan', 'f_city_pop_anshan'], ['锦州', 'jinzhou', 'f_city_pop_jinzhou'],
  ['长春', 'changchun', 'f_city_pop_changchun'], ['吉林', 'jilin', 'f_city_pop_jilin'], ['通化', 'tonghua', 'f_city_pop_tonghua'],
  ['福州', 'fuzhou', 'f_city_pop_fuzhou'], ['厦门', 'xiamen', 'f_city_pop_xiamen'], ['泉州', 'quanzhou', 'f_city_pop_quanzhou'], ['漳州', 'zhangzhou', 'f_city_pop_zhangzhou'],
  ['荆州', 'jingzhou', 'f_city_pop_jingzhou'], ['黄石', 'huangshi', 'f_city_pop_huangshi'], ['常州', 'changzhou', 'f_city_pop_changzhou'], ['镇江', 'zhenjiang', 'f_city_pop_zhenjiang'],
];

// ---------------------------------------------------------------- fetching and parsing

function download(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: 60000 }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error('HTTP ' + res.statusCode));
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

/** The first entry of a zip archive, read via the central directory (deflate or stored). */
function unzipFirst(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('not a zip file');
  const cdOffset = buf.readUInt32LE(eocd + 16);
  if (buf.readUInt32LE(cdOffset) !== 0x02014b50) throw new Error('bad zip directory');
  const method = buf.readUInt16LE(cdOffset + 10);
  const compSize = buf.readUInt32LE(cdOffset + 20);
  const localOffset = buf.readUInt32LE(cdOffset + 42);
  if (buf.readUInt32LE(localOffset) !== 0x04034b50) throw new Error('bad zip entry');
  const start = localOffset + 30 + buf.readUInt16LE(localOffset + 26) + buf.readUInt16LE(localOffset + 28);
  const data = buf.subarray(start, start + compSize);
  return method === 0 ? data : zlib.inflateRawSync(data);
}

/**
 * GeoNames rows -> a map from a Chinese name to the best candidate. Columns (tab separated):
 * 0 id, 1 name, 3 alternatenames, 4 lat, 5 lon, 6 feature class, 7 feature code, 8 country, 14 population.
 */
function parseCities(text) {
  const byName = new Map();
  text.split('\n').forEach((line) => {
    if (!line) return;
    const c = line.split('\t');
    if (c[8] !== 'CN' || c[6] !== 'P') return;
    const rec = { id: c[0], name: c[1], lat: Number(c[4]), lon: Number(c[5]), code: c[7], pop: Number(c[14]) || 0 };
    String(c[3] || '').split(',').forEach((alt) => {
      if (!/[一-鿿]/.test(alt)) return;
      const cur = byName.get(alt);
      if (!cur || rec.pop > cur.pop) byName.set(alt, rec);
    });
  });
  return byName;
}

// ---------------------------------------------------------------- geometry

const rad = (d) => (d * Math.PI) / 180;

function haversineKm(a, b) {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Vincenty inverse on WGS-84, in km. Independent of the haversine path, used as a cross-check. */
function vincentyKm(p, q) {
  const a = 6378137;
  const f = 1 / 298.257223563;
  const b = (1 - f) * a;
  const L = rad(q.lon - p.lon);
  const U1 = Math.atan((1 - f) * Math.tan(rad(p.lat)));
  const U2 = Math.atan((1 - f) * Math.tan(rad(q.lat)));
  const sU1 = Math.sin(U1), cU1 = Math.cos(U1), sU2 = Math.sin(U2), cU2 = Math.cos(U2);
  let lambda = L;
  let sinSigma, cosSigma, sigma, cosSqAlpha, cos2SigmaM;
  for (let i = 0; i < 200; i++) {
    const sinL = Math.sin(lambda), cosL = Math.cos(lambda);
    sinSigma = Math.sqrt((cU2 * sinL) ** 2 + (cU1 * sU2 - sU1 * cU2 * cosL) ** 2);
    if (sinSigma === 0) return 0;
    cosSigma = sU1 * sU2 + cU1 * cU2 * cosL;
    sigma = Math.atan2(sinSigma, cosSigma);
    const sinAlpha = (cU1 * cU2 * sinL) / sinSigma;
    cosSqAlpha = 1 - sinAlpha * sinAlpha;
    cos2SigmaM = cosSqAlpha === 0 ? 0 : cosSigma - (2 * sU1 * sU2) / cosSqAlpha;
    const C = (f / 16) * cosSqAlpha * (4 + f * (4 - 3 * cosSqAlpha));
    const prev = lambda;
    lambda = L + (1 - C) * f * sinAlpha * (sigma + C * sinSigma * (cos2SigmaM + C * cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM)));
    if (Math.abs(lambda - prev) < 1e-12) break;
  }
  const uSq = (cosSqAlpha * (a * a - b * b)) / (b * b);
  const A = 1 + (uSq / 16384) * (4096 + uSq * (-768 + uSq * (320 - 175 * uSq)));
  const B = (uSq / 1024) * (256 + uSq * (-128 + uSq * (74 - 47 * uSq)));
  const dSigma = B * sinSigma * (cos2SigmaM + (B / 4) * (cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM) - (B / 6) * cos2SigmaM * (-3 + 4 * sinSigma * sinSigma) * (-3 + 4 * cos2SigmaM * cos2SigmaM)));
  return (b * A * (sigma - dSigma)) / 1000;
}

// ---------------------------------------------------------------- selection

/** Deterministic selection: hash order, a cap per city and an even spread over log-distance bins. */
function selectPairs(cities, want) {
  const all = [];
  for (let i = 0; i < cities.length; i++) {
    for (let j = i + 1; j < cities.length; j++) {
      const d = cities[i].km[j];
      if (d >= 120) all.push({ i, j, d, h: hash32('dist|' + cities[i].key + '|' + cities[j].key) });
    }
  }
  all.sort((x, y) => x.h - y.h);
  const BINS = [120, 300, 500, 800, 1200, 1700, 2300, 3000, 4000];
  const binOf = (d) => {
    let b = 0;
    while (b < BINS.length && d >= BINS[b]) b++;
    return b;
  };
  const nBins = BINS.length + 1;
  const binCap = Math.ceil(want / nBins) + 12;
  const cap = Math.ceil((2 * want) / cities.length) + 3;
  const degree = new Array(cities.length).fill(0);
  const binCount = new Array(nBins).fill(0);
  const out = [];
  all.forEach((p) => {
    if (out.length >= want) return;
    const b = binOf(p.d);
    if (degree[p.i] >= cap || degree[p.j] >= cap || binCount[b] >= binCap) return;
    degree[p.i]++;
    degree[p.j]++;
    binCount[b]++;
    out.push(p);
  });
  return out;
}

// ---------------------------------------------------------------- main

function toFact(a, b, km) {
  const rounded = Math.round(km / 10) * 10;
  const idA = a.key;
  const idB = b.key;
  return {
    id: 'f_distance_' + idA + '_' + idB,
    measure: 'distance',
    subject: a.zh + '—' + b.zh,
    value: rounded,
    unit: '公里',
    as_of_year: DATA_YEAR,
    method: 'computed',
    source_name: 'GeoNames 城市坐标（cities15000），本游戏计算大圆距离',
    publisher: 'GeoNames',
    source_url: 'https://www.geonames.org/',
    licence: 'CC-BY-4.0',
    attribution: 'GeoNames (CC BY 4.0), https://www.geonames.org，直线距离为本游戏计算',
    retrieved_at: RETRIEVED_AT,
    verified_by: 'make-distances.js ' + RETRIEVED_AT + ': haversine R=6371.0088 km between GeoNames points ' + a.geonameId + ' and ' + b.geonameId + ', rounded to 10 km',
    verifier2: 'ok:' + RETRIEVED_AT + '; Vincenty inverse (WGS-84) agrees within 0.6%',
    derived: 'haversine(' + a.lat.toFixed(4) + ',' + a.lon.toFixed(4) + ' ; ' + b.lat.toFixed(4) + ',' + b.lon.toFixed(4) + ')',
    note: '大圆距离，取整到10公里',
    tags: [],
  };
}

async function main() {
  const argv = process.argv.slice(2);
  const opt = (n) => {
    const i = argv.indexOf(n);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const outDir = opt('--out') || SRC_DIR_DEFAULT;
  const want = opt('--pairs') ? Number(opt('--pairs')) : 150;
  let text;
  try {
    if (opt('--txt')) text = fs.readFileSync(opt('--txt'), 'utf8');
    else {
      const zip = opt('--zip') ? fs.readFileSync(opt('--zip')) : await download(GEONAMES_URL);
      text = unzipFirst(zip).toString('utf8');
    }
  } catch (e) {
    console.error('SKIPPED: could not get GeoNames data (' + e.message + '). The distance measure is not generated.');
    process.exit(2);
  }
  const byName = parseCities(text);

  // every chosen city must already have a population fact
  const known = new Set();
  ['city_pop', 'prov_pop'].forEach((m) => {
    const f = path.join(outDir, m + '.jsonl');
    if (!fs.existsSync(f)) return;
    fs.readFileSync(f, 'utf8').split(/\r?\n/).forEach((l) => {
      if (l.trim()) known.add(JSON.parse(l).id);
    });
  });
  const cities = [];
  const problems = [];
  CITIES.forEach((c) => {
    if (!known.has(c[2])) return problems.push(c[0] + ': no population fact ' + c[2]);
    const rec = byName.get(c[0] + '市') || byName.get(c[0]);
    if (!rec) return problems.push(c[0] + ': not found in GeoNames');
    cities.push({ zh: c[0], key: c[1], popFact: c[2], geonameId: rec.id, geoName: rec.name, lat: rec.lat, lon: rec.lon });
  });
  if (problems.length) {
    console.error(problems.length + ' problem(s):\n  ' + problems.join('\n  '));
    process.exit(1);
  }
  cities.forEach((a, i) => {
    a.km = cities.map((b, j) => (i === j ? 0 : haversineKm(a, b)));
  });

  const pairs = selectPairs(cities, want);
  let worst = 0;
  const facts = pairs
    .map((p) => {
      const a = cities[p.i];
      const b = cities[p.j];
      const v = vincentyKm(a, b);
      worst = Math.max(worst, Math.abs(v - p.d) / p.d);
      return { a, b, d: p.d };
    })
    .sort((x, y) => (x.a.key + x.b.key < y.a.key + y.b.key ? -1 : 1))
    .map((p) => toFact(p.a, p.b, p.d));
  if (worst > 0.006) {
    console.error('FAIL: haversine and Vincenty differ by ' + (worst * 100).toFixed(2) + '% (max 0.6%)');
    process.exit(1);
  }
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'distance.jsonl'), facts.map((f) => JSON.stringify(f)).join('\n') + '\n', 'utf8');
  const audit = cities.map((c) => ({ city: c.zh, popFact: c.popFact, geonameId: c.geonameId, geonamesName: c.geoName, lat: c.lat, lon: c.lon }));
  fs.writeFileSync(path.join(outDir, 'distance-cities.json'), JSON.stringify({ source: 'GeoNames cities15000 (CC BY 4.0) https://www.geonames.org', retrievedAt: RETRIEVED_AT, cities: audit }, null, 1) + '\n', 'utf8');
  const vals = facts.map((f) => f.value).sort((x, y) => x - y);
  console.log('distance: ' + cities.length + ' cities, ' + facts.length + ' pairs, ' + vals[0] + '..' + vals[vals.length - 1] + ' km, max haversine/Vincenty gap ' + (worst * 100).toFixed(3) + '%');
}

if (require.main === module) main();

module.exports = { haversineKm, vincentyKm, parseCities, unzipFirst, selectPairs, CITIES };
