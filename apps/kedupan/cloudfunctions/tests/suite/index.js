'use strict';
// The shared contract suite. `registerSuite('mock')` runs it against the mock server the client is built on;
// `registerSuite('real')` runs the SAME tests against the cloud functions on the fake database. Both must pass, which is
// what makes the mock and the functions provably the same contract (CONTRACT.md section 3).
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeBackend, disposeStages } = require('../helpers/backends');

function registerSuite(kind) {
  const T = {
    kind,
    assert,
    test(name, opts, fn) {
      if (typeof opts === 'function') {
        fn = opts;
        opts = {};
      }
      test(`[${kind}] ${name}`, async () => {
        const be = makeBackend(kind, opts);
        try {
          await fn(be);
        } finally {
          be.dispose();
        }
      });
    },
  };
  require('./daily')(T);
  require('./archive')(T);
  require('./groups')(T);
  require('./rounds')(T);
  require('./misc')(T);
  require('./clues')(T);
  require('./admin')(T);
  test.after(() => disposeStages());
}

module.exports = { registerSuite };
