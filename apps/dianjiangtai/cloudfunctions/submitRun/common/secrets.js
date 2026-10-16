'use strict';
// Secrets come from the cloud environment's variables only; nothing is stored in the repo.
const { fail } = require('./util');

/** the pepper keys the HMACs of group refs and challenge ids: a short one is brute-forceable from the public outputs (L5) */
const MIN_PEPPER_LENGTH = 32;

function pepper() {
  const p = process.env.GROUP_REF_PEPPER;
  if (typeof p !== 'string' || p.length < MIN_PEPPER_LENGTH) fail('SERVER_CONFIG', 'GROUP_REF_PEPPER is not configured (>= ' + MIN_PEPPER_LENGTH + ' characters)');
  return p;
}

module.exports = { MIN_PEPPER_LENGTH, pepper };
