'use strict';
// admin takedown ops (D-2, AC 93), run against the mock server AND the real function: the console path (no OPENID), the
// FORBIDDEN gate, strikes from an upheld report, restore / delete, restrictions, the kill switches and the audit trail.
// (Allow-listed openids, rate limits and the full response shapes are in clues-real.test.js.)
const assert = require('node:assert/strict');

const flat = (x) => JSON.stringify(x);
const GOOD = '冬天的被窝';
const DAY = 86400e3;

module.exports = function admin(T) {
  const { test } = T;
  const adm = (be, d, who) => be.call(who === undefined ? null : who, 'admin', d);

  async function reported(be, host, reporter, text) {
    await be.call(host, 'agreeRules', { rulesVersion: 1 });
    const r = await be.call(host, 'createRound', { spectrumId: be.content.spectra[3].id });
    const c = await be.call(host, 'setClue', { roundId: r.roundId, clueMode: 'text', clueText: text || GOOD });
    assert.equal(c.ok, true, flat(c));
    assert.equal((await be.call(reporter, 'reportClue', { roundId: r.roundId, reason: 'abuse' })).ok, true);
    return r;
  }

  test('AC 93: admin: an OPENID that is not allow-listed is FORBIDDEN and changes nothing; the console (no OPENID) works; unknown ops are INVALID_INPUT; every write op writes one audit row', async (be) => {
    const r = await reported(be, 'host', 'rep');
    for (const who of ['host', 'rep', 'rando']) assert.equal((await adm(be, { op: 'restoreClue', roundId: r.roundId }, who)).code, 'FORBIDDEN', who);
    assert.equal((await be.auditLog()).length, 0);
    assert.equal((await be.call('g', 'getRound', { roundId: r.roundId })).clue.state, 'hidden', 'nothing restored');
    for (const bad of [{}, { op: 'nope' }, { op: 5 }, { op: 'constructor' }, { op: 'toString' }]) assert.equal((await adm(be, bad)).code, 'INVALID_INPUT', flat(bad));
    const list = await adm(be, { op: 'listReports' });
    assert.equal(list.ok, true);
    assert.equal(list.items.length, 1);
    assert.equal(list.items[0].clue.text, GOOD);
    assert.ok(!flat(list).includes('"rep"') && !flat(list).includes('host"'), 'neither reporter nor host named');
    assert.equal((await be.auditLog()).length, 0, 'reads write no audit row');
    assert.equal((await adm(be, { op: 'restoreClue', roundId: r.roundId })).restored, true);
    assert.equal((await be.auditLog()).length, 1);
    assert.equal((await be.auditLog())[0].op, 'restoreClue');
    assert.equal((await be.auditLog())[0].by, 'console');
    assert.equal((await be.call('g', 'getRound', { roundId: r.roundId })).clue.text, GOOD);
  });

  test('AC 92/93: upholdReport hides, upholds and strikes the host ONCE; dismissReport {restore} shows the clue again; deleteClue removes the text and keeps the evidence', async (be) => {
    const r = await reported(be, 'host', 'rep1');
    await be.call('rep2', 'reportClue', { roundId: r.roundId, reason: 'ads' });
    const up = await adm(be, { op: 'upholdReport', roundId: r.roundId });
    assert.deepEqual([up.ok, up.strikes30d, up.reports], [true, 1, 2]);
    assert.deepEqual((await be.clueReports()).map((x) => x.state), ['upheld', 'upheld']);
    assert.equal((await adm(be, { op: 'upholdReport', roundId: r.roundId })).already, true);
    assert.equal(((await be.playerDoc('host')).strikes || []).length, 1, 'one strike, once per round');
    assert.equal((await be.call('host', 'createRound', { spectrumId: be.content.spectra[3].id })).ugc.warnPending, true);
    assert.equal((await adm(be, { op: 'upholdReport', roundId: 'AAAAAAAA' })).code, 'ROUND_NOT_FOUND');
    assert.equal((await adm(be, { op: 'upholdReport', roundId: 'bad' })).code, 'INVALID_INPUT');

    const r2 = await reported(be, 'host2', 'rep3', '夏天的西瓜');
    assert.equal((await adm(be, { op: 'dismissReport', roundId: r2.roundId })).restored, false);
    assert.equal((await be.call('g', 'getRound', { roundId: r2.roundId })).clue.state, 'hidden');
    assert.equal((await adm(be, { op: 'dismissReport', roundId: r2.roundId, restore: true })).restored, true);
    assert.equal((await be.call('g', 'getRound', { roundId: r2.roundId })).clue.text, '夏天的西瓜');
    assert.equal(((await be.playerDoc('host2')).strikes || []).length, 0, 'dismissed: no strike');

    const logs = (await be.modLog()).length;
    assert.equal((await adm(be, { op: 'deleteClue', roundId: r2.roundId })).deleted, true);
    assert.equal((await be.roundDoc(r2.roundId)).clueText, null);
    assert.deepEqual((await be.call('g', 'getRound', { roundId: r2.roundId })).clue, { mode: 'text', text: null, hidden: true, state: 'hidden' });
    assert.equal((await be.modLog()).length, logs);
    assert.equal((await adm(be, { op: 'restoreClue', roundId: r2.roundId })).restored, false);
  });

  test('AC 92/93: restrict / liftRestriction: never creates a player by typo; a restricted host gets RESTRICTED for typed clues only', async (be) => {
    await be.call('offender', 'agreeRules', { rulesVersion: 1 });
    assert.equal((await adm(be, { op: 'restrict', openid: 'nobody-at-all', days: 3 })).code, 'INVALID_INPUT');
    assert.equal((await adm(be, { op: 'restrict', openid: 'offender', days: 0 })).code, 'INVALID_INPUT');
    const res = await adm(be, { op: 'restrict', openid: 'offender', days: 3 });
    assert.equal(res.restrictedUntil, be.clock.now() + 3 * DAY);
    const r = await be.call('offender', 'createRound', { spectrumId: be.content.spectra[3].id });
    assert.deepEqual(r.ugc.restriction, { until: be.clock.now() + 3 * DAY, permanent: false });
    const t = await be.call('offender', 'setClue', { roundId: r.roundId, clueMode: 'text', clueText: GOOD });
    assert.deepEqual([t.code, t.until, t.permanent], ['RESTRICTED', be.clock.now() + 3 * DAY, false]);
    assert.equal((await be.clue('offender', r.roundId)).ok, true, 'a preset is fine');
    assert.equal((await adm(be, { op: 'liftRestriction', openid: 'offender' })).lifted, true);
    const r2 = await be.call('offender', 'createRound', { spectrumId: be.content.spectra[3].id });
    assert.equal(r2.ugc.restriction, null);
    assert.equal((await be.call('offender', 'setClue', { roundId: r2.roundId, clueMode: 'text', clueText: GOOD })).ok, true);
    assert.deepEqual((await be.auditLog()).map((a) => a.op), ['restrict', 'liftRestriction']);
  });

  test('AC 94: setUgc / setModeration through admin take effect for the next call and are audited', async (be) => {
    await be.call('host', 'agreeRules', { rulesVersion: 1 });
    const r = await be.call('host', 'createRound', { spectrumId: be.content.spectra[3].id });
    assert.equal((await be.call('host', 'setClue', { roundId: r.roundId, clueMode: 'text', clueText: GOOD })).ok, true);
    assert.equal((await adm(be, { op: 'setUgc', viewEnabled: false })).ugc.viewEnabled, false);
    assert.equal((await be.call('g', 'getRound', { roundId: r.roundId })).clue.state, 'paused');
    assert.equal((await adm(be, { op: 'setUgc', viewEnabled: true, createEnabled: false })).ugc.createEnabled, false);
    assert.equal((await be.call('g', 'getRound', { roundId: r.roundId })).clue.text, GOOD);
    const r2 = await be.call('host', 'createRound', { spectrumId: be.content.spectra[3].id });
    assert.equal(r2.ugc.createEnabled, false);
    assert.equal((await be.call('host', 'setClue', { roundId: r2.roundId, clueMode: 'text', clueText: '夏天的西瓜' })).code, 'UGC_PAUSED');
    for (const bad of [{}, { createEnabled: 'no' }]) assert.equal((await adm(be, { op: 'setUgc', ...bad })).code, 'INVALID_INPUT');
    assert.equal((await adm(be, { op: 'setModeration', textApi: 'weird' })).code, 'INVALID_INPUT');
    await adm(be, { op: 'setUgc', createEnabled: true });
    assert.equal((await adm(be, { op: 'setModeration', textApi: 'general' })).moderation.textApi, 'general');
    // with the general API a mock `review` now blocks without a strike
    const r3 = await be.call('host', 'createRound', { spectrumId: be.content.spectra[3].id });
    assert.equal((await be.call('host', 'setClue', { roundId: r3.roundId, clueMode: 'text', clueText: '测试复审' })).code, 'TEXT_BLOCKED');
    assert.deepEqual((await be.auditLog()).map((a) => a.op), ['setUgc', 'setUgc', 'setUgc', 'setModeration']);
  });
};
