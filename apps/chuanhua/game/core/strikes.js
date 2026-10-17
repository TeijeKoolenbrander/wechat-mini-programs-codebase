'use strict';
/**
 * Strike ladder and restrictions (spec 7.3, PO-17, AC 65, 66). Pure functions over the `players` document.
 *
 * A strike is added for: a `risky` verdict (text or image) and an upheld report. NOT for `review` verdicts, local
 * rejections (text.js) or voids. Strikes count over a rolling 30 days:
 *   1 -> one-time 公约 sheet (warnPending)    2 -> 24 h restriction    3 -> 7 days    >= 4 -> 30 days + flagged for admin
 * A restriction only ever extends (a later strike never shortens an earlier one). Admin may make it permanent.
 */

const { CONFIG } = require('./config');

const FOREVER = 253402300799000; // 9999-12-31, `restrictedUntil` of a permanent restriction

function clone(o) {
  return JSON.parse(JSON.stringify(o));
}

/** strikes inside the rolling window ending at `now` */
function activeStrikes(strikes, now) {
  return (strikes || []).filter((s) => s.at > now - CONFIG.strikes.windowMs && s.at <= now);
}

/** the ladder row for a strike count (>= 1) */
function ladderFor(count) {
  const rows = CONFIG.strikes.ladder;
  let row = rows[0];
  for (const r of rows) if (count >= r.at) row = r;
  return row;
}

/**
 * Add a strike at `now`.
 * @param {object} player
 * @param {{stepId?:string|null, src:'verdict'|'report'}} strike
 * @returns {{player, count:number, warn:boolean, restrictedUntil:number, flagged:boolean, restrictMs:number}}
 */
function applyStrike(player, strike, now) {
  const p = clone(player);
  const keep = now - CONFIG.retention.days * 86400e3;
  p.strikes = (p.strikes || []).filter((s) => s.at > keep);
  p.strikes.push({ at: now, stepId: strike.stepId || null, src: strike.src });
  const count = activeStrikes(p.strikes, now).length;
  const row = ladderFor(count);
  if (row.warn) p.warnPending = true;
  if (row.restrictMs > 0 && !p.permanent) {
    if (!(p.restrictedUntil > now)) p.restrictedAt = now; // a new restriction period begins (submit may still finish a pre-existing claim, edge 19)
    p.restrictedUntil = Math.max(p.restrictedUntil || 0, now + row.restrictMs);
  }
  if (row.flag) p.flagged = true;
  return { player: p, count, warn: row.warn, restrictedUntil: p.restrictedUntil || 0, flagged: !!p.flagged, restrictMs: row.restrictMs };
}

/** the current restriction, or null. {until, permanent} */
function restrictionOf(player, now) {
  if (player.permanent) return { until: FOREVER, permanent: true };
  if (player.restrictedUntil && player.restrictedUntil > now) return { until: player.restrictedUntil, permanent: false };
  return null;
}

/** admin restrict: days or permanent */
function restrict(player, o, now) {
  const p = clone(player);
  if (!(p.restrictedUntil > now) && !p.permanent) p.restrictedAt = now;
  if (o.permanent) {
    p.permanent = true;
    p.restrictedUntil = FOREVER;
  } else {
    p.restrictedUntil = Math.max(p.restrictedUntil || 0, now + o.days * 86400e3);
  }
  return p;
}

function liftRestriction(player) {
  const p = clone(player);
  p.permanent = false;
  p.restrictedUntil = 0;
  return p;
}

const pad2 = (n) => (n < 10 ? '0' + n : '' + n);

/** '10月17日 14:00' in Beijing time, no Intl and no local-time getters */
function bjtText(ms) {
  const d = new Date(ms + 8 * 3600e3);
  return d.getUTCMonth() + 1 + '月' + d.getUTCDate() + '日 ' + pad2(d.getUTCHours()) + ':' + pad2(d.getUTCMinutes());
}

/** the restriction banner copy (spec 7.3) */
function restrictionText(restriction) {
  const tail = '原因：多次发布的内容未通过审核。如有疑问，请在「设置 · 反馈」联系我们。';
  if (!restriction || restriction.permanent) return '你暂时不能参与接龙。' + tail;
  return '你暂时不能参与接龙（至 ' + bjtText(restriction.until) + '）。' + tail;
}

const WARNING_TEXT = '你有内容没通过审核。请遵守接龙公约，多次违规将被限制参与。';

module.exports = { FOREVER, WARNING_TEXT, activeStrikes, ladderFor, applyStrike, restrictionOf, restrict, liftRestriction, bjtText, restrictionText };
