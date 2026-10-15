'use strict';
// getHome: today's 3 prompts (今日起点), the caller's allowances, restriction, streak, features and
// the kill-switch state (spec 4.1, 13.2). No openids in the response.
const store = require('./common/store');
const cfgLib = require('./common/config');
const players = require('./common/players');
const core = require('./common/coreapi');
const { now, dateKeyAt, isDateKey, fail } = require('./common/util');

const NATIONAL_MIN = 30;

async function launchKey(todayKey) {
  const env = process.env.LAUNCH_DATE_KEY;
  if (env && isDateKey(env)) return env;
  const m = await store.getDoc('meta', 'launch');
  if (m && isDateKey(m.dateKey)) return m.dateKey;
  await store.addIfAbsent('meta', { _id: 'launch', dateKey: todayKey });
  const again = await store.getDoc('meta', 'launch');
  return again ? again.dateKey : todayKey;
}

exports.main = store.handler(async (event, { openid }) => {
  const nowMs = now();
  const dateKey = dateKeyAt(nowMs);
  const cfg = await cfgLib.getConfig();
  const ugc = cfgLib.ugcState(cfg, nowMs);

  // With the game core present its own launch date (core CONFIG.daily) is used, so the client's offline
  // computation and the server always agree; LAUNCH_DATE_KEY overrides it only if both are changed together.
  const envKey = process.env.LAUNCH_DATE_KEY && isDateKey(process.env.LAUNCH_DATE_KEY) ? process.env.LAUNCH_DATE_KEY : undefined;
  const launch = envKey || (core.hasCoreDaily() ? undefined : await launchKey(dateKey));
  const ids = core.dailyPromptIds(dateKey, launch);
  const stats = (await store.getDoc('daily_stats', dateKey)) || {};
  const byPrompt = stats.byPrompt || {};
  const counts = {};
  const prompts = ids.map((id) => {
    const p = core.promptById(id);
    if (!p) fail('SERVER_CONFIG', 'daily prompt missing from bank');
    const n = byPrompt[id] || 0;
    if (n >= NATIONAL_MIN) counts[id] = n; // aggregate only, shown at >= 30 (AC 89)
    return { id, text: p.text, count: n >= NATIONAL_MIN ? n : null };
  });

  const p = await players.loadPlayer(openid, nowMs);
  // revealed chains the player took part in and has not opened yet (the 我的接龙 dot)
  let unseenReveals = 0;
  try {
    const rv = await store.db().collection('chains').where({ participants: openid, state: 'revealed' }).limit(50).get();
    unseenReveals = rv.data.filter((c) => !c.hidden && !(p.seen || []).includes(c._id)).length;
  } catch (e) { /* cosmetic */ }
  const r = players.restriction(p, nowMs);
  const day = p.day && p.day.dateKey === dateKey ? p.day : players.freshDay(dateKey);
  const warn = !!p.warnPending;
  if (warn) await store.db().collection('players').doc(openid).update({ data: { warnPending: false } }); // read-once

  const inter = (cfg.ads && cfg.ads.interstitial) || {};
  return {
    ok: true,
    dateKey,
    serverNow: nowMs,
    daily: { prompts, counts },
    me: {
      unseenReveals,
      lifetimeReveals: p.lifetimeReveals || 0,
      rulesVersion: p.rulesVersion || 0,
      rulesCurrent: cfgLib.LIMITS.rulesVersion,
      restriction: r ? { until: r.until, permanent: r.permanent } : null,
      warnPending: warn,
      startsLeft: players.startsLeft(p, dateKey),
      adStartsLeft: players.adStartsLeft(p, dateKey),
      paletteToday: !!day.palette,
      streak: players.streakNow(p, dateKey),
    },
    features: {
      subscribe: cfg.subscribe ? { tmplId: cfg.subscribe.tmplId } : null,
      updatableCard: !!cfg.features.updatableCard,
      banner: { enabled: !!(cfg.ads.banner && cfg.ads.banner.enabled), adUnitId: (cfg.ads.banner && cfg.ads.banner.adUnitId) || null },
      interstitial: {
        enabled: !!inter.enabled,
        minLifetimeReveals: 3,
        minGapSec: Math.max(120, inter.minGapSec || 180),
        maxPerDay: Math.min(4, inter.maxPerDay || 3),
      },
    },
    ugc: { createEnabled: ugc.createOk, viewEnabled: ugc.viewOk },
    timers: { drawSec: cfg.timers.drawSec, describeSec: cfg.timers.describeSec },
  };
});
