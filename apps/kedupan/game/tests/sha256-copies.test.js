'use strict';
// The main domain (mock server) and the open data context each carry their own sha256: the open data context is
// isolated, so neither may require the other's file. The two copies must hash identically (row hashes h are
// recomputed in the open data domain from the server's sha256(openid|salt)).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const main = require('../js/sha256');
const odc = require('../opendata/sha256');

test('js/sha256.js and opendata/sha256.js produce identical hashes (and match node crypto)', () => {
  const inputs = ['', 'a', 'abc', 'alice|0123456789abcdef', '中文|盐', '😀|x', 'x'.repeat(55), 'x'.repeat(56), 'x'.repeat(64), 'x'.repeat(1000)];
  for (let i = 0; i < 50; i++) inputs.push('openid' + i + '|' + crypto.randomBytes(16).toString('hex'));
  for (const s of inputs) {
    const want = crypto.createHash('sha256').update(s, 'utf8').digest('hex');
    assert.equal(main.sha256Hex(s), want, s);
    assert.equal(odc.sha256Hex(s), want, s);
  }
});

test('the copies differ only in the header comment', () => {
  const body = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8').replace(/\r\n/g, '\n').replace(/^\/\*\*[\s\S]*?\*\/\n/, '');
  assert.equal(body('js/sha256.js'), body('opendata/sha256.js'));
});
