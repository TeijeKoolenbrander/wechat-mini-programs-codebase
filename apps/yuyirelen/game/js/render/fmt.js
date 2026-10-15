/**
 * Small formatting helpers. Pure. Logic pre-formats every string in the view
 * models (spec 13); these exist so fixtures and tests build the same strings,
 * and logic MAY reuse them.
 */

/** 1284 -> "1,284". */
function thousands(n) {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** 1284 -> "第 1,284 名" (spec 4.3). */
function rankLabel(n) {
  return '第 ' + thousands(n) + ' 名';
}

/** Rank -> band key (spec 4.3). */
function bandKey(rank) {
  if (rank <= 1) return 'hit';
  if (rank <= 10) return 'boil';
  if (rank <= 100) return 'scald';
  if (rank <= 500) return 'hot';
  if (rank <= 2000) return 'warm';
  return 'cold';
}

/** Temperature 0..100 from a rank for a vocabulary of V words (spec 4.3). */
function temperature(rank, V) {
  return Math.round(100 * (1 - Math.log(rank) / Math.log(V || 30000)));
}

module.exports = { thousands, rankLabel, bandKey, temperature };
