'use strict';
// The ONLY place cloud functions touch the shared game core (copied into ../core by scripts/sync-core.js from
// apps/kedupan/game/core). Contract: game/core/README.md and cloudfunctions/CONTRACT.md. Logic lives in the core;
// functions only read documents, call these modules, and write inside their transaction.
const dateMod = require('../core/date');
const contentMod = require('../core/content');
const { CONFIG } = require('../core/config');
const { fail } = require('./util');

const core = {
  S: require('../core/score'),
  SV: require('../core/service'),
  W: require('../core/windows'),
  G: require('../core/group'),
  R: require('../core/rounds'),
  ST: require('../core/streak'),
  AD: require('../core/adpolicy'),
  SCH: require('../core/schedule'),
  P: require('../core/present'),
  ERR: require('../core/errors'),
  EV: require('../core/events'),
  RNG: require('../core/rng'),
  V: require('../core/input').V,
  // D-2 typed clues
  CLUE: require('../core/clue'),
  U: require('../core/ugc'),
  STK: require('../core/strikes'),
  MOD: require('../core/moderation'),
};

/** Beijing date key for a ms timestamp (core date.js; explicit UTC+8 arithmetic, TZ independent). */
function dateKeyAt(ms) {
  return dateMod.beijingDateKey(ms);
}

/** Indexed SERVER content (text + anchors + tags) for a version (default latest); SERVER_CONFIG if the library or the answer key is missing. */
function content(version) {
  const c = contentMod.getServerContent(version);
  if (!c) fail('SERVER_CONFIG', 'content library or answer key missing');
  return c;
}

/** The shipped schedule module or null (the auto path then takes over). */
function schedule() {
  return core.SCH.getSchedule();
}

/** Launch date key: env LAUNCH_DATE_KEY, else null (callers fall back to meta/launch, then CONFIG.daily.launchDateKey). */
function launchKeyFromEnv() {
  const k = process.env.LAUNCH_DATE_KEY;
  return typeof k === 'string' && /^\d{8}$/.test(k) ? k : null;
}

/** store.handler `rate` option for a client-callable function: the per-minute limit comes from CONFIG.limits.perMinute (M3). */
function rateOf(name) {
  const limit = CONFIG.limits.perMinute[name];
  if (!Number.isInteger(limit) || limit < 1) throw new Error('no per-minute rate limit configured for ' + name);
  return { name, limit };
}

module.exports = { core, CONFIG, dateMod, contentMod, dateKeyAt, content, schedule, launchKeyFromEnv, rateOf };
