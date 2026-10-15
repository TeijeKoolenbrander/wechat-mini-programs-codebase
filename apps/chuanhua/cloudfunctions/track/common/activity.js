'use strict';
// Updatable invite card (spec 9.4, V7): "成员正在加入，当前 n/6 人" with n = passed 棒.
// Everything here is best effort: errors are logged as `share_update` events and never block a game flow.
const store = require('./store');
const cfgLib = require('./config');
const { now } = require('./util');

function api() {
  return store.sdk().openapi.updatableMessage;
}

/** Create (or recreate after 24 h) the activity id for a chain. Returns the id or null. */
async function ensureActivity(chain) {
  const cfg = await cfgLib.getConfig();
  if (!cfg.features.updatableCard) return null;
  if (chain.activityId && chain.activityExpiresAt > now()) return chain.activityId;
  try {
    const r = await api().createActivityId({ openid: undefined });
    const id = r && (r.activityId || r.activity_id);
    if (!id) throw new Error('no activity id');
    chain.activityId = id;
    chain.activityExpiresAt = now() + 24 * 3600e3 - 60e3;
    await store.db().collection('chains').doc(chain._id).update({ data: { activityId: chain.activityId, activityExpiresAt: chain.activityExpiresAt } });
    return id;
  } catch (e) {
    await store.writeEvent(null, 'share_update', { result: 'create_fail', errCode: e && e.errCode });
    return null;
  }
}

/** Push the passed count to the card. At reveal/removal the card is closed (target_state 1) and not updated again. */
async function updateCard(chain) {
  try {
    if (!chain.activityId || chain.activityExpiresAt <= now()) return;
    const cfg = await cfgLib.getConfig();
    if (!cfg.features.updatableCard) return;
    const closed = chain.state === 'revealed' || chain.state === 'removed' || chain.state === 'expired';
    if (closed) {
      // a closed card is frozen: never updated again (spec 9.4, AC 64)
      const fresh = await store.getDoc('chains', chain._id);
      if (fresh && fresh.activityClosed) return;
    }
    await api().setUpdatableMsg({
      activityId: chain.activityId,
      targetState: closed ? 1 : 0,
      templateInfo: { parameterList: [{ name: 'member_count', value: String(chain.passed) }, { name: 'room_limit', value: '6' }] },
    });
    if (closed) await store.db().collection('chains').doc(chain._id).update({ data: { activityClosed: true } });
    await store.writeEvent(null, 'share_update', { result: 'ok' });
  } catch (e) {
    await store.writeEvent(null, 'share_update', { result: 'fail', errCode: e && e.errCode });
    try {
      await store.db().collection('chains').doc(chain._id).update({ data: { activityDirty: true } });
    } catch (e2) { /* best effort */ }
  }
}

module.exports = { ensureActivity, updateCard };
