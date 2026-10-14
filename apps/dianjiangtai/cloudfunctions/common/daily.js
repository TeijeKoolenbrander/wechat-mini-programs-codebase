'use strict';
// Daily seed creation, shared by genDaily (timer) and getDaily (lazy fallback). Spec §5.2.
const crypto = require('crypto');
const core = require('./coreapi');
const store = require('./store');
const { AppError, isDateKey, daysBetween, randomSeed, now } = require('./util');

const MAX_LIVE_CANDIDATES = 50;
const LIVE_BUDGET_FRACTION = 0.7;
const BANK_LOW_WATER = 7;
const BANK_SCAN = 20;

/** Launch date key: env override, else the first seed ever created (stored once in `meta`). */
async function launchKey(dateKey) {
  const env = process.env.LAUNCH_DATE_KEY;
  if (isDateKey(env)) return env;
  let m = await store.getDoc('meta', 'launch');
  if (!m) {
    await store.addIfAbsent('meta', { _id: 'launch', dateKey });
    m = await store.getDoc('meta', 'launch');
  }
  return m.dateKey;
}
async function issueNoFor(dateKey) {
  const launch = await launchKey(dateKey);
  return Math.max(1, daysBetween(launch, dateKey) + 1);
}

function bankFilter(v) {
  return { used: false, contentVersion: v.contentVersion, configVersion: v.configVersion, gateVersion: v.gateVersion };
}
async function bankLeft(v) {
  const r = await store.db().collection('daily_seed_bank').where(bankFilter(v)).count();
  return r.total;
}

/** Cheap re-check of a bank entry: the stored best lineup still scores 12-0 on the rebuilt sheet. */
function bankEntryStillValid(entry, v) {
  try {
    const rounds = core.buildSheet(entry.seed, v.contentVersion);
    const lineup = core.normaliseLineup(entry.best && entry.best.lineup);
    if (!rounds || !lineup) return null;
    const r = core.simulate(lineup, entry.seed, v.contentVersion, v.configVersion).record;
    return r.w === 12 && r.l === 0 ? rounds : null;
  } catch (e) {
    return null;
  }
}

/**
 * Create daily_seeds/<dateKey> once. `add` with the fixed _id is the uniqueness mechanism; when a bank
 * entry is used it is marked in the SAME transaction, so a losing writer rolls back and consumes nothing.
 * Throws code EXISTS if the day already has a document.
 */
async function commitSeed(doc, bankId) {
  try {
    await store.db().runTransaction(async (t) => {
      if (bankId) {
        const b = await store.getDocT(t, 'daily_seed_bank', bankId);
        if (!b || b.used) throw new AppError('BANK_USED', 'BANK_USED');
      }
      await t.collection('daily_seeds').add({ data: doc }); // duplicate _id fails -> rollback
      if (bankId) {
        await t.collection('daily_seed_bank').doc(bankId).update({ data: { used: true, usedFor: doc._id } });
      }
    });
  } catch (e) {
    if (e && (e.code === 'BANK_USED' || /BANK_USED/.test(String(e.message)))) throw new AppError('BANK_USED', 'BANK_USED');
    if (store.isDup(e)) throw new AppError('EXISTS', 'EXISTS');
    throw e;
  }
}

async function tryBank(dateKey, v, issueNo, t0) {
  const res = await store.db().collection('daily_seed_bank').where(bankFilter(v)).orderBy('_id', 'asc').limit(BANK_SCAN).get();
  for (const entry of res.data) {
    const rounds = bankEntryStillValid(entry, v);
    if (!rounds) {
      console.warn('[daily] bank entry failed re-check, skipped', entry._id);
      continue;
    }
    const doc = {
      _id: dateKey, seed: entry.seed, issueNo, contentVersion: v.contentVersion, configVersion: v.configVersion,
      rounds, best: entry.best, gates: entry.gates, source: 'bank', attempts: 0, genMs: now() - t0,
      boardSalt: crypto.randomBytes(16).toString('hex'), createdAt: now(),
    };
    try {
      await commitSeed(doc, entry._id);
    } catch (e) {
      if (e.code === 'EXISTS') return { doc: await store.getDoc('daily_seeds', dateKey), created: false };
      if (e.code === 'BANK_USED') continue;
      throw e;
    }
    const left = await bankLeft(v);
    if (left < BANK_LOW_WATER) console.warn(`[daily] WARNING seed bank low: ${left} entries left`);
    return { doc, created: true, bankLeft: left };
  }
  return null;
}

async function live(dateKey, v, issueNo, t0, startedAt, timeoutMs) {
  const budget = LIVE_BUDGET_FRACTION * timeoutMs;
  let attempts = 0;
  let chosen = null;
  let reached12 = null;
  let last = null;
  do {
    attempts++;
    const seed = randomSeed();
    const r = core.acceptDailySeed(seed);
    last = { seed, gates: r.gates || {} };
    if (r.ok) { chosen = last; break; }
    if (!reached12 && last.gates.optimal && last.gates.optimal.w === 12) reached12 = last;
  } while (attempts < MAX_LIVE_CANDIDATES && now() - startedAt < budget);

  let relaxed = false;
  if (!chosen) {
    relaxed = true;
    chosen = reached12 || last;
  }
  const rounds = core.buildSheet(chosen.seed, v.contentVersion);
  const best = core.bestLineup(chosen.seed, v.contentVersion, core.primaryTokens(rounds));
  const doc = {
    _id: dateKey, seed: chosen.seed, issueNo, contentVersion: v.contentVersion, configVersion: v.configVersion,
    rounds, best, gates: { ...chosen.gates, relaxed }, source: 'live', attempts, genMs: now() - t0,
    boardSalt: crypto.randomBytes(16).toString('hex'), createdAt: now(),
  };
  try {
    await commitSeed(doc, null);
  } catch (e) {
    if (e.code === 'EXISTS') return { doc: await store.getDoc('daily_seeds', dateKey), created: false };
    throw e;
  }
  if (relaxed) console.error(`[ALERT] daily seed ${dateKey} is relaxed (gates not met); refill the seed bank`);
  return { doc, created: true, bankLeft: 0 };
}

/**
 * Returns {doc, created, bankLeft?}. Idempotent per dateKey.
 * @param startedAt handler start (ms); the live loop stops at 70% of the configured timeout from here
 */
async function ensureDaily(dateKey, { startedAt = now(), timeoutMs } = {}) {
  const existing = await store.getDoc('daily_seeds', dateKey);
  if (existing) return { doc: existing, created: false };
  const t0 = now();
  const v = core.currentVersions();
  const issueNo = await issueNoFor(dateKey);
  const fromBank = await tryBank(dateKey, v, issueNo, t0);
  if (fromBank) return fromBank;
  return live(dateKey, v, issueNo, t0, startedAt, timeoutMs);
}

module.exports = { ensureDaily, issueNoFor, MAX_LIVE_CANDIDATES, LIVE_BUDGET_FRACTION, BANK_LOW_WATER };
