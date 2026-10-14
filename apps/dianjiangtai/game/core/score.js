/**
 * Display helpers shared by client and server: per-slot role scores for a
 * lineup and the 说书人 评语 (spec 8.3). Pure JS.
 */

const { SLOTS, fitOf } = require('./content');

/** [{slot, generalId, name, score, fit}] in slot order for a lineup of {slot, generalId}. */
function lineupDetail(content, lineup) {
  const byslot = {};
  for (const e of lineup) byslot[e.slot] = e.generalId;
  return SLOTS.map((slot, k) => {
    const id = byslot[slot];
    if (!id || content.indexOf[id] === undefined) return { slot, generalId: id || null, name: null, score: null, fit: null };
    const gi = content.indexOf[id];
    const score = content.roleScores[gi][k];
    return { slot, generalId: id, name: content.generals[gi].name, score, fit: fitOf(score) };
  });
}

/**
 * One-line verdict: the strongest slot, then a regret about the weakest, for
 * example "猛将如云，可惜城头少一员稳将。" Ends use fixed lines.
 */
function commentFor(content, lineup, wins) {
  const t = content.texts;
  if (wins >= 12) return t.commentPerfect;
  if (wins <= 1) return t.commentWorst;
  const d = lineupDetail(content, lineup);
  let hi = 0;
  let lo = 0;
  for (let i = 1; i < d.length; i++) {
    if (d[i].score > d[hi].score) hi = i;
    if (d[i].score < d[lo].score) lo = i;
  }
  if (hi === lo) return t.strong[d[hi].slot] + '。';
  return t.strong[d[hi].slot] + '，' + t.weak[d[lo].slot] + '。';
}

module.exports = { lineupDetail, commentFor };
