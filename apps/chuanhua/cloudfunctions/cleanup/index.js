'use strict';
// cleanup: daily retention sweep, timer 04:00 BJT (spec 7.5, AC 69, 70, PO-19). Server-only. Idempotent.
//   - rooms older than 180 days (their live chains go with the chains below; room_signals and closed lobbies are removed after 1 day by roomSweeper)
//   - chains older than 180 days (with their steps and the moderation PNGs in cloud storage, deleteFile in batches of 50)
//   - abandoned chains (a 棒 1 that was never submitted) after 1 day
//   - mod_traces (and the PNG files they reference, which also covers uploads that never became a step), mod_log, reports,
//     reactions, sub_grants, audit_log, events, rate_limits older than 180 days / expired
//   - players, group_members, group_stats with no activity for 180 days
//   - mod_quota counters older than 180 days. daily_stats (aggregate) is kept.
// If a storage delete fails the documents that reference the files are kept and retried tomorrow (never orphan a PNG).
const { CONFIG } = require('./core/config');
const { beijingDateKey } = require('./core/date');
const store = require('./common/store');
const wx = require('./common/wxapi');
const { now, DAY_MS, RETENTION_DAYS, configuredTimeoutMs } = require('./common/util');

const CHAIN_BATCH = 50;

async function purge(name, cond, deadline) {
  let total = 0;
  while (now() < deadline) {
    const r = await store.coll(name).where(cond).remove();
    const n = (r && r.stats && r.stats.removed) || 0;
    total += n;
    if (n === 0) break;
  }
  return total;
}

/** chains matching `cond` (oldest first), their steps and PNGs */
async function purgeChains(cond, deadline, out) {
  const _ = store._();
  while (now() < deadline) {
    const chains = (await store.coll('chains').where(cond).orderBy('createdAt', 'asc').limit(CHAIN_BATCH).get()).data;
    if (!chains.length) break;
    const ids = chains.map((c) => c._id);
    const steps = (await store.coll('steps').where({ chainId: _.in(ids) }).limit(1000).get()).data;
    const files = steps.map((s) => s.fileID).filter(Boolean);
    if (files.length) out.files += await wx.deleteFiles(files); // throws on a failed call: nothing is removed, tomorrow retries
    await store.coll('steps').where({ chainId: _.in(ids) }).remove();
    await store.coll('chains').where({ _id: _.in(ids) }).remove();
    out.steps += steps.length;
    out.chains += chains.length;
  }
}

/** traces carry the PNG fileID too (an upload whose step transaction lost a race has a trace but no step) */
async function purgeTraces(cutoff, deadline, out) {
  const _ = store._();
  while (now() < deadline) {
    const traces = (await store.coll('mod_traces').where({ submittedAt: _.lt(cutoff) }).limit(200).get()).data;
    if (!traces.length) break;
    const files = traces.map((x) => x.fileID).filter(Boolean);
    if (files.length) out.files += await wx.deleteFiles(files);
    await store.coll('mod_traces').where({ _id: _.in(traces.map((x) => x._id)) }).remove();
    out.traces += traces.length;
  }
}

exports.main = store.handler(async (event, { startedAt }) => {
  const _ = store._();
  const t = now();
  const deadline = startedAt + 0.7 * configuredTimeoutMs();
  const cutoff = t - RETENTION_DAYS * DAY_MS;
  const cutoffKey = beijingDateKey(cutoff);
  const out = { chains: 0, steps: 0, files: 0, traces: 0 };
  const removed = {};

  await purgeChains({ state: 'abandoned', createdAt: _.lt(t - CONFIG.retention.abandonedDays * DAY_MS) }, deadline, out);
  await purgeChains({ createdAt: _.lt(cutoff) }, deadline, out);
  await purgeTraces(cutoff, deadline, out);

  const targets = [
    ['rooms', { createdAt: _.lt(cutoff) }],
    ['mod_log', { ts: _.lt(cutoff) }],
    ['reports', { createdAt: _.lt(cutoff) }],
    ['reactions', { createdAt: _.lt(cutoff) }],
    ['sub_grants', { grantedAt: _.lt(cutoff) }],
    ['audit_log', { ts: _.lt(cutoff) }],
    ['events', { ts: _.lt(cutoff) }],
    ['rate_limits', { expireAt: _.lt(t) }],
    ['players', { lastActiveAt: _.lt(cutoff) }],
    ['group_members', { lastSeen: _.lt(cutoff) }],
    ['group_stats', { lastActivityAt: _.lt(cutoff) }],
    ['mod_quota', { _id: _.lt(cutoffKey) }],
  ];
  for (const [name, cond] of targets) removed[name] = await purge(name, cond, deadline);
  return { ok: true, cutoff, removed: Object.assign(removed, { chains: out.chains, steps: out.steps, files: out.files, mod_traces: out.traces }) };
}, { auth: false, serverOnly: true, timer: true });
