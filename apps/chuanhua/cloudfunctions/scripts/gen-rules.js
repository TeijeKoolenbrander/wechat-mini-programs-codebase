#!/usr/bin/env node
'use strict';
// Generates database/rules.json from game/core/schema.js (the single source): every collection deny-all for clients, EXCEPT chuanhua_room_signals,
// whose custom rule lets a player read only their own signal documents (spec 3A.7, 13.4). Usage: node scripts/gen-rules.js [--check]
const fs = require('fs');
const path = require('path');
const sync = require('./sync-core');
const schema = require(path.join(sync.DEFAULT_CORE, 'schema'));

const FILE = path.join(sync.CF_ROOT, 'database', 'rules.json');

function build() {
  const out = {
    _comment: 'Cloud database security rules, one entry per PHYSICAL collection (prefix chuanhua_ because the test cloud environment is shared across apps). Every collection is deny-all for clients (spec 13, AC 57): the mini game never reads or writes the database directly; all content goes through cloud functions, which run with admin rights and bypass these rules. THE ONE EXCEPTION is chuanhua_room_signals: a content-free per-seat doorbell (room id, seq, state, round, kind, phase, deadline, serverNow, counts, the owner _openid) that the client watch()es; its custom read rule is `doc._openid == auth.openid` (a player reads only their own documents), write stays false (only functions write it). Paste each value into the console (Database > collection > Permissions > Custom rules). Generated from game/core/schema.js by scripts/gen-rules.js; tests/security.test.js keeps them in sync.',
  };
  return Object.assign(out, schema.denyAllRules());
}

module.exports = { build, FILE };

if (require.main === module) {
  const text = JSON.stringify(build(), null, 2) + '\n';
  if (process.argv.includes('--check')) {
    if (!fs.existsSync(FILE) || fs.readFileSync(FILE, 'utf8').replace(/\r\n/g, '\n') !== text) {
      console.error('database/rules.json is stale: run node scripts/gen-rules.js');
      process.exit(1);
    }
    console.log('rules ok');
  } else {
    fs.writeFileSync(FILE, text);
    console.log('wrote ' + FILE);
  }
}
