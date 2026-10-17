#!/usr/bin/env node
'use strict';
// Generates the per-function deploy files from the machine-readable inventory (game/core/schema.js) so they cannot drift
// from the contract: package.json, function.config.json (timeout), config.json (openapi permissions + timer trigger).
// The function code (index.js) is hand-written. Usage: node scripts/scaffold.js [--check]
const fs = require('fs');
const path = require('path');
const sync = require('./sync-core');
const schema = require(path.join(sync.DEFAULT_CORE, 'schema'));

/**
 * Permissions the CODE needs beyond schema.FUNCTIONS[fn].openapi (contract deviations, see README / TD-27):
 * getChain creates the activity id lazily; revealNow updates the card at reveal.
 */
const EXTRA_OPENAPI = {
  getChain: ['updatableMessage.createActivityId'],
  revealNow: ['updatableMessage.setUpdatableMsg'],
};

const DEPLOY_PREFIX = 'chuanhua_'; // names in the shared test environment (README "Naming in the shared environment")

function filesFor(fn) {
  const def = schema.FUNCTIONS[fn];
  const openapi = [...new Set([...(def.openapi || []), ...(EXTRA_OPENAPI[fn] || [])])].sort();
  const cfg = {};
  if (openapi.length) cfg.permissions = { openapi };
  if (def.timer) cfg.triggers = [{ name: DEPLOY_PREFIX + fn + '_timer', type: 'timer', config: def.timer }];
  return {
    'package.json': {
      name: 'chuanhua-' + fn.toLowerCase(),
      version: '1.0.0',
      private: true,
      main: 'index.js',
      dependencies: { 'wx-server-sdk': '~2.6.3' },
    },
    'function.config.json': { timeout: def.timeoutSec, memorySize: ['submitStep', 'submitRoomStep', 'modSweeper', 'roomSweeper', 'cleanup'].includes(fn) ? 512 : 256, envVariables: { TZ: 'Asia/Shanghai' } },
    'config.json': cfg,
  };
}

function run(check) {
  const problems = [];
  for (const fn of Object.keys(schema.FUNCTIONS)) {
    const dir = path.join(sync.CF_ROOT, fn);
    for (const [name, obj] of Object.entries(filesFor(fn))) {
      if (name === 'config.json' && !Object.keys(obj).length) {
        if (!check) fs.writeFileSync(path.join(dir, name), '{}\n');
        continue;
      }
      const text = JSON.stringify(obj, null, 2) + '\n';
      const p = path.join(dir, name);
      if (check) {
        if (!fs.existsSync(p) || fs.readFileSync(p, 'utf8') !== text) problems.push(p);
      } else {
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(p, text);
      }
    }
  }
  return problems;
}

module.exports = { filesFor, run, EXTRA_OPENAPI, DEPLOY_PREFIX };

if (require.main === module) {
  const check = process.argv.includes('--check');
  const problems = run(check);
  if (problems.length) {
    console.error('DRIFT:\n' + problems.join('\n') + '\nrun: node scripts/scaffold.js');
    process.exit(1);
  }
  console.log(check ? 'no drift' : 'scaffolded ' + Object.keys(schema.FUNCTIONS).length + ' functions');
}
