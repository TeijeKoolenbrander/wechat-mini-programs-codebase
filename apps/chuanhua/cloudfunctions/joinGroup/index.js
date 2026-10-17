'use strict';
// joinGroup: group context from a getGroupEnterInfo cloudID (spec 9.2, V6). Security fix M1 (TD-96): the client sends the RAW
// cloudID string; this function decrypts it itself with cloud.getOpenData({list:[cloudID]}) (wx-server-sdk, official reference
// https://developers.weixin.qq.com/minigame/dev/wxcloud/reference-sdk-api/open/Cloud.getOpenData.html). A client-shaped
// payload (`event.groupData.data.opengid`) is never read, so a modified client cannot join a group whose openGId it merely knows.
// No platform secret is needed. Returns an opaque groupRef; never an openid or openGId.
const store = require('./common/store');
const { now, isPlainObject } = require('./common/util');
const { bad } = require('./common/errors');
const { cloudIdOf } = require('./common/input');
const wx = require('./common/wxapi');
const groups = require('./common/groups');

const GROUP_CHAT_TYPES = [3, 4]; // 3 group chat, 4 WeCom-interop group (chat_type may also be absent, see below)

exports.main = store.handler(async (event, { openid }) => {
  await store.rateLimit(openid, 'join', 1, 20);
  const cloudID = cloudIdOf(event);
  if (!cloudID) bad('BAD_CLOUDID');
  let item;
  try {
    item = await wx.getOpenData(cloudID);
  } catch (e) {
    console.warn('joinGroup getOpenData failed', store.errText(e));
    bad('BAD_CLOUDID'); // expired (5 min), not for this app, or the platform failed: the client may retry with a fresh one
  }
  if (!isPlainObject(item) || item.errCode || !isPlainObject(item.data)) bad('BAD_CLOUDID');
  if (typeof item.cloudID === 'string' && item.cloudID !== cloudID) bad('BAD_CLOUDID');
  // Studio ruling: the payload is accepted when `chat_type` is ABSENT or one of 3 / 4, and it must carry an `opengid`. A payload that has only
  // `open_single_roomid` (a single chat) has no opengid and is rejected; so is any other chat_type, with or without an opengid.
  const openGId = item.data.opengid;
  const chatTypeAbsent = item.data.chat_type === undefined || item.data.chat_type === null;
  const chatTypeOk = chatTypeAbsent || GROUP_CHAT_TYPES.includes(Number(item.data.chat_type));
  const isGroup = typeof openGId === 'string' && openGId.length > 0 && openGId.length <= 128 && chatTypeOk;
  if (!isGroup) bad('NOT_GROUP');

  const groupRef = groups.refFor(openGId);
  const id = openGId + '_' + openid;
  const t = now();
  // upsert with a deterministic _id: add first, on duplicate refresh lastSeen
  const created = await store.addIfAbsent('group_members', { _id: id, openGId, openid, groupRef, firstSeen: t, lastSeen: t });
  if (!created) await store.coll('group_members').doc(id).update({ data: { lastSeen: t, groupRef } });
  await store.writeEvent(openid, 'group_join', { result: 'ok', created });
  return { ok: true, groupRef };
});
