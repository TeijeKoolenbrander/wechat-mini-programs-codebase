'use strict';
// Shared helpers for the smoke tests.
const { boot, prepare, answer, correctFrom } = require('./harness');
const { getContent } = require('../core/content');

const FREE = getContent(1);
const freeLookup = correctFrom(FREE.byId);
const events = (g) => g.app.api.mock.db.events.concat(g.app.analytics.queue);
const names = (g) => events(g).map((e) => e.name);
const count = (g, name) => names(g).filter((n) => n === name).length;
const dailyLookup = (g) => correctFrom(g.app.api.mock.allIndex.byId);

async function startUp(t, opts) {
  const g = boot(t, opts);
  await g.settle();
  return g;
}

async function closeHowto(g) {
  if (g.has('sheet:close')) g.tapId('sheet:close');
}

/** play `n` right answers in the current run */
async function rights(g, n, lookup) {
  for (let i = 0; i < n; i++) await answer(g, 'right', lookup || freeLookup);
}

/** miss and wait out the pause: the continue sheet or the result is showing afterwards */
async function miss(g, lookup) {
  await answer(g, 'wrong', lookup || freeLookup, { stopAtMiss: true });
  g.wait(1300);
  g.frame();
  await g.settle();
}

/** record every mock response so payloads can be inspected */
function capture(g) {
  const mock = g.app.api.mock;
  const log = [];
  const orig = mock.call.bind(mock);
  mock.call = (name, data, who) => {
    const r = orig(name, data, who);
    log.push({ name, data, who, res: JSON.parse(JSON.stringify(r)) });
    return r;
  };
  return log;
}

module.exports = { prepare, FREE, freeLookup, events, names, count, dailyLookup, startUp, closeHowto, rights, miss, capture, boot, answer, correctFrom };
