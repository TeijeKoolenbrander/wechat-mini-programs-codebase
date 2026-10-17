'use strict';
// getChain: the chain entry (spec 3.4, 12). NEVER returns content (AC 10): the key set is core/views.js ENTRY_KEYS.
const chainLib = require('./core/chain');
const views = require('./core/views');
const store = require('./common/store');
const players = require('./common/players');
const groups = require('./common/groups');
const appconfig = require('./common/appconfig');
const wx = require('./common/wxapi');
const env = require('./common/env');
const { bad } = require('./common/errors');
const { chainIdOf } = require('./common/input');
const { now } = require('./common/util');

const DAY = 86400e3;

/** the updatable-card activity id (spec 9.4): created lazily for participants on request, valid 24 h; never blocks the entry */
async function activityFor(chain, openid, cfg) {
  if (!cfg.features.updatableCard || chain.hidden || chain.state === 'removed' || !chainLib.isParticipant(chain, openid)) return null;
  if (chain.activityId && chain.activityExpiresAt > now()) return chain.activityId;
  try {
    const id = env.envState().mode === 'mock' ? 'mock-activity-' + chain._id : await wx.createActivityId();
    await store.coll('chains').doc(chain._id).update({ data: { activityId: id, activityExpiresAt: now() + DAY } });
    return id;
  } catch (e) {
    console.warn('createActivityId failed', store.errText(e));
    return null;
  }
}

exports.main = store.handler(async (event, { openid }) => {
  env.ugcGuard();
  await store.rateLimit(openid, 'chain', 1, 60);
  const id = chainIdOf(event);
  const chain = id && (await store.getDoc('chains', id));
  if (!chain) bad('CHAIN_NOT_FOUND');
  const [p, cfg] = await Promise.all([players.read(openid), appconfig.get()]);
  const inRoom = !!(await require('./common/roomops').playingRoomOf(p));
  const ctx = await groups.claimCtx(chain, openid, event.groupRef, p, cfg, { inRoom });
  const out = Object.assign({ ok: true, chainId: chain._id, serverNow: now() }, views.entryView(chain, ctx));
  if (event.wantActivity === true) {
    const a = await activityFor(chain, openid, cfg);
    if (a) out.activityId = a;
  }
  return out;
});
