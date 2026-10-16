#!/usr/bin/env node
'use strict';
/**
 * 点将台 release package size check (main package limit 4 MiB, total 30 MB; developers.weixin.qq.com code-package page:
 * "代码包总大小不能超过 30M", "主包不超过 4M", "单个分包不限制大小").
 *
 *   node docs/dianjiangtai/release/tools/package-size.js <game-dir> [--list]
 *
 * Sums every file under <game-dir> that project.config.json packOptions.ignore does not exclude (the same rule DevTools applies),
 * skipping project.config.json and the DevTools-local project.private.config.json. The game uses no subpackage, so the main
 * package is the whole upload (the opendata/ folder must sit in the main package anyway).
 *
 * Run it AFTER `node tools/release-config.js --env <envId> --appid <appid>` (the release switch adds the two dev-only files to the
 * ignore list). Also checks that nothing server-only or dev-only is in the package: the dev mock/stub files, a seed bank, any
 * *.key / .env file, any AppSecret-like string. Read-only. Exits 1 above 4 MiB or on any finding.
 */
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(process.argv[2] || '.');
const cfg = JSON.parse(fs.readFileSync(path.join(root, 'project.config.json'), 'utf8'));
const ig = cfg.packOptions.ignore;
const skip = (rel) =>
  ig.some((i) => (i.type === 'folder' ? rel === i.value || rel.startsWith(i.value + '/') : rel === i.value)) ||
  rel === 'project.private.config.json' ||
  rel === 'project.config.json';
const files = [];
(function walk(d, rel) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const r = rel ? rel + '/' + e.name : e.name;
    if (skip(r)) continue;
    if (e.isDirectory()) walk(path.join(d, e.name), r);
    else files.push([r, fs.statSync(path.join(d, e.name)).size]);
  }
})(root, '');

const total = files.reduce((a, f) => a + f[1], 0);
const LIMIT = 4 * 1024 * 1024;
console.log('appid', cfg.appid);
console.log('files', files.length, 'bytes', total, 'MiB', (total / 1048576).toFixed(3), 'of 4 MiB:', ((total / LIMIT) * 100).toFixed(1) + '%');
console.log('largest:');
files.slice().sort((a, b) => b[1] - a[1]).slice(0, 6).forEach((f) => console.log(String(f[1]).padStart(9), f[0]));
const byDir = {};
files.forEach(([r, s]) => { const k = r.includes('/') ? r.split('/')[0] : '(root)'; byDir[k] = (byDir[k] || 0) + s; });
console.log('by top-level folder:', Object.keys(byDir).sort().map((k) => k + ' ' + byDir[k]).join(', '));
if (process.argv.includes('--list')) files.forEach((f) => console.log(f[0]));

const findings = [];
files.forEach(([r]) => {
  if (r === 'js/mock-server.js' || r === 'js/stub-render.js') findings.push('dev-only file in the package: ' + r);
  if (/(^|\/)(bank[^/]*\.(json|jsonl|ndjson)|\.env.*|[^/]*\.(key|pem))$/i.test(r)) findings.push('seed bank / secret-like file in the package: ' + r);
  if (/^(tests|tools|cloudfunctions-deploy|node_modules)\//.test(r)) findings.push('non-runtime folder in the package: ' + r);
});
files.forEach(([r]) => {
  if (!/\.(js|json)$/.test(r)) return;
  const t = fs.readFileSync(path.join(root, r), 'utf8');
  if (/(AppSecret\s*[:=]\s*['"][0-9a-f]{16,}|-----BEGIN [A-Z ]*PRIVATE KEY|code2Session|session_key)/i.test(t)) findings.push('secret-like string in ' + r);
});
if (!/^wx[0-9a-f]{16}$/.test(cfg.appid)) findings.push('appid is not wx + 16 hex');
findings.forEach((f) => console.log('FINDING:', f));
if (!findings.length) console.log('no dev-only, seed-bank or secret-like files in the package');
process.exit(total > LIMIT || findings.length ? 1 : 0);
