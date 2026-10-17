'use strict';
/**
 * Error codes (spec 13.2) with the player-facing copy. Cloud functions return {ok:false, code, message}
 * and never throw to the client; `message` is a developer string, the UI shows `textFor(code)`.
 * Codes marked client:true are produced by js/api.js (never by the server).
 * `added` marks codes that are not in spec 13.2 (decisions TD-n).
 */

const CODES = {
  // copied from 点将台
  UNAUTHENTICATED: { text: '请先打开游戏再试一次' },
  FORBIDDEN: { text: '没有权限' },
  RATE_LIMITED: { text: '操作太快了，稍等一下' },
  NOT_MEMBER: { text: '接龙只能在发起的群里接力' },
  NOT_GROUP: { text: '请在群聊里打开接龙卡片' },
  BAD_CLOUDID: { text: '没能确认群聊，请重试' },
  SERVER_CONFIG: { text: '服务暂不可用，请稍后再试' },
  INTERNAL: { text: '出了点小问题，请重试' },
  BUSY_RETRY: { text: '人太多啦，请再点一次', added: true }, // retryable: a transaction lost its write conflicts; nothing was written (QA-R2-2)
  // rules / policy
  RULES_REQUIRED: { text: '请先同意接龙公约' },
  RESTRICTED: { text: '你暂时不能参与接龙' },
  UGC_PAUSED: { text: '接龙维护中，可以先看看已揭晓的接龙' },
  UGC_BUSY: { text: '今天接龙太热闹了，明天再开新的吧' },
  // allowances
  START_LIMIT: { text: '今天的接龙已开完，明天再来开新的吧' },
  STEP_LIMIT: { text: '今天接得够多啦，明天再来' },
  CLAIM_LIMIT: { text: '这条接龙你今天看过很多次了，明天再来吧' },
  REPORT_LIMIT: { text: '今天举报次数已达上限' },
  REWARD_LIMIT: { text: '暂无广告，请稍后再试', added: true },
  // rooms (spec 13.2, 3A)
  ROOM_NOT_FOUND: { text: '找不到这一局' },
  ROOM_STARTED: { text: '这一局已经开始了，等下一局吧' },
  ROOM_FULL: { text: '这一局满员了' },
  ROOM_CLOSED: { text: '这一局已经结束了' },
  NOT_IN_ROOM: { text: '你不在这一局里' },
  NOT_HOST: { text: '只有房主可以开始' },
  NOT_ENOUGH_PLAYERS: { text: '至少 3 人才能开局' },
  IN_OTHER_ROOM: { text: '你还在另一局里' },
  IN_ROOM: { text: '你正在一局里，先玩完再来接' },
  IN_CLAIM: { text: '你正在接一棒，先交完再开一局', added: true },
  REROLL_LIMIT: { text: '换一批机会已用完', added: true },
  ROUND_OVER: { text: '时间到，这一棒已自动交出' },
  ALREADY_SENT: { text: '这一棒已经交过了' },
  ROOM_LIMIT: { text: '今天开局次数已用完，明天再来' },
  JOIN_LIMIT: { text: '今天加入的局数已达上限，明天再来' },
  LIVE_OFF: { text: '开一局暂时不可用，可以先玩慢慢传' },
  // chain
  CHAIN_NOT_FOUND: { text: '找不到这条接龙' },
  CHAIN_CLOSED: { text: '这条接龙已经结束了' },
  TAKEN: { text: '被群友抢先一步' },
  PENDING: { text: '上一棒审核中，通常几分钟' },
  PREV_MINE: { text: '上一棒是你传的，等别人接下一棒吧' },
  CAP_REACHED: { text: '这条接龙你已经接了 3 棒，留给群友吧' },
  NEED_GROUP: { text: '接龙只能在发起的群里接力' },
  WRONG_GROUP: { text: '接龙只能在发起的群里接力' },
  CLAIM_LOST: { text: '超时了，这一棒已被群友接走' },
  // input
  INVALID_STROKES: { text: '这幅画传不出去，请重新画一下' },
  TEXT_REJECTED: { text: '换个说法吧' },
  TEXT_BLOCKED: { text: '这句话没通过审核，换个说法吧' },
  IMAGE_BLOCKED: { text: '这幅画没通过审核，改一改再交' },
  MODERATION_BUSY: { text: '审核服务繁忙，请稍后再试' },
  BAD_REQUEST: { text: '请求不对，请重试', added: true },
  // reveal and social
  NOT_PARTICIPANT: { text: '完整接龙仅参与的群友可见' },
  NOT_STARTER: { text: '只有发起人可以提前揭晓' },
  TOO_EARLY: { text: '至少传完 4 棒才能提前揭晓' },
  DUP_REPORT: { text: '你已举报过这条内容' },
  OWN_STEP: { text: '不能举报自己的内容' },
  NO_TEMPLATE: { text: '提醒暂不可用' },
  // client-side only (js/api.js)
  TIMEOUT: { text: '网络有点慢，请重试', client: true },
  NETWORK: { text: '需联网才能接龙', client: true },
  BAD_RESPONSE: { text: '出了点小问题，请重试', client: true },
};

/** Player-facing text for a code (unknown codes get the generic line). */
function textFor(code) {
  const c = CODES[code];
  return c ? c.text : CODES.INTERNAL.text;
}

const SERVER_CODES = Object.keys(CODES).filter((k) => !CODES[k].client);

module.exports = { CODES, textFor, SERVER_CODES };
