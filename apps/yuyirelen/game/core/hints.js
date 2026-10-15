/**
 * Hint ladder rules (spec 4.4, PO-4). Pure; shared with the cloud functions by copy.
 *
 *  - Four free hints unlock at steps 10 / 20 / 30 / 40 and each used hint adds 1 step.
 *  - Hint 3 gives the answer's first character; hints 1, 2, 4 give a word.
 *  - Word hint target rank t = min(cap, max(2, floor(best / 2))); `best` = the player's
 *    best rank so far (V if none). Never rank 1.
 *  - Rewarded hints (unranked only): same rule with no cap, <= 3 per puzzle.
 */

/**
 * Where the ladder stands. `used` = ladder hint numbers already used, e.g. [1,2].
 * -> { next: 1..4 | null, state: 'locked'|'available'|'exhausted', threshold, label }
 */
function hintStatus(cfg, steps, used) {
  const n = used.length;
  if (n >= cfg.hints.thresholds.length) return { next: null, state: 'exhausted', threshold: null, label: '提示已用完' };
  const k = n + 1;
  const threshold = cfg.hints.thresholds[k - 1];
  if (steps < threshold) return { next: k, state: 'locked', threshold, label: '第 ' + threshold + ' 步后可用提示' };
  return { next: k, state: 'available', threshold, label: '提示 ' + k + ' 可用' };
}

/** Hints that became available when steps moved from `before` to `after` (for hint_unlock events). */
function newlyUnlocked(cfg, before, after) {
  const out = [];
  cfg.hints.thresholds.forEach((t, i) => {
    if (before < t && after >= t) out.push(i + 1);
  });
  return out;
}

/** Target rank for a ladder word hint k (1, 2 or 4). cap from config. */
function hintTargetRank(cfg, k, best) {
  const cap = cfg.hints.caps[k - 1];
  const half = Math.max(2, Math.floor(best / 2));
  return cap === null || cap === undefined ? half : Math.min(cap, half);
}

/** Target rank for a rewarded hint (no cap). */
function adTargetRank(best) {
  return Math.max(2, Math.floor(best / 2));
}

/** best rank 2 means one step away: word hints are not consumed (spec 4.4). */
function atBest(best) {
  return best !== null && best !== undefined && best <= 2;
}

/**
 * Choose the hint rank: target t, or the next CLOSER free rank (t-1 ... 2); if none is
 * free, step outward (t+1 ...). Never rank 1. `isTaken(r)` is true when rank r is already
 * in the ladder, is a listed synonym, or has no word. Returns null if nothing is free.
 */
function pickHintRank(target, isTaken, maxRank) {
  const t = Math.max(2, Math.min(target, maxRank));
  for (let r = t; r >= 2; r--) if (!isTaken(r)) return r;
  for (let r = t + 1; r <= maxRank; r++) if (!isTaken(r)) return r;
  return null;
}

module.exports = { hintStatus, newlyUnlocked, hintTargetRank, adTargetRank, atBest, pickHintRank };
