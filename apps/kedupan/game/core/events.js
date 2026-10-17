/**
 * Analytics event table (spec 12, AC 77). Pure JS: event name -> required props, so the client emitter and the QA
 * harness check the same list. `wx.reportEvent` is never used; events go through the `track` function with a
 * top-level sessionId and clientTs. Optional props are listed with a trailing `?`.
 */

const { CONFIG } = require('./config');

const COMMON = ['isNewUser', 'contentVersion', 'appVersion']; // added to every event by analytics.js

const EVENTS = {
  session_start: ['scene', 'fromCard', 'hasShareTicket'],
  card_open: ['cardKind', 'hasShareTicket', 'roundId?'],
  howto_view: ['auto'],
  daily_card_place: ['dateKey', 'idx', 'touches', 'nudges', 'ms'],
  daily_card_reveal: ['dateKey', 'idx', 'd', 'score', 'label', 'hasGroup', 'n'],
  daily_complete: ['dateKey', 'total', 'durationMs', 'hasGroup', 'streak'],
  daily_result_view: ['dateKey', 'final'],
  share_tap: ['kind', 'dateKey?', 'roundId?'],
  round_create: ['roundId', 'spectrumId', 'swapsFree', 'swapsAd'],
  // D-2 typed clues (spec 12). NO event, client or server, ever carries a typed clue, a fragment of it, the blocked text or the trace_id:
  // `chars` is the typed length as an integer, `reason` a fixed token, and every prop below is an enum, token, boolean or integer.
  round_clue: ['roundId', 'clueMode', 'presetSwaps', 'chars?', 'tabSwitches?'],
  clue_tab: ['tab', 'via'],
  clue_result: ['result', 'reason?'],
  clue_check: ['api', 'suggest', 'label?', 'latencyMs', 'errCode?'], // server-side, every WeChat text check
  rules_view: ['source'],
  rules_agree: ['source'],
  clue_report: ['roundId', 'reason', 'result'],
  strike: ['cause', 'strikes30d'], // server-side
  restrict: ['cause', 'strikes30d', 'days?'], // server-side
  ugc_pause: ['createEnabled', 'viewEnabled'], // server-side, admin setUgc
  round_guess: ['roundId', 'late', 'isFirstSession'],
  round_reveal: ['roundId', 'by', 'guesses', 'mq'], // server-side
  round_view: ['roundId', 'status', 'isHost'],
  group_join: ['result', 'errCode?', 'scene', 'chatType?'], // never the openGId or groupRef
  group_view: ['state', 'n?', 'hasMq'],
  friend_board_view: ['state', 'mode?'],
  archive_view: ['items', 'state'],
  archive_set_complete: ['dateKey', 'total', 'setsThisSession'],
  bonus_card: ['itemId', 'score'],
  distribution_unlock: ['dateKey', 'via'],
  card_report: ['itemId', 'reason'],
  privacy_result: ['result', 'trigger?'],
  friend_scope_result: ['result'],
  marker_write: ['result'],
  ad_request: ['placement', 'stub', 'errCode?'],
  ad_show: ['placement', 'stub', 'errCode?'],
  ad_reward: ['placement', 'stub', 'errCode?'],
  ad_close_early: ['placement', 'stub', 'errCode?'],
  ad_error: ['placement', 'stub', 'errCode?'],
  interstitial_show: ['setsThisSession'],
  subscribe_offer: ['where'],
  subscribe_result: ['where', 'result', 'errCode?'],
  subscribe_send: ['where', 'result', 'errCode?'], // server-side
  display_setting: ['largeText', 'highContrast', 'source'],
  daily_gen: ['dateKey', 'source', 'ms', 'failed?'], // server-side timer
  finalize_day: ['dateKey', 'finalCount', 'ms', 'failed?'], // server-side timer
  board_list: ['view', 'mode', 'rows', 'bytes', 'every?'], // server-side, sampled 1 in `every` (M3)
  error: ['where', 'code'],
};

const SERVER_SIDE = ['round_reveal', 'subscribe_send', 'daily_gen', 'finalize_day', 'board_list', 'clue_check', 'strike', 'restrict', 'ugc_pause'];
const CLIENT_EVENT_NAMES = Object.keys(EVENTS).filter((n) => SERVER_SIDE.indexOf(n) < 0);
const ENUMS = {
  fromCard: ['none', 'daily', 'round', 'group'],
  cardKind: ['daily', 'round', 'reveal', 'group', 'notice'],
  shareKind: ['daily', 'round', 'reveal', 'group', 'menu'],
  adPlacement: ['bonus', 'distribution', 'swap', 'interstitial', 'banner'],
  reportReason: ['unsuitable', 'ambiguous', 'typo'],
  clueReportReason: CONFIG.ugc.reportReasons.concat(['ad']), // the five (legacy spelling 'ad' tolerated)
  clueRejectReason: ['empty', 'length', 'digit', 'digits', 'position', 'endLabel', 'charset', 'chars', 'blocked'],
  clueMode: ['text', 'preset'],
  clueTab: ['text', 'preset'],
  clueApi: ['game', 'general', 'mock'],
  clueSuggest: ['pass', 'risky', 'review', 'none'],
  strikeCause: ['risky', 'upheld'],
  revealBy: ['host', 'count', 'timer'],
};

