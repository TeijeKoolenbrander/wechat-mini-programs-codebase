'use strict';
// cleanup: timer trigger (config.json, 04:00 BJT). PO-19, spec 7.5: 180-day retention.
// Deletes chains, steps (text and strokes) and their moderation PNGs in cloud storage, mod_traces,
// mod_log, reports, reactions, sub_grants, audit_log, events and rate_limits older than 180 days;
// players, group_members and group_stats with no activity for 180 days. Abandoned chains go after 1 day.
// Keeps daily_stats and mod_quota (aggregates). Idempotent: a re-run finds nothing new.
// Server-only (rejects calls that carry an OPENID).
const store = require('./common/store');
const { now, addDaysKey, dateKeyAt, DAY_MS, RETENTION_DAYS, configuredTimeoutMs } = require('./common/util');

const TARGETS = [
  { col: 'steps', field: 'createdAt', files: true },
  { col: 'mod_log', field: 'ts', files: true },
  { col: 'mod_traces', field: 'submittedAt' },
  { col: 'reports', field: 'createdAt' },
  { col: 'reactions', field: 'createdAt' },
  { col: 'sub_grants', field: 'grantedAt' },
  { col: 'audit_log', field: 'ts' },
  { col: 'events', field: 'ts' },
  { col: 'chains', field: 'createdAt' },
  { col: 'players', field: 'lastActiveAt' },
  { col: 'group_stats', field: 'lastActivityAt' },
];

async function purge(col, cond, deadline) {
  let total = 0;
  while (now() < deadline) {
    const r = await store.db().collection(col).where(cond).remove();
    const n = (r && r.stats && r.stats.removed) || 0;
    total += n;
    if (n === 0) break;
  }
  return total;
}

/**
 * Docs that reference a storage object carry `hasFile: true`. Delete the objects (50 per call), then
 * the doc, only when the object is gone: a storage error keeps the doc (and its reference) for the
 * next night instead of orphaning a file.
 */
async function purgeWithFiles(col, cond, deadline) {
  let files = 0;
  while (now() < deadline) {
    const r = await store.db().collection(col).where({ ...cond, hasFile: true }).limit(50).get();
    if (!r.data.length) break;
    const withId = r.data.filter((d) => d.fileID);
    const res = withId.length ? await store.sdk().deleteFile({ fileList: withId.map((d) => d.fileID) }) : { fileList: [] };
    const status = new Map((res.fileList || []).map((f) => [f.fileID, f]));
    let removed = 0;
    for (const d of r.data) {
      const f = d.fileID ? status.get(d.fileID) : null;
      const ok = !d.fileID || !f || f.status === 0 || /not exist|not found|-502002|STORAGE_FILE_NONEXIST/i.test(f.errMsg || '');
      if (!ok) continue;
      await store.db().collection(col).doc(d._id).remove();
      removed += 1;
    }
    files += removed;
    if (removed === 0) break; // storage errors: leave for tomorrow
  }
  return files;
}

exports.main = store.handler(async (event, { startedAt }) => {
  const _ = store._();
  const nowMs = now();
  const deadline = startedAt + 0.7 * configuredTimeoutMs();
  const cutoffMs = nowMs - RETENTION_DAYS * DAY_MS;
  const cutoffKey = addDaysKey(dateKeyAt(nowMs), -RETENTION_DAYS);

  const removed = {};
  const filesDeleted = {};
  for (const t of TARGETS) {
    const cond = { [t.field]: _.lt(cutoffMs) };
    if (t.files) {
      filesDeleted[t.col] = await purgeWithFiles(t.col, cond, deadline);
      removed[t.col] = filesDeleted[t.col] + await purge(t.col, { ...cond, hasFile: _.neq(true) }, deadline);
    } else {
      removed[t.col] = await purge(t.col, cond, deadline);
    }
  }
  removed.abandoned = await purge('chains', { state: 'abandoned', lastActivityAt: _.lt(nowMs - DAY_MS) }, deadline);
  removed.group_members = await purge('group_members', { lastSeen: _.lt(cutoffKey) }, deadline);
  removed.rate_limits = await purge('rate_limits', { expireAt: _.lt(nowMs) }, deadline);
  return { ok: true, cutoffKey, removed, filesDeleted };
}, { auth: false, serverOnly: true });
