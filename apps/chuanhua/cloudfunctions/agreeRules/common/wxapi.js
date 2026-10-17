'use strict';
// Thin wrappers around the cloud SDK: openapi (content security, updatable message, subscribe message) and cloud
// storage. NOTHING else in the code base calls cloud.openapi / cloud.uploadFile, so the platform parameter names and
// response shapes [VERIFY V3, V7, V8] are adapted in exactly one place. No platform secret is involved (cloud calls need none).
const { CONFIG } = require('../core/config');
const store = require('./store');
const { withTimeout } = require('./util');

const cloud = () => {
  store.db(); // makes sure cloud.init ran
  return store.cloud;
};

/** openapi results carry errCode (0 = ok); a non-zero code is a failure even when the SDK did not throw */
function okResult(res, what) {
  if (!res) throw new Error(what + ': empty response');
  // the cloud SDK answers errCode / errMsg, the HTTPS API errcode / errmsg: read both
  const code = res.errCode !== undefined && res.errCode !== null ? res.errCode : res.errcode;
  if (code !== undefined && code !== null && code !== 0) {
    throw Object.assign(new Error(what + ': errCode ' + code + ' ' + (res.errMsg || res.errmsg || '')), { errCode: code });
  }
  return res;
}

/** the platform's namespace for the mini-game content-security calls (wx-server-sdk: cloud.openapi.wxa.game.contentSpam) */
function contentSpam() {
  const o = cloud().openapi;
  const c = o && o.wxa && o.wxa.game && o.wxa.game.contentSpam;
  if (!c) throw Object.assign(new Error('openapi.wxa.game.contentSpam is not available in this SDK'), { errCode: 'NO_SDK_API' });
  return c;
}

/**
 * Game msgSecCheck (wxa.game.contentSpam.msgSecCheck [VERIFY V19]), timeout 2 s. `params` = core/moderation.gameTextParams.
 * @returns {Promise<{suggest:string|undefined, label:*}>} the caller maps `suggest` with moderation.verdictOf (unknown = error)
 */
async function gameMsgSecCheck(params) {
  const res = okResult(await withTimeout(contentSpam().msgSecCheck(params), CONFIG.moderation.textGameTimeoutMs, 'game msgSecCheck'), 'game msgSecCheck');
  const r = res.result || {};
  return { suggest: r.suggest, label: r.label };
}

/**
 * Game mediaCheckSync (wxa.game.contentSpam.mediaCheckSync [VERIFY V16]), SYNCHRONOUS, 5 s timeout (6.1). `params` = core/moderation.syncImageParams
 * ({openid, version:2, scene, media_url, media_type:2}); both the snake_case and the camelCase spellings are sent [V3]. Errors carry `errCode`
 * (750031 = game not supported, 750032/750033 = quota); a timeout carries `timeout: true`.
 * @returns {Promise<{suggest:string|undefined, label:*, traceId:string|null}>}
 */
async function mediaCheckSync(params) {
  const p = Object.assign({}, params, { mediaUrl: params.media_url, mediaType: params.media_type });
  const res = okResult(await withTimeout(contentSpam().mediaCheckSync(p), CONFIG.moderation.imageSyncTimeoutMs, 'mediaCheckSync'), 'mediaCheckSync');
  const r = res.result || {};
  return { suggest: r.suggest, label: r.label, traceId: res.trace_id || res.traceId || null };
}

/**
 * msgSecCheck v2. `params` = core/moderation.textCheckParams ({content, version:2, scene, openid}). Timeout 3 s.
 * @returns {Promise<{suggest:string|undefined, label:*}>} the caller maps `suggest` with moderation.verdictOf (unknown = error)
 */
async function msgSecCheck(params) {
  const res = okResult(await withTimeout(cloud().openapi.security.msgSecCheck(params), CONFIG.moderation.textTimeoutMs, 'msgSecCheck'), 'msgSecCheck');
  const r = res.result || {};
  return { suggest: r.suggest, label: r.label };
}

