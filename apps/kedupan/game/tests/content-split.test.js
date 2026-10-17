'use strict';
// TD-62 / M2: the client library carries text only; the answer key (anchors, tags) is a separate server-only module.
const test = require('node:test');
const assert = require('node:assert/strict');
const content = require('../core/content');
const clientLib = require('../core/content/spectra.v1.js');
const keyLib = require('../core/content/anchors.v1.js');

test('the client library carries no answer key; the key covers exactly the same items', () => {
  const ids = [];
  clientLib.spectra.forEach((s) => s.items.forEach((it) => {
    ids.push(it.id);
    assert.deepEqual(Object.keys(it).sort(), ['id', 'text'], it.id + ' must have only id and text');
  }));
  assert.deepEqual(Object.keys(keyLib.items).sort(), ids.slice().sort());
  assert.equal(keyLib.contentVersion, clientLib.contentVersion);
  const c = content.getContent();
  assert.equal(c.hasAnchors, false);
  assert.ok(content.getServerContent().hasAnchors);
  assert.equal(content.cardOf(c, ids[0]).anchor, undefined);
});

test('a key that disagrees with the library is refused', () => {
  const raw = { contentVersion: 2, categories: [{ key: 'a', label: 'A' }], spectra: [{ id: 's001', left: 'l', right: 'r', cat: 'a', items: [{ id: 's001i01', text: 't' }] }] };
  assert.deepEqual(content.mergeAnswerKey(raw, { contentVersion: 2, items: { s001i01: { anchor: 40, tags: ['split'] } } }).errors, []);
  assert.ok(content.mergeAnswerKey(raw, { contentVersion: 2, items: {} }).errors.some((e) => /no entry/.test(e)));
  assert.ok(content.mergeAnswerKey(raw, { contentVersion: 2, items: { s001i01: { anchor: 40, tags: [] }, s001i02: { anchor: 40, tags: [] } } }).errors.some((e) => /without a library item/.test(e)));
  assert.ok(content.mergeAnswerKey(raw, { contentVersion: 3, items: { s001i01: { anchor: 40, tags: [] } } }).errors.some((e) => /contentVersion/.test(e)));
  assert.ok(content.mergeAnswerKey(raw, { contentVersion: 2, items: { s001i01: { anchor: 3, tags: ['x'] } } }).errors.length >= 2);
});

test('isMissingModule recognises the Node and the WeChat wording', () => {
  assert.ok(content.isMissingModule(Object.assign(new Error('x'), { code: 'MODULE_NOT_FOUND' })));
  assert.ok(content.isMissingModule(new Error("module 'core/content/anchors.v1.js' is not defined, require args is './content/anchors.v1'")));
  assert.ok(!content.isMissingModule(new SyntaxError('Unexpected token')));
});
