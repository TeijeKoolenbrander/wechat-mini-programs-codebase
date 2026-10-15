/**
 * Forbidden vocabulary (spec 3.6, PO-1, AC 9). The terms are written as
 * unicode escapes on purpose, so a plain text search of the source for the
 * banned words stays clean and only this file is exempt from that search.
 * Matching is a case-insensitive substring test.
 */

const FORBIDDEN_TERMS = [
  '\u731c\u5927\u5c0f',
  '\u6bd4\u5927\u5c0f',
  '\u5927\u5c0f',
  '\u62bc',
  '\u4e0b\u6ce8',
  '\u8d4c',
  '\u8d4c\u6ce8',
  '\u7ffb\u500d',
  '\u52a0\u500d',
  '\u7b79\u7801',
  '\u91d1\u5e01',
  '\u500d\u7387',
  '\u8d54\u7387',
  '\u5e84\u5bb6',
  '\u68ad\u54c8',
  '\u9ab0',
  '\u9ab0\u5b50',
  '\u5f69\u7968',
  '\u4e2d\u5956',
  '\u5956\u6c60',
  '\u62bd\u5956',
  '\u5f00\u5956',
  '\u8fd0\u6c14',
  '\u624b\u6c14',
  '\u590d\u6d3b\u5e01',
  '\u66f4\u9ad8\u66f4\u4f4e',
  'Higher Lower',
  'Higher or Lower',
];

/** Returns the first forbidden term found in `text`, or null. */
function findForbidden(text) {
  const s = String(text === undefined || text === null ? '' : text).toLowerCase();
  for (let i = 0; i < FORBIDDEN_TERMS.length; i++) {
    if (s.indexOf(FORBIDDEN_TERMS[i].toLowerCase()) >= 0) return FORBIDDEN_TERMS[i];
  }
  return null;
}

module.exports = { FORBIDDEN_TERMS, findForbidden };
