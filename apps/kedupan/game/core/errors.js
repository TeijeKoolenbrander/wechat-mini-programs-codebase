/**
 * Error codes (spec 11.3) and the client copy for each (spec 6 states). Pure JS.
 * Server codes come back as {ok:false, code, message}; TIMEOUT / NETWORK / BAD_RESPONSE are produced by js/api.js only.
 */

const SERVER_CODES = [
  'INVALID_INPUT', 'CARD_ORDER', 'CARD_DONE', 'LATE_SUBMIT', 'DAILY_UNAVAILABLE', 'DAY_OPEN',
  'ROUND_NOT_FOUND', 'ROUND_EXPIRED', 'OWN_ROUND', 'ALREADY_GUESSED', 'TOO_FEW_GUESSES', 'NOT_HOST',
  'NO_TEMPLATE', 'NOT_MEMBER', 'NOT_GROUP', 'BAD_CLOUDID', 'RATE_LIMITED', 'UNAUTHENTICATED', 'FORBIDDEN',
  'SERVER_CONFIG', 'INTERNAL',
  // added by this implementation (decisions TD-9)
  'NO_CARD_AVAILABLE',
  // D-2 typed clues (spec 11.3)
  'TEXT_REJECTED', 'TEXT_BLOCKED', 'MODERATION_BUSY', 'RULES_REQUIRED', 'RESTRICTED', 'UGC_PAUSED', 'DUP_REPORT', 'REPORT_LIMIT',
];
const CLIENT_CODES = ['TIMEOUT', 'NETWORK', 'BAD_RESPONSE'];

/** Player-facing copy by code. `where` overrides (e.g. RATE_LIMITED on createRound vs getBonusCard). */
const COPY = {
  INVALID_INPUT: '出了点小问题，请重试',
  CARD_ORDER: '请按顺序回答',
  CARD_DONE: null, // not an error for the player: the stored reveal is shown
  LATE_SUBMIT: '这一期已经结束，可以去往期里玩',
  DAILY_UNAVAILABLE: '今日卡片需联网获取',
  DAY_OPEN: '这一期还没结束',
  ROUND_NOT_FOUND: '找不到这道题',
  ROUND_EXPIRED: '这道题已经结束了',
  OWN_ROUND: '这是你自己出的题',
  ALREADY_GUESSED: '你已经猜过了',
  TOO_FEW_GUESSES: '至少 2 人作答后可揭晓',
  NOT_HOST: '只有出题人可以这样做',
  NO_TEMPLATE: null,
  NOT_MEMBER: '本群数据暂时打不开',
  NOT_GROUP: null,
  BAD_CLOUDID: null,
  RATE_LIMITED: '操作太频繁，请稍后再试',
  UNAUTHENTICATED: '网络不稳，请重试',
  FORBIDDEN: null,
  SERVER_CONFIG: '服务暂时不可用',
  INTERNAL: '服务暂时不可用，请重试',
  NO_CARD_AVAILABLE: '暂时没有可加的题',
  // D-2 typed clues (spec 6.5, 6.12). TEXT_REJECTED's copy is the per-reason hint of core/clue.js (hintFor).
  TEXT_REJECTED: '换个说法吧',
  TEXT_BLOCKED: '这个提示没通过审核，换个说法吧',
  MODERATION_BUSY: '提示暂时没法检查，还没有发出去',
  RULES_REQUIRED: null, // the 发言规则 sheet opens instead
  RESTRICTED: null, // the restriction copy (strikes.restrictionText) replaces tab 1
  UGC_PAUSED: '自己写提示暂时关闭，先选一个提示词吧',
  DUP_REPORT: '你已经举报过这个提示了',
  REPORT_LIMIT: '今天的举报次数用完了',
  TIMEOUT: '网络不稳，请重试',
  NETWORK: '网络不稳，请重试',
  BAD_RESPONSE: '服务暂时不可用，请重试',
};
const COPY_BY_WHERE = {
  'createRound:RATE_LIMITED': '今天出的题够多啦，明天再来',
  'setClue:RATE_LIMITED': '操作太频繁，请稍后再试',
  'getBonusCard:RATE_LIMITED': '今天的加一题用完了',
  'submitCard:TIMEOUT': '网络不稳，答案还没送达',
  'submitCard:NETWORK': '网络不稳，答案还没送达',
  'submitCard:RATE_LIMITED': '操作太频繁，答案还没送达，稍后再试',
};

/** `scope` is the response's own `scope` field ('day' | 'minute') where it matters: setClue's 50-checks-a-day limit has its own copy. */
function copyFor(code, where, scope) {
  if (code === 'RATE_LIMITED' && where === 'setClue' && scope === 'day') return '今天检查提示的次数用完了，先选一个提示词吧';
  const k = where + ':' + code;
  if (Object.prototype.hasOwnProperty.call(COPY_BY_WHERE, k)) return COPY_BY_WHERE[k];
  return Object.prototype.hasOwnProperty.call(COPY, code) ? COPY[code] : COPY.INTERNAL;
}

/** Errors that mean "no connection" (the offline / retry states) as opposed to a refusal by the server. */
function isNetworkError(code) {
  return CLIENT_CODES.indexOf(code) >= 0 || code === 'UNAUTHENTICATED';
}

module.exports = { SERVER_CODES, CLIENT_CODES, COPY, copyFor, isNetworkError };
