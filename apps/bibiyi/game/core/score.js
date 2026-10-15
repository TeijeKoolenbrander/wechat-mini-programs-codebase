/**
 * Result wording and rarity (spec 6.5, PO-30). Copy is about the player's
 * run, never about places or things (spec 3.6).
 */

const COMMENTS = [
  { max: 2, text: '热身一下，再来！' },
  { max: 7, text: '不错的开局' },
  { max: 14, text: '有点东西' },
  { max: 24, text: '活地图本图' },
  { max: 1e9, text: '这都知道？！' },
];

/** The fixed comment line for a streak band. */
function commentFor(streak) {
  for (let i = 0; i < COMMENTS.length; i++) if (streak <= COMMENTS[i].max) return COMMENTS[i].text;
  return COMMENTS[COMMENTS.length - 1].text;
}

/** "14" or "18（含再答一次）" */
function streakText(streak, lifeUsed) {
  return lifeUsed ? streak + '（含再答一次）' : String(streak);
}

/**
 * Share of players at or below `streak` ("超过今日 X% 的玩家"): hist[n] = players
 * with streak n. Returns null below `minTotal` results.
 */
function rarityShare(hist, total, streak, minTotal) {
  if (!hist || total < minTotal) return null;
  let below = 0;
  for (let n = 0; n < streak && n < hist.length; n++) below += hist[n];
  return below / total;
}

function rarityText(share) {
  if (share === null || share === undefined) return null;
  return '超过今日 ' + Math.floor(share * 100) + '% 的玩家';
}

/** Day streak line, only from 2 days. */
function dayStreakText(n) {
  return n >= 2 ? '连续 ' + n + ' 天' : null;
}

module.exports = { COMMENTS, commentFor, streakText, rarityShare, rarityText, dayStreakText };
