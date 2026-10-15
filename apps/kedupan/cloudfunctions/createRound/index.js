'use strict';
// createRound: the host picks a spectrum; the SERVER draws the hidden target (CSPRNG, uniform integer 5-95)
// and returns it to the host only. status `draft` until setClue; <= 20 per day per openid (AC 35).
const core = require('./common/coreapi');
const store = require('./common/store');
const input = require('./common/input');
const { fail, now, randomId8, randomHex, randomIntInclusive } = require('./common/util');


exports.main = store.handler(async (event, { openid }) => {
  const spectrumId = input.spectrumId(event.spectrumId);
  const sp = core.getSpectrum(spectrumId);
  if (!sp) fail('INVALID_INPUT', 'unknown spectrum');
  const nowMs = now();
  await store.rateLimitDay(openid, 'round', core.dateKeyAt(nowMs), core.cfg().roundsPerDay);

  const target = randomIntInclusive(core.cfg().targetMin, core.cfg().targetMax);
  for (let attempt = 0; attempt < 5; attempt++) {
    const roundId = randomId8();
    const created = await store.addIfAbsent('rounds', {
      _id: roundId, hostOpenid: openid, spectrumId, left: sp.left, right: sp.right, target,
      clueMode: null, clueItemId: null, clueText: null, salt: randomHex(16), createdAt: nowMs,
      status: 'draft', guessCount: 0, groupRefs: [], contentVersion: core.CONTENT_VERSION(),
    });
    if (created) return { ok: true, roundId, target, left: sp.left, right: sp.right };
  }
  fail('INTERNAL', 'could not allocate a round id');
});