/**
 * mediaCheckAsync v2. `params` = core/moderation.mediaCheckParams ({media_url, media_type:2, version:2, scene, openid}).
 * The cloud SDK names its parameters in camelCase (mediaUrl/mediaType) while the HTTP API uses snake_case: both spellings
 * are sent so the call is valid whichever the runtime expects [VERIFY V3].
 * @returns {Promise<string>} trace_id
 */
async function mediaCheckAsync(params) {
  const p = Object.assign({}, params, { mediaUrl: params.media_url, mediaType: params.media_type });
  const res = okResult(await withTimeout(cloud().openapi.security.mediaCheckAsync(p), 8000, 'mediaCheckAsync'), 'mediaCheckAsync');
  const id = res.trace_id || res.traceId;
  if (typeof id !== 'string' || !id) throw new Error('mediaCheckAsync: no trace_id');
  return id;
}

/** upload a PNG buffer; returns the fileID */
async function uploadPng(cloudPath, buffer) {
  const r = await cloud().uploadFile({ cloudPath, fileContent: buffer });
  if (!r || !r.fileID) throw new Error('uploadFile: no fileID');
  return r.fileID;
}
/** a temp download URL for a file (maxAge seconds) */
async function tempUrl(fileID, maxAge) {
  const r = await cloud().getTempFileURL({ fileList: [{ fileID, maxAge }] });
  const f = r && r.fileList && r.fileList[0];
  if (!f || f.status !== 0 || !f.tempFileURL) throw new Error('getTempFileURL failed');
  return f.tempFileURL;
}
/** delete files in batches of 50; returns how many the platform confirmed deleted */
async function deleteFiles(fileIDs) {
  let n = 0;
  for (let i = 0; i < fileIDs.length; i += 50) {
    const r = await cloud().deleteFile({ fileList: fileIDs.slice(i, i + 50) });
    n += ((r && r.fileList) || []).filter((f) => f.status === 0 || /not exist|-503/i.test(String(f.errMsg || ''))).length;
  }
  return n;
}

async function createActivityId() {
  const res = okResult(await cloud().openapi.updatableMessage.createActivityId({}), 'createActivityId');
  if (typeof res.activityId !== 'string' || !res.activityId) throw new Error('createActivityId: no activityId');
  return res.activityId;
}
/** progress text of the invite card: "成员正在加入，当前 n/6 人" (chain, spec 9.5) or "当前 n/10 人" (room); targetState 0 = joining, 1 = started */
async function setUpdatableMsg(activityId, count, total, started) {
  return okResult(await cloud().openapi.updatableMessage.setUpdatableMsg({
    activityId,
    targetState: started ? 1 : 0,
    templateInfo: { parameterList: [{ name: 'member_count', value: String(count) }, { name: 'room_limit', value: String(total) }] },
  }), 'setUpdatableMsg');
}
async function sendSubscribe(params) {
  return okResult(await cloud().openapi.subscribeMessage.send(params), 'subscribeMessage.send');
}

/**
 * cloud.getOpenData({list:[cloudID]}) (wx-server-sdk): the SERVER decrypts the CloudID, so the payload cannot be forged by the
 * client (M1). Official reference:
 * https://developers.weixin.qq.com/minigame/dev/wxcloud/reference-sdk-api/open/Cloud.getOpenData.html
 * Returns the single result item {cloudID, data, errCode?}, or null on an empty / malformed / failed answer.
 */
async function getOpenData(cloudID) {
  const res = await withTimeout(cloud().getOpenData({ list: [cloudID] }), 5000, 'getOpenData');
  if (!res || (res.errCode !== undefined && res.errCode !== null && res.errCode !== 0)) return null;
  return Array.isArray(res.list) && res.list.length === 1 ? res.list[0] : null;
}

module.exports = { getOpenData, msgSecCheck, gameMsgSecCheck, mediaCheckSync, mediaCheckAsync, uploadPng, tempUrl, deleteFiles, createActivityId, setUpdatableMsg, sendSubscribe };
