/**
 * Number and value formatting (spec 3.2, 15.31-32, AC 82). The renderer never
 * formats: it draws the strings produced here. All facts of one measure share
 * one unit and scale, so both cards of a question always match.
 */

function groupInt(s) {
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** 1234567.891, 2 -> "1,234,567.89". Negative values keep their sign. */
function fixedWithSeparators(n, decimals) {
  const neg = n < 0;
  const parts = Math.abs(n).toFixed(decimals).split('.');
  return (neg ? '-' : '') + groupInt(parts[0]) + (parts[1] ? '.' + parts[1] : '');
}

/** -221 -> "公元前221", 1420 -> "1420". */
function yearText(y) {
  return y < 0 ? '公元前' + -y : String(y);
}

/** The number part of a value, without the approx mark and without the unit. */
function numberText(measure, value) {
  if (measure.kind === 'year') return yearText(value);
  return fixedWithSeparators(value / measure.scale, measure.decimals);
}

/** Text shown for a revealed value: "6,300", or "约 6,300" when approximate. */
function valueText(measure, fact) {
  return (fact.approx ? '约' : '') + numberText(measure, fact.value);
}

function unitText(measure) {
  return measure.unit;
}

/** The rounded number the player actually sees, for the "no visual tie" rule (spec 4.1 rule 4). */
function displayNumber(measure, value) {
  if (measure.kind === 'year') return value;
  const f = Math.pow(10, measure.decimals);
  return Math.round((value / measure.scale) * f) / f;
}

/** "来源：<publisher> · <year>" */
function sourceText(fact) {
  return '来源：' + fact.publisher + ' · ' + fact.year;
}

module.exports = { fixedWithSeparators, yearText, numberText, valueText, unitText, displayNumber, sourceText };
