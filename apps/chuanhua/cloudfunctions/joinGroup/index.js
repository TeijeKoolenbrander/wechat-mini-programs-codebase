'use strict';
// joinGroup: group context from a cloudID-decrypted getGroupEnterInfo payload (spec 9.2, PO-6).
// The client sends wx.cloud.CloudID(cloudID) as `groupData`; the platform replaces it in `event`
// with {cloudID, data:{opengid, chat_type, ...}} decrypted server-side, so the openGId cannot be
// forged. No platform secret is needed. Returns an opaque groupRef; never an openid or openGId.
const store = require('./common/store');
const { fail, now, sha256hex, isPlainObject, dateKeyAt } = require('./common/util');

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
  const dateKey = dateKeyAt(now());
  const id = `${openGId}_${openid}`;
  const created = await store.addIfAbsent('group_members', {
    _id: id, openGId, openid, groupRef, firstSeen: dateKey, lastSeen: dateKey,
  });
  if (!created) {
    await store.db().collection('group_members').doc(id).update({ data: { lastSeen: dateKey, groupRef } });
  }
  return { ok: true, groupRef };
});
