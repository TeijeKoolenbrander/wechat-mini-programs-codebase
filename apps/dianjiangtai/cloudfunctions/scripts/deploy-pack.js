#!/usr/bin/env node
'use strict';
// Builds the folder the founder uploads from WeChat DevTools: one folder per function, named with the deploy prefix
// (dianjiangtai_getDaily, ...), each containing index.js, package.json, function.config.json, config.json (timers),
// common/ and core/ (synced first). Deploying is NEVER done here: this only copies files.
//   node scripts/deploy-pack.js [--prefix dianjiangtai_] [--out <dir>]      (default out: game/cloudfunctions-deploy)
const fs = require('fs');
const path = require('path');
const sync = require('./sync-core');

// inside the game project (ignored by packOptions) so DevTools accepts it as cloudfunctionRoot
const DEFAULT_OUT = path.resolve(sync.CF_ROOT, '..', 'game', 'cloudfunctions-deploy');

function pack({ prefix = 'dianjiangtai_', out = DEFAULT_OUT, root = sync.CF_ROOT, coreSrc = sync.DEFAULT_CORE } = {}) {
  sync.syncAll({ root, coreSrc });
  const drift = sync.checkDrift({ root, coreSrc });
  if (drift.length) throw new Error('drift after sync:\n' + drift.join('\n'));
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  const manifest = { prefix, functions: [], timers: [] };
  for (const fn of sync.listFunctions(root)) {
    const dest = path.join(out, prefix + fn);
    for (const rel of sync.walk(path.join(root, fn))) {
      fs.mkdirSync(path.dirname(path.join(dest, rel)), { recursive: true });
      fs.copyFileSync(path.join(root, fn, rel), path.join(dest, rel));
    }
    const cfg = JSON.parse(fs.readFileSync(path.join(dest, 'function.config.json'), 'utf8'));
    const entry = { repoName: fn, deployName: prefix + fn, timeout: cfg.timeout };
    manifest.functions.push(entry);
    const tcfg = path.join(dest, 'config.json');
    if (fs.existsSync(tcfg)) {
      // config.json also carries openapi permissions (submitRun): only a `triggers` entry is a timer
      const t = (JSON.parse(fs.readFileSync(tcfg, 'utf8')).triggers || [])[0];
      if (t) manifest.timers.push({ deployName: prefix + fn, trigger: t.name, cron: t.config });
    }
  }
  fs.writeFileSync(path.join(out, 'MANIFEST.json'), JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}

module.exports = { pack };

if (require.main === module) {
  const a = process.argv.slice(2);
  const get = (k, d) => (a.indexOf(k) >= 0 ? a[a.indexOf(k) + 1] : d);
  const m = pack({ prefix: get('--prefix', 'dianjiangtai_'), out: path.resolve(get('--out', DEFAULT_OUT)) });
  console.log(`packed ${m.functions.length} functions (${m.timers.length} with timers) as ${m.prefix}<name>`);
}
