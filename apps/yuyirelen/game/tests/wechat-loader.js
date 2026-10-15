'use strict';
/**
 * Loads game modules with WeChat mini game resolution rules, so Node-only habits fail in tests:
 *  - only .js files can be required (".json" and anything else is "not defined" in WeChat)
 *  - the path is relative ("./x", "../x") or absolute from the game root; "x" resolves to "x.js"
 *  - no directory index resolution, no node_modules, no Node built-ins
 * Each loader has its own module cache (a fresh app per boot).
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createLoader(root, opts) {
  const hide = ((opts && opts.hide) || []).map((h) => path.join(root, h));
  const cache = new Map();

  function resolve(from, request) {
    if (!/^(\.{1,2})?\//.test(request)) {
      throw new Error(`WeChat cannot require "${request}" (from ${path.relative(root, from)}): only relative or absolute .js paths work (no Node built-ins or packages)`);
    }
    const base = request.startsWith('/') ? path.join(root, request) : path.resolve(path.dirname(from), request);
    const file = base.endsWith('.js') ? base : base + '.js';
    if (hide.some((h) => file.startsWith(h)) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      throw new Error(`module '${path.relative(root, file)}' is not defined, require args is '${request}'`);
    }
    return file;
  }

  function load(file) {
    if (cache.has(file)) return cache.get(file).exports;
    const mod = { exports: {} };
    cache.set(file, mod);
    const src = fs.readFileSync(file, 'utf8');
    const fn = vm.runInThisContext(`(function (module, exports, require) {${src}\n})`, { filename: file });
    fn(mod, mod.exports, (request) => load(resolve(file, request)));
    return mod.exports;
  }

  return { require: (fromFile, request) => load(resolve(fromFile, request)), load, resolve };
}

module.exports = { createLoader };
