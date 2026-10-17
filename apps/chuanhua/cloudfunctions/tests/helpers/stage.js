'use strict';
// Stages cloudfunctions/common + the game core into a temp function folder (what sync-core.js does for every function),
// so common/*.js can be required exactly as a deployed function would (`../core/...`).
const fs = require('fs');
const os = require('os');
const path = require('path');
const sync = require('../../scripts/sync-core');

let root = null;
function stage() {
  if (root) return root;
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ch-stage-'));
  const fn = path.join(root, 'fn');
  fs.mkdirSync(fn);
  sync.copyDir(path.join(sync.CF_ROOT, 'common'), path.join(fn, 'common'));
  sync.copyDir(sync.DEFAULT_CORE, path.join(fn, 'core'));
  return fn;
}

module.exports = { stage };
