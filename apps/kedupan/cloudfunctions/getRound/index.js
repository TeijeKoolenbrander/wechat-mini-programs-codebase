'use strict';
// getRound: a round as the caller may see it (spec 8.4, 11.2, AC 26, 30). Lazy 24 h / 30 min transitions run first.
// A non-host never receives `target` before the reveal (core/service roundView).
// L4: on a revealed round the answer is served by default only to the host, to a player who has guessed, and to
// everyone once guessing is closed. Anyone else who could still place a late guess gets `answerHidden` until they ask
// (`showAnswer: true`); asking is recorded in `reveal_views`, after which submitGuess refuses them (ROUND_EXPIRED).
const store = require('./common/store');
const { fail, now, rowHash } = require('./common/util');
const { core, rateOf } = require('./common/coreapi');
const roundsDb = require('./common/rounds-db');
const groups = require('./common/groups');
const players = require('./common/players');

exports.main = store.handler(async (event, { openid }) => {
  const v = core.V.getRound(event);
  if (!v.ok) fail('INVALID_INPUT', 'invalid input');
  const round = await roundsDb.loadRound(v.v.roundId);
  if (!round) fail('ROUND_NOT_FOUND', 'ROUND_NOT_FOUND');
  const nowMs = now();
  const mine = await store.getDoc('guesses', `${round._id}_${openid}`);
  let withhold = false;
  if (round.status === 'revealed') {
    const isHost = round.hostOpenid === openid;
    let served = core.R.revealServedByDefault(round, { isHost, hasGuess: !!mine, nowMs });
    if (!served) {
      const viewId = `${round._id}_${openid}`;
      if (v.v.showAnswer) {
        await store.addIfAbsent('reveal_views', { _id: viewId, roundId: round._id, openid, ts: nowMs });
        served = true;
      } else {
        served = !!(await store.getDoc('reveal_views', viewId));
      }
    }
    withhold = !served;
  }
  const guesses = round.status === 'revealed' && !withhold ? await roundsDb.guessesOf(round._id) : [];
  // D-2: the typed clue as THIS viewer may see it (hidden / paused -> text null), their report state, rules, restriction, warning
  const flags = await groups.ugcFlags();
  const player = await players.read(openid);
  const hasReport = round.clueMode === 'text' ? !!(await store.getDoc('clue_reports', `${round._id}_${openid}`)) : false;
  // the warning belongs to the clue step: only the host's own view carries (and consumes) it
  const strikeNotice = round.hostOpenid === openid && !!(player && player.warnPending === true);
  const out = core.SV.roundView({ round, viewerOpenid: openid, myGuess: mine, guesses, hashFn: rowHash, nowMs, withhold, ugc: { flags, player, hasReport, strikeNotice } });
  if (!out.ok) fail(out.code, out.code);
  // the one-time strike warning is read once
  if (strikeNotice) await players.mutate(openid, (p) => ({ player: { ...p, warnPending: false, updatedAt: nowMs }, result: true }));
  return out;
}, { rate: rateOf('getRound') });
