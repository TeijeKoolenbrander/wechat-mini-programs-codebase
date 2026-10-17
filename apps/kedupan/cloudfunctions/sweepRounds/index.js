'use strict';
// sweepRounds (timer, hourly): apply the lazy transitions to rounds nobody has opened (stale drafts are discarded,
// 24 h rounds reveal by 'timer' or become noGuesses) and send subscribe messages the in-request budget did not
// reach. Idempotent.
const store = require('./common/store');
const { now } = require('./common/util');
const roundsDb = require('./common/rounds-db');
const modio = require('./common/modio');
const { core, CONFIG } = require('./common/coreapi');

const BATCH = 200;
const BUDGET_MS = 40000;

exports.main = store.handler(async () => {
  const t0 = now();
  const _ = store._();
  const r = await store.coll('rounds').where({ status: _.in(['draft', 'open']) }).orderBy('createdAt', 'asc').limit(BATCH).get();
  let changed = 0;
  for (const round of r.data) {
    if (now() - t0 > BUDGET_MS) break;
    const after = await roundsDb.loadRound(round._id);
    if (!after || after.status !== round.status) changed++;
  }
  // grants left unsent (budget ran out, or a send failed before being claimed)
  let sent = 0;
  const pending = await store.coll('sub_grants').where({ used: false }).orderBy('grantedAt', 'asc').limit(BATCH).get();
  const ids = Array.from(new Set(pending.data.map((g) => g.roundId)));
  const rounds = await store.getMany('rounds', ids);
  for (const id of ids) {
    const round = rounds.get(id);
    if (round && round.status === 'revealed' && now() - t0 < BUDGET_MS) sent += await roundsDb.sendGrants(round, 5000);
  }
  // D-2 (spec 11.2): alert-only watchdogs, the founder greps the log for [ALERT]. Neither changes any state.
  const alerts = await ugcAlerts(t0);
  return { ok: true, changed, sent, alerts };
}, { auth: false, serverOnly: true });

/**
 * [ALERT] clue report open > 48 h (a report hides the clue at once, so a slow queue only delays restores and strikes) and
 * [ALERT] moderation busy when >= 50% of >= 20 text checks in the last hour were busy (alert only, no automatic pause).
 */
async function ugcAlerts(t0) {
  const _ = store._();
  const out = { staleReports: 0, busy: false };
  try {
    const stale = await store.coll('clue_reports').where({ state: 'open', ts: _.lt(t0 - CONFIG.ugc.staleReportAlertMs) }).limit(100).get();
    out.staleReports = stale.data.length;
    if (out.staleReports) modio.alert('clue report open > 48 h: ' + out.staleReports + ' report(s); run admin listReports (Handoff H16)');
    const win = await modio.busyWindow(CONFIG.ugc.busyAlert.windowMs);
    out.busy = core.MOD.busyAlert(win);
    if (out.busy) modio.alert('moderation busy: ' + win.busy + ' of ' + win.total + ' typed-clue checks in the last hour; consider admin setModeration {textApi:"general"} or setUgc {createEnabled:false}');
  } catch (e) {
    console.warn('ugc alerts failed', store.errText(e));
  }
  return out;
}
