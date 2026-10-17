'use strict';
// QA AC 78: one query per spec 12 KPI, computed over the events collection of a scripted harness session.
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeBackend, playDay, disposeStages } = require('./helpers/backends');

test.after(() => disposeStages());

const distinct = (xs) => new Set(xs).size;

test('[qa] AC 78: every KPI of spec 12 is computable from the events collection', async () => {
  const be = makeBackend('real', {});
  try {
    const D = '20261105';
    const ev = (name, props, sid, ts) => ({ name, props: props || {}, clientTs: ts, sessionId: sid });
    // users u1,u2 complete the daily; only u1 shares; both opened a card; u1 plays, u2 opens and leaves
    await playDay(be, 'u1', [10, 20, 30, 40, 50]);
    await playDay(be, 'u2', [15, 25, 35, 45, 55]);
    await be.call('u1', 'track', { sessionId: 's1', events: [ev('card_open', { cardKind: 'daily' }, 's1', 1), ev('daily_card_reveal', { dateKey: D, idx: 0 }, 's1', 2), ev('daily_complete', { dateKey: D, total: 400 }, 's1', 3), ev('share_tap', { kind: 'daily', dateKey: D }, 's1', 4), ev('archive_view', { items: 3, state: 'ready' }, 's1', 5), ev('archive_set_complete', { dateKey: D, total: 300 }, 's1', 6)] });
    await be.call('u2', 'track', { sessionId: 's2', events: [ev('card_open', { cardKind: 'daily' }, 's2', 1), ev('daily_complete', { dateKey: D, total: 380 }, 's2', 2)] });
    // a host round with 2 guesses revealed by the host; a second round never revealed
    const r1 = await be.call('host', 'createRound', { spectrumId: be.content.spectra[5].id });
    const r2 = await be.call('host', 'createRound', { spectrumId: be.content.spectra[6].id });
    for (const r of [r1, r2]) await be.clue('host', r.roundId);
    await be.call('host', 'track', { sessionId: 'sh', events: [ev('round_clue', { roundId: r1.roundId, clueMode: 'preset', presetSwaps: 0 }, 'sh', 1), ev('round_clue', { roundId: r2.roundId, clueMode: 'preset', presetSwaps: 0 }, 'sh', 2)] });
    await be.call('g1', 'submitGuess', { roundId: r1.roundId, pos: 30 });
    await be.call('g2', 'submitGuess', { roundId: r1.roundId, pos: 60 });
    await be.call('host', 'revealRound', { roundId: r1.roundId });

    const rows = be.db.all('kedupan_events');
    const by = (n) => rows.filter((e) => e.name === n);
    // share rate = distinct (dateKey, user) with share_tap daily/group / daily_complete
    const shares = distinct(by('share_tap').filter((e) => ['daily', 'group'].includes(e.props.kind)).map((e) => e.props.dateKey + '|' + e.openid));
    const completes = distinct(by('daily_complete').map((e) => e.props.dateKey + '|' + e.openid));
    assert.equal(shares / completes, 0.5);
    // card-open-to-play = card_open followed by daily_card_reveal or round_guess in the same session / card_open
    const opens = by('card_open');
    const played = opens.filter((o) => rows.some((e) => ['daily_card_reveal', 'round_guess'].includes(e.name) && e.sessionId === o.sessionId && e.clientTs >= o.clientTs));
    assert.equal(played.length / opens.length, 0.5);
    // round reveal rate = round_reveal with guesses >= 2 / round_clue
    const revealed = by('round_reveal').filter((e) => e.props.guesses >= 2).length;
    assert.equal(revealed / by('round_clue').length, 0.5);
    // archive sets per session = archive_set_complete / sessions with archive_view
    assert.equal(by('archive_set_complete').length / distinct(by('archive_view').map((e) => e.sessionId)), 1);
    // group activation (server query): daily_entries x group_members, here n >= 3 groups / n >= 1 groups
    assert.ok(be.db.all('kedupan_daily_entries').length >= 2);
  } finally {
    be.dispose();
  }
});