/** Missing required props of an event payload (empty = ok); unknown event names are reported. */
function missingProps(name, props) {
  const spec = EVENTS[name];
  if (!spec) return ['unknown event ' + name];
  const p = props || {};
  return spec.filter((k) => k.slice(-1) !== '?' && p[k] === undefined).map((k) => k);
}

// ---- server-side prop allowlist (L2) ---------------------------------------------------------------------------------
// Every prop key has ONE type. `track` keeps, per event, only the keys EVENTS[name] lists (plus COMMON) whose value
// passes its type; everything else is dropped (the event itself is still stored). Strings are short, charset-limited
// tokens (the one free-text prop is the Chinese score label, length-capped); no prop can carry an identifier-like or
// arbitrarily large value.
const TOKEN = /^[A-Za-z0-9_.:\-]{1,40}$/;
const DATE_KEY = /^\d{8}$/;
const ROUND_ID = /^[A-Z2-7]{8}$/;
const SPECTRUM_ID = /^s\d{3}$/;
const ITEM_ID = /^s\d{3}i\d{2}$/;
const int = (v) => Number.isInteger(v) && v >= -1e9 && v <= 1e12;
const oneOf = (list) => (v) => typeof v === 'string' && list.indexOf(v) >= 0;
const PROP_TYPES = {
  // COMMON
  isNewUser: 'bool', contentVersion: int, appVersion: (v) => typeof v === 'string' && /^[0-9A-Za-z.\-+]{1,20}$/.test(v),
  // enums
  fromCard: oneOf(ENUMS.fromCard), cardKind: oneOf(ENUMS.cardKind), kind: oneOf(ENUMS.shareKind), placement: oneOf(ENUMS.adPlacement),
  // `reason` is one fixed token of: a content-report reason, a clue report reason, or a local clue rejection reason
  reason: oneOf(ENUMS.reportReason.concat(ENUMS.clueReportReason, ENUMS.clueRejectReason)), clueMode: oneOf(ENUMS.clueMode), by: oneOf(ENUMS.revealBy),
  tab: oneOf(ENUMS.clueTab), api: oneOf(ENUMS.clueApi), suggest: oneOf(ENUMS.clueSuggest), cause: oneOf(ENUMS.strikeCause),
  // ids
  dateKey: (v) => typeof v === 'string' && DATE_KEY.test(v), roundId: (v) => typeof v === 'string' && ROUND_ID.test(v),
  spectrumId: (v) => typeof v === 'string' && SPECTRUM_ID.test(v), itemId: (v) => typeof v === 'string' && ITEM_ID.test(v),
  // booleans
  hasShareTicket: 'bool', auto: 'bool', hasGroup: 'bool', final: 'bool', late: 'bool', isFirstSession: 'bool', isHost: 'bool', hasMq: 'bool',
  stub: 'bool', largeText: 'bool', highContrast: 'bool', failed: 'bool', createEnabled: 'bool', viewEnabled: 'bool',
  // numbers
  scene: int, idx: (v) => Number.isInteger(v) && v >= 0 && v <= 4, touches: int, nudges: int, ms: int, d: int, score: int, n: int, total: int,
  durationMs: int, streak: int, swapsFree: int, swapsAd: int, presetSwaps: int, guesses: int, mq: int, items: int, setsThisSession: int,
  chatType: int, rows: int, bytes: int, finalCount: int, every: int,
  chars: (v) => Number.isInteger(v) && v >= 1 && v <= CONFIG.ugc.clueMax, tabSwitches: int, latencyMs: int, strikes30d: int, days: int,
  // short tokens
  where: 'token', state: 'token', mode: 'token', status: 'token', result: 'token', source: 'token', via: 'token', trigger: 'token', view: 'token',
  // a code is a token or a small integer (platform error numbers)
  errCode: (v) => (typeof v === 'string' && TOKEN.test(v)) || int(v), code: (v) => (typeof v === 'string' && TOKEN.test(v)) || int(v),
  // the score label (one of the CONFIG.score.labels, never free text) or the platform's numeric content label (clue_check)
  label: (v) => (typeof v === 'string' && CONFIG.score.labels.some((l) => l.label === v)) || int(v),
};
function propOk(key, v) {
  const t = PROP_TYPES[key];
  if (v === null) return t !== undefined; // an explicit null is allowed for any known prop (e.g. total before the daily completes)
  if (t === 'bool') return typeof v === 'boolean';
  if (t === 'token') return typeof v === 'string' && TOKEN.test(v);
  return typeof t === 'function' && t(v) === true;
}
/** Allowed prop keys of an event: its own (required and `?` optional) plus COMMON. Unknown event -> []. */
function allowedProps(name) {
  const spec = EVENTS[name];
  if (!spec) return [];
  return spec.map((k) => (k.slice(-1) === '?' ? k.slice(0, -1) : k)).concat(COMMON);
}
/** Props of one event reduced to the allowlist and checked for type/enum; returns a new plain object. */
function sanitizeProps(name, props) {
  const out = {};
  if (!props || typeof props !== 'object' || Array.isArray(props)) return out;
  allowedProps(name).forEach((k) => {
    if (Object.prototype.hasOwnProperty.call(props, k) && propOk(k, props[k])) out[k] = props[k];
  });
  return out;
}

module.exports = { EVENTS, COMMON, SERVER_SIDE, CLIENT_EVENT_NAMES, ENUMS, missingProps, allowedProps, sanitizeProps, PROP_TYPES };
