'use strict';
// joinGroup: group context from a cloudID-decrypted getGroupEnterInfo payload (spec 9.2, 14.2; pattern copied from
// apps/dianjiangtai). The client sends wx.cloud.CloudID(cloudID) as `groupData`; the platform replaces it in `event`
// with {cloudID, data:{opengid, chat_type, ...}} decrypted server-side, so the openGId cannot be forged. No platform
// secret is needed. Returns an opaque groupRef (sha256(openGId + pepper)); never an openid or the openGId.
const store = require('./common/store');
const coreapi = require('./common/coreapi');
const { fail, now, sha256hex, isPlainObject } = require('./common/util');

const GROUP_CHAT_TYPES = [3, 4]; // 3 group chat, 4 WeCom-interop group

function pepper() {
  const p = process.env.GROUP_REF_PEPPER;
  if (!p) fail('SERVER_CONFIG', 'GROUP_REF_PEPPER not configured');
  return p;
}

exports.main = store.handler(async (event, { openid }) => {
  const g = event.groupData;
  const data = isPlainObject(g) && isPlainObject(g.data) ? g.data : null;
  if (!data) fail('BAD_CLOUDID', 'group data missing or not decrypted');

  const openGId = data.opengid;
  const chatType = data.chat_type === undefined ? undefined : Number(data.chat_type);
  const isGroup = typeof openGId === 'string' && openGId.length > 0 && openGId.length <= 128
    && (chatType === undefined || GROUP_CHAT_TYPES.includes(chatType));
  if (!isGroup) fail('NOT_GROUP', 'not a group chat');

  const groupRef = sha256hex(openGId + pepper()).slice(0, 16);
  const dateKey = coreapi.dateKeyAt(now());
  const id = `${openGId}_${openid}`;

  // upsert with a deterministic _id: add first, on duplicate refresh lastSeen
  const created = await store.addIfAbsent('group_members', {
    _id: id, openGId, openid, groupRef, firstSeen: dateKey, lastSeen: dateKey,
  });
  if (!created) {
    await store.db().collection('group_members').doc(id).update({ data: { lastSeen: dateKey, groupRef } });
  }
  const out = { ok: true, groupRef };
  // Only if the device spike forces the groupid route for getGroupCloudStorage (DJT spec 9.2 step 6).
  if (process.env.JOINGROUP_RETURN_OPENGID === '1') out.groupid = openGId;
  return out;
});
