'use strict';
// daily_progress helpers: progressive token delivery (spec 5.2).
const { fail } = require('./util');

/** canonical form of a whitelisted action, for exact prefix comparison */
function canon(a) {
  return JSON.stringify([a.round, a.type, a.generalId || null, a.slot || null, a.source || null]);
}
/** is `a` an exact prefix of `b`? */
function isPrefix(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length > b.length) return false;
  for (let i = 0; i < a.length; i++) if (canon(a[i]) !== canon(b[i])) return false;
  return true;
}
function progressId(dateKey, openid) {
  return `${dateKey}_${openid}`;
}
/** rounds[0..released) only: the single place a response may slice a sheet */
function releasedRounds(rounds, released) {
  if (!Array.isArray(rounds) || !Number.isInteger(released) || released < 1) fail('NOT_STARTED', 'no rounds released');
  return rounds.slice(0, Math.min(5, released));
}

module.exports = { canon, isPrefix, progressId, releasedRounds };
