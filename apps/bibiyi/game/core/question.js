/**
 * Question payloads (spec 11.2 "Question payload", AC 2, AC 18). One place
 * builds what a question looks like to a player, for free play on the client
 * and for the server-stepped daily on the server, so they cannot drift.
 *
 * The bottom card's value, raw number, note and source are NEVER part of the
 * question; they only exist in `revealOf` after the answer.
 */

const { BY_KEY } = require('./measures');
const F = require('./format');

function subOf(measure, fact) {
  return fact.sub || measure.subLabel;
}

/** Source details for the source sheet (spec 6.12). Plain text only; the URL is never opened. */
function infoOf(measure, fact) {
  return { subLabel: subOf(measure, fact), year: fact.year, publisher: fact.publisher, sourceTitle: fact.source, url: fact.url, retrievedAt: fact.retrievedAt || null, licence: fact.licence || null };
}

/** A card whose value is known (the top card). */
function knownFace(fact) {
  const m = BY_KEY[fact.measure];
  const face = {
    factId: fact.id, measure: m.key, label: fact.label, valueText: F.valueText(m, fact), unitText: F.unitText(m), approx: !!fact.approx,
    sourceText: F.sourceText(fact), info: infoOf(m, fact),
  };
  if (fact.sub) face.sub = fact.sub;
  return face;
}

/** A card whose value is hidden (the bottom card): label and unit only. */
function hiddenFace(fact) {
  const m = BY_KEY[fact.measure];
  const face = { factId: fact.id, measure: m.key, label: fact.label, unitText: F.unitText(m) };
  if (fact.sub) face.sub = fact.sub;
  return face;
}

/** What the player learns when the bottom card turns over. */
function revealOf(fact) {
  const m = BY_KEY[fact.measure];
  return {
    factId: fact.id, value: fact.value, valueText: F.valueText(m, fact), unitText: F.unitText(m), approx: !!fact.approx, sourceText: F.sourceText(fact),
    note: fact.note || null, info: infoOf(m, fact),
  };
}

/** question = deck.questions[k - 1]; byId resolves fact ids. */
function questionPayload(question, byId) {
  const a = byId[question.a];
  const b = byId[question.b];
  const m = BY_KEY[a.measure];
  return {
    k: question.k,
    segmentStart: !!question.segStart,
    measure: m.key,
    subLabel: subOf(m, b),
    topSubLabel: subOf(m, a),
    verbs: { hi: m.hi, lo: m.lo },
    top: knownFace(a),
    bottom: hiddenFace(b),
  };
}

/** "黄河 比 长江 ……" */
function promptText(payload) {
  return payload.bottom.label + ' 比 ' + payload.top.label + ' ……';
}

/** "下一组：比海拔" */
function segmentBannerText(payload) {
  return '下一组：比' + payload.subLabel;
}

/** Wording about the missed pair for the continue sheet / result: "黄河 5,464 公里 · 长江 6,300 公里". */
function pairText(top, bottom, reveal) {
  return bottom.label + ' ' + reveal.valueText + ' ' + reveal.unitText + ' · ' + top.label + ' ' + top.valueText + ' ' + top.unitText;
}

module.exports = { subOf, infoOf, knownFace, hiddenFace, revealOf, questionPayload, promptText, segmentBannerText, pairText };
