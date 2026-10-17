'use strict';
// Effects that follow a chain transition: aggregate stats (group_stats, daily_stats), analytics events and the updatable
// invite card. They run AFTER the transaction that changed the chain, are idempotent enough for aggregates, and never
// fail the request that triggered them.
const { beijingDateKey } = require('../core/date');
const { CONFIG } = require('../core/config');
const store = require('./store');
const wx = require('./wxapi');
const env = require('./env');
const appconfig = require('./appconfig');
const { now } = require('./util');

const dateKey = () => beijingDateKey(now());
const DAILY_BASE = { started: 0, revealed: 0, rooms: 0, roomsFinished: 0, markers: 0, byPrompt: {} };
const GROUP_BASE = { started: 0, revealed: 0, drawings: 0, rooms: 0, lastActivityAt: 0 };

async function safe(label, fn) {
  try {
    return await fn();
  } catch (e) {
    console.warn(label + ' failed', store.errText(e));
    return undefined;
  }
}

function bumpDaily(fields) {
  return safe('daily_stats', () => store.bump('daily_stats', dateKey(), fields, DAILY_BASE));
}
function bumpGroup(chain, fields) {
  if (!chain.openGId) return undefined;
  return safe('group_stats', () => store.bump('group_stats', chain.openGId, fields, GROUP_BASE, { lastActivityAt: now() }));
}

/** the invite card shows "成员正在加入，当前 n/6 人" (spec 9.4); errors are logged and retried by modSweeper, never block */
async function updateCard(chain, started) {
  if (!chain.activityId || chain.hidden || chain.state === 'removed') return;
  if (chain.activityExpiresAt && chain.activityExpiresAt <= now()) return;
  const cfg = await appconfig.get();
  if (!cfg.features.updatableCard) return;
  if (env.envState().mode === 'mock') return; // dev mock: no platform call
  let ok = true;
  try {
    await wx.setUpdatableMsg(chain.activityId, chain.passed, chain.length, !!started);
  } catch (e) {
    ok = false;
    console.warn('setUpdatableMsg failed', store.errText(e));
  }
  await store.writeEvent(null, 'share_update', { result: ok ? 'ok' : 'error', passed: chain.passed });
  if (!ok || chain.cardDirty) await safe('cardDirty', () => store.coll('chains').doc(chain._id).update({ data: { cardDirty: !ok } }));
}

async function onRevealed(chain) {
  await bumpGroup(chain, { revealed: 1 });
  await bumpDaily({ revealed: 1 });
  await store.writeEvent(null, 'chain_reveal', { reason: chain.revealReason, passed: chain.passed, participants: chain.participants.length, custom: chain.custom });
  await safe('card', () => updateCard(chain, true));
}

/** after a 棒 passed (text at submit, drawing at its verdict). `revealed`: this pass completed the chain. */
async function onPassed(chain, step, revealed) {
  if (step.kind === 'draw' && !step.marker) await bumpGroup(chain, { drawings: 1 });
  if (revealed) await onRevealed(chain);
  else await safe('card', () => updateCard(chain, false));
}

/** 棒 1 submitted: the chain counts as started */
async function onStarted(chain) {
  await bumpDaily(Object.assign({ started: 1 }, chain.promptId ? { ['byPrompt.' + chain.promptId]: 1 } : {}));
  await bumpGroup(chain, { started: 1 });
}

module.exports = { dateKey, bumpDaily, bumpGroup, updateCard, onRevealed, onPassed, onStarted, safe, CONFIG };
