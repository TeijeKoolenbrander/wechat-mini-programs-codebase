#!/usr/bin/env node
'use strict';
// Builds the folder the founder uploads from WeChat DevTools: one folder per function, named with the deploy prefix
// (TD-29: kedupan_getDaily, ...), each containing index.js, package.json, function.config.json, config.json (timers),
// common/ and core/ (synced first). Deploying is NEVER done here: this only copies files.
//   node scripts/deploy-pack.js [--prefix kedupan_] [--out <dir>]      (default out: game/cloudfunctions-deploy, TD-59)
const fs = require('fs');
const path = require('path');
const sync = require('./sync-core');

// inside the game project (ignored by packOptions) so DevTools accepts it as cloudfunctionRoot: TD-59
const DEFAULT_OUT = path.resolve(sync.CF_ROOT, '..', 'game', 'cloudfunctions-deploy');

function pack({ prefix = 'kedupan_', out = DEFAULT_OUT, root = sync.CF_ROOT, coreSrc = sync.DEFAULT_CORE } = {}) {
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
    // config.json carries a timer trigger and/or the cloud-call (openapi) permissions, uploaded with the function (D-2: setClue)
    const tcfg = path.join(dest, 'config.json');
    if (fs.existsSync(tcfg)) {
      const c = JSON.parse(fs.readFileSync(tcfg, 'utf8'));
      if (Array.isArray(c.triggers) && c.triggers.length) {
        const t = c.triggers[0];
        manifest.timers.push({ deployName: prefix + fn, trigger: t.name, cron: t.config });
      }
      const perms = c.permissions && Array.isArray(c.permissions.openapi) ? c.permissions.openapi.slice().sort() : [];
      if (perms.length) entry.openapi = perms;
    }
  }
  fs.writeFileSync(path.join(out, 'MANIFEST.json'), JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}

module.exports = { pack };

if (require.main === module) {
  const a = process.argv.slice(2);
  const get = (k, d) => (a.indexOf(k) >= 0 ? a[a.indexOf(k) + 1] : d);
  const m = pack({ prefix: get('--prefix', 'kedupan_'), out: path.resolve(get('--out', DEFAULT_OUT)) });
  console.log(`packed ${m.functions.length} functions (${m.timers.length} with timers) as ${m.prefix}<name>`);
}
