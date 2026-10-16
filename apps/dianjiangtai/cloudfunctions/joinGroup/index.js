'use strict';
// joinGroup: group context from the cloudID of wx.getGroupEnterInfo (spec §9.2, §11.3).
// M1: the client sends the RAW cloudID string and the SERVER resolves it with cloud.getOpenData({ list: [cloudID] })
// (wx-server-sdk; https://developers.weixin.qq.com/minigame/dev/wxcloud/reference-sdk-api/open/Cloud.getOpenData.html).
// Nothing the client could have shaped is trusted: `event.groupData` / any decrypted-looking object is never read, so a
// modified client cannot join a group whose openGId it merely knows. No platform secret is needed. Returns an opaque
// groupRef; never an openid. wx.getShareInfo is never used.
const store = require('./common/store');
const limits = require('./common/limits');
const input = require('./common/input');
const secrets = require('./common/secrets');
const { fail, now, sha256hex, isPlainObject } = require('./common/util');
const core = require('./common/coreapi');

const GROUP_CHAT_TYPES = [3, 4]; // 3 group chat, 4 WeCom-interop group (phase0-platform.md 2.4)

/**
 * The decrypted payload of one getOpenData list item, or null. Studio standard (same in every app): the SDK reference
 * lists `{cloudID, data}`, so `data` must be a plain object; a truthy `errCode` (defensive: the docs list none) or a
 * foreign cloudID makes it null.
 */
function payloadOf(item, cloudID) {
  if (!isPlainObject(item)) return null;
  if (item.errCode || item.errcode) return null;
  if (item.cloudID !== undefined && item.cloudID !== cloudID) return null;
  return isPlainObject(item.data) ? item.data : null;
}

/**
 * {openGId} of a group payload, else {code}. CTO ruling (studio-wide): the documented payload may not carry `chat_type`
 * at all, so it may be ABSENT (null counts as absent); when present it must be 3 or 4. `opengid` must be a non-empty
 * string of <= 128 chars; a payload with `open_single_roomid` and no `opengid` (a single chat) is NOT_GROUP.
 */
function groupOf(data) {
  if (!data) return { code: 'BAD_CLOUDID' };
  const ct = data.chat_type === null ? undefined : data.chat_type;
  const chatType = ct === undefined ? undefined : typeof ct === 'number' ? ct : typeof ct === 'string' && /^\d+$/.test(ct) ? Number(ct) : NaN;
  const g = data.opengid;
  if (typeof g !== 'string' || g.length < 1 || g.length > 128) return { code: 'NOT_GROUP' };
  if (chatType !== undefined && !GROUP_CHAT_TYPES.includes(chatType)) return { code: 'NOT_GROUP' };
  return { openGId: g };
}

async function resolveCloudId(cloudID) {
  if (typeof store.cloud.getOpenData !== 'function') fail('SERVER_CONFIG', 'cloud.getOpenData unavailable');
  let res;
  try {
    res = await store.cloud.getOpenData({ list: [cloudID] });
  } catch (e) {
    fail('BAD_CLOUDID', 'cloudID could not be resolved');
  }
  const list = res && Array.isArray(res.list) ? res.list : [];
  return list.length === 1 ? payloadOf(list[0], cloudID) : null;
}

exports.main = store.handler(async (event, { openid }) => {
  const cloudID = input.cloudID(event.cloudID); // BAD_CLOUDID before anything touches the platform
  const g = groupOf(await resolveCloudId(cloudID));
  if (!g.openGId) fail(g.code, g.code === 'NOT_GROUP' ? 'not a group chat' : 'cloudID invalid or expired');
  const openGId = g.openGId;

  const groupRef = sha256hex(openGId + secrets.pepper()).slice(0, 16);
  const dateKey = core.dateKeyAt(now());
  const id = `${openGId}_${openid}`;

  // upsert with a deterministic _id: add first, on duplicate refresh lastSeen
  const created = await store.addIfAbsent('group_members', {
    _id: id, openGId, openid, groupRef, firstSeen: dateKey, lastSeen: dateKey,
  });
  if (!created) {
    await store.db().collection('group_members').doc(id).update({ data: { lastSeen: dateKey, groupRef } });
  }
  const out = { ok: true, groupRef };
  // Only if the device spike forces the groupid route for getGroupCloudStorage (spec §9.2 step 6).
  if (process.env.JOINGROUP_RETURN_OPENGID === '1') out.groupid = openGId;
  return out;
}, { rate: limits.rateOf('joinGroup') });

exports.payloadOf = payloadOf;
exports.groupOf = groupOf;
