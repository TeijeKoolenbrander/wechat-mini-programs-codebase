'use strict';
/**
 * Strike ladder and restrictions (spec 11.8, D-2, AC 92). Pure functions over a `player_stats` document, copied from
 * 传画接龙 core/strikes.js and adapted: strikes are plain timestamps (<= 10 kept), the fields are the spec 11.1 ones.
 *
 * A strike is added for: a `risky` verdict and an upheld report. NOT for `review`, local rejections or busy errors.
 * Strikes count over a rolling 30 days:
 *   1 -> `warnPending` (one-time warning sheet)   2 -> 24 h restriction   3 -> 7 days   >= 4 -> 30 days + `reviewFlag`
 * A restriction only ever extends (a later strike never shortens an earlier one). Admin may make it permanent.
 * Scope of a restriction: typed clues only (setClue text -> RESTRICTED); everything else keeps working.
 *
 * player_stats fields: strikes:[ts], warnPending?, restrictedUntil?, restrictPermanent?, reviewFlag?
 */

const { CONFIG } = require('./config');

const FOREVER = 253402300799000; // 9999-12-31, `until` of a permanent restriction

function clone(o) {
  return JSON.parse(JSON.stringify(o));
}

/** strike timestamps inside the rolling window ending at `now` */
function activeStrikes(strikes, now) {
  return (strikes || []).filter((t) => typeof t === 'number' && t > now - CONFIG.strikes.windowMs && t <= now);
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
 * @returns {{player:object, count:number, warn:boolean, restrictedUntil:number, flagged:boolean, restrictMs:number}}
 */
function applyStrike(player, now) {
  const p = clone(player);
  const keep = now - CONFIG.retentionDays * 86400e3;
  p.strikes = (p.strikes || []).filter((t) => t > keep);
  p.strikes.push(now);
  if (p.strikes.length > CONFIG.strikes.keepMax) p.strikes = p.strikes.slice(p.strikes.length - CONFIG.strikes.keepMax);
  const count = activeStrikes(p.strikes, now).length;
  const row = ladderFor(count);
  if (row.warn) p.warnPending = true;
  if (row.restrictMs > 0 && !p.restrictPermanent) p.restrictedUntil = Math.max(p.restrictedUntil || 0, now + row.restrictMs);
  if (row.flag) p.reviewFlag = true;
  p.updatedAt = now;
  return { player: p, count, warn: row.warn, restrictedUntil: p.restrictedUntil || 0, flagged: !!p.reviewFlag, restrictMs: row.restrictMs };
}

/** the current restriction, or null: {level, until, permanent}. `level` = max(1, strikes in the window). */
function restrictionOf(player, now) {
  if (!player) return null;
  const level = Math.max(1, activeStrikes(player.strikes, now).length);
  if (player.restrictPermanent) return { level, until: FOREVER, permanent: true };
  if (player.restrictedUntil && player.restrictedUntil > now) return { level, until: player.restrictedUntil, permanent: false };
  return null;
}

/** admin restrict: `{days}` or `{permanent:true}` */
function restrict(player, o, now) {
  const p = clone(player);
  if (o.permanent) {
    p.restrictPermanent = true;
    p.restrictedUntil = FOREVER;
  } else {
    p.restrictedUntil = Math.max(p.restrictedUntil || 0, now + o.days * 86400e3);
  }
  p.updatedAt = now;
  return p;
}

function liftRestriction(player, now) {
  const p = clone(player);
  p.restrictPermanent = false;
  p.restrictedUntil = 0;
  p.updatedAt = now;
  return p;
}

const pad2 = (n) => (n < 10 ? '0' + n : '' + n);

/** '10月17日 14:00' in Beijing time, no Intl and no local-time getters */
function bjtText(ms) {
  const d = new Date(ms + 8 * 3600e3);
  return d.getUTCMonth() + 1 + '月' + d.getUTCDate() + '日 ' + pad2(d.getUTCHours()) + ':' + pad2(d.getUTCMinutes());
}

/** the restriction copy shown on tab 1 (spec 11.8) */
function restrictionText(restriction) {
  const tail = '原因：多次写的提示未通过审核。如有疑问，请在「设置 · 联系我们」反馈。';
  if (!restriction || restriction.permanent) return '你暂时不能自己写提示。' + tail;
  return '你暂时不能自己写提示（至 ' + bjtText(restriction.until) + '）。' + tail;
}

const WARNING_TEXT = '你写的提示没有通过审核。请遵守发言规则，多次违规将暂时不能自己写提示。';

module.exports = { FOREVER, WARNING_TEXT, activeStrikes, ladderFor, applyStrike, restrictionOf, restrict, liftRestriction, bjtText, restrictionText };
