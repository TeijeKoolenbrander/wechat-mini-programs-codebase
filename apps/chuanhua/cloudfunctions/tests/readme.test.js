'use strict';
// The README is the founder's deploy guide: it must name every deployed function, collection, index, environment variable,
// timer and the push-route settings, so nothing the code needs is left to guesswork.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const sync = require('../scripts/sync-core');
const schema = require(path.join(sync.DEFAULT_CORE, 'schema'));

const readme = fs.readFileSync(path.join(sync.CF_ROOT, 'README.md'), 'utf8');

test('README: every function has its folder and its prefixed deployed name (TD-19)', () => {
  for (const fn of Object.keys(schema.FUNCTIONS)) {
    assert.ok(readme.includes('`' + fn + '`'), 'folder ' + fn);
    assert.ok(readme.includes('`chuanhua_' + fn + '`'), 'deployed name chuanhua_' + fn);
  }
  assert.match(readme, /fnPrefix/);
  assert.match(readme, /build-config\.js/);
});

test('README: every collection, every index, every environment variable and both timers are listed', () => {
  for (const c of schema.PHYSICAL_COLLECTIONS) assert.ok(readme.includes(c), c);
  for (const [name, def] of Object.entries(schema.COLLECTIONS)) {
    for (const idx of def.indexes) assert.ok(readme.includes('`' + idx.join(' + ') + '`'), `${name} index ${idx.join(' + ')}`);
  }
  for (const v of schema.ENV_VARS) assert.ok(readme.includes(v), v);
  for (const f of Object.values(schema.FUNCTIONS)) if (f.timer) assert.ok(readme.includes(f.timer), f.timer);
  for (const op of schema.ADMIN_OPS) assert.ok(readme.includes(op), 'admin op ' + op);
});

test('README: the push-route console step names the event, the function and the fallback settings', () => {
  assert.match(readme, /wxa_media_check/);
  assert.match(readme, /chuanhua_onMediaCheck/);
  assert.match(readme, /消息推送/);
  assert.match(readme, /PUSH_TOKEN/);
  assert.match(readme, /PUSH_AES_KEY/);
  assert.match(readme, /storage\.rules\.json/);
  assert.match(readme, /database\/rules\.json/);
  assert.doesNotMatch(readme, /(secret|token|key)\s*[:=]\s*['"`][A-Za-z0-9]{16,}/i, 'no secret value in the README');
});
