'use strict';
// Documented change list for the prompt bank: swaps applied after spec Appendix B was written. Empty since the spec was
// re-synced (Appendix B now lists the 22 swapped texts: content-fixes.md 1.2 + three CTO-approved QA swaps, decisions TD-90),
// so tests/qa-content.test.js compares the shipped bank directly with the spec. Add an entry
// `ID: { old: '<spec text>', new: '<shipped text>' }` only for a deliberate divergence that is not yet in the spec.
const CHANGES = {};

module.exports = { CHANGES };
