'use strict';
/**
 * Analytics event rules (spec 14, AC 75). Events never carry user text, strokes, openids or group ids. The client
 * (js/analytics.js) builds events; the `track` function runs `sanitizeEvents` on whatever arrives, so a bug or a modified
 * client cannot smuggle content into `events`.
 *
 * L2 (security audit, TD-97): `EVENT_PROPS` is the per-event allowlist from the spec 14 catalogue. A prop is stored only if its
 * key is declared for THAT event (or is one of COMMON_PROPS) and its value passes the declared type / enum / range. Unknown
 * keys, wrong types and out-of-enum values are dropped.
 */

// ---- prop type specs ---------------------------------------------------------------------------------------------------------
const MAX_EVENTS = 50;
const MAX_STR = 40;

const bool = { t: 'bool' };
const int = (lo, hi) => ({ t: 'int', lo, hi });
const en = (...v) => ({ t: 'enum', v });
const CHAIN_ID = { t: 'str', re: /^[A-Za-z0-9]{6,16}$/ }; // chain ids are 10-char base32; ids only (spec 9, 14)
const TOKEN = { t: 'str', re: /^[A-Za-z][A-Za-z0-9_.-]{0,29}$/ }; // short identifier-like label (a state, a handled-error site)
const CODE = { t: 'code' }; // an error code: a small integer or a TOKEN
const STEP = int(0, 12);
const MODE = en('live', 'chain');
const PLACEMENT = en('start', 'palette', 'interstitial', 'banner', 'rewarded');

/** props present on every client event (spec 14 "common props") */
const COMMON_PROPS = {
  isNewUser: bool,
  appVersion: { t: 'str', re: /^[0-9A-Za-z][0-9A-Za-z.-]{0,15}$/ },
  promptsVersion: int(0, 1000),
};

/**
 * event name -> allowed props (spec 14). Server-side events (mod_verdict, mod_void, chain_reveal, chain_expire, share_update,
 * subscribe_send, ugc_pause, strike, restrict) are written by the functions themselves; a client that sends one gets its
 * props dropped (the empty allowlist).
 */
const EVENT_PROPS = {
  session_start: { scene: int(0, 99999), fromCard: en('none', 'room', 'invite', 'reveal', 'notice'), hasShareTicket: bool },
  card_open: { cardKind: en('room', 'invite', 'reveal'), hasShareTicket: bool, targetState: TOKEN, chainState: TOKEN },
  group_join: { result: en('ok', 'error', 'wrongScene', 'leftGroup', 'notGroup', 'privacyDenied'), errCode: CODE, scene: int(0, 99999), chatType: int(0, 99) },
  rules_view: { trigger: TOKEN },
  rules_agree: { trigger: TOKEN },
  picker_view: { source: en('home', 'slow') },
  prompt_roll: { mode: MODE, reroll: bool, rerollNo: int(0, 5), cats: { t: 'str', re: /^[A-L]{3}$/ } },
  prompt_pick: { mode: MODE, source: en('roll', 'reroll', 'custom', 'auto'), promptId: { t: 'str', re: /^[A-L][0-9]{2,4}$/ }, rerolled: bool, rerolls: int(0, 5), pickMs: int(0, 3600000) },
  custom_prompt_result: { mode: MODE, result: en('pass', 'local', 'review', 'risky', 'busy', 'blocked') },
  room_join: { result: en('ok', 'started', 'full', 'closed', 'wrongGroup', 'needGroup', 'inOther', 'limit', 'error'), seat: int(0, 9) },
  room_leave: { phase: en('lobby', 'playing'), round: int(0, 6) },
  rt_mode: { mode: en('watch', 'poll'), reason: en('error', 'unsupported'), latencyMs: int(0, 600000) },
  rematch: { role: en('host', 'member'), result: en('created', 'joined', 'error') },
  reveal_open: { mode: MODE, role: en('member', 'teaser'), chains: int(0, 10) },
  reveal_step: { mode: MODE, chainNo: int(1, 10), index: int(0, 12), of: int(0, 12), via: en('tap', 'swipe', 'dot', 'button') },
  reveal_done: { mode: MODE, chainsOpened: int(0, 10), stepsViewed: int(0, 200), durationSec: int(0, 86400) },
  chain_create: { chainId: CHAIN_ID, bound: bool },
  claim_attempt: { chainId: CHAIN_ID, step: STEP, inRoom: bool, result: en('ok', 'taken', 'pending', 'prevMine', 'cap', 'wrongGroup', 'needGroup', 'restricted', 'closed', 'inRoom', 'error') },
  step_view: { mode: MODE, chainId: CHAIN_ID, step: STEP, kind: en('draw', 'describe'), sourceKind: en('prompt', 'text', 'draw', 'marker', 'hidden') },
  // spec 14 `step_submit.strokes` is a COUNT: only an integer under that key is stored, so it cannot carry a drawing (TD-36)
  step_submit: {
    mode: MODE, chainId: CHAIN_ID, step: STEP, kind: en('draw', 'describe'), durationMs: int(0, 86400000), auto: bool, empty: bool, canvasH: int(768, 2048), strokes: int(0, 1000),
    points: int(0, 100000), undoCount: int(0, 10000), chars: int(0, 1000), colorsUsed: int(0, 32), palette: bool,
  },
  step_release: { chainId: CHAIN_ID, step: STEP, reason: en('quit', 'timeUp', 'claimLost') },
  step_result: { mode: MODE, chainId: CHAIN_ID, step: STEP, kind: en('draw', 'describe'), result: en('passed', 'marker', 'pending', 'blocked', 'busy', 'rejected', 'roundOver', 'claimLost', 'error') },
  laugh: { chainId: CHAIN_ID, step: STEP, on: bool },
  report_submit: { mode: MODE, reason: en('porn', 'politics', 'abuse', 'ad', 'other'), target: en('step', 'teaser'), reopened: bool },
  share_tap: { kind: en('room', 'invite', 'reveal', 'menu'), chainState: TOKEN, step: STEP },
  subscribe_offer: {},
  subscribe_result: { result: en('accept', 'reject', 'ban', 'error', 'filter', 'unsupported'), errCode: CODE },
  group_list_view: { state: TOKEN, counts: int(0, 100000) },
  album_view: { state: TOKEN, counts: int(0, 100000) },
  delete_step: { scope: en('one', 'all'), count: int(0, 1000) },
  restriction_shown: { level: int(0, 10) },
  ad_request: { placement: PLACEMENT, stub: bool },
  ad_load: { placement: PLACEMENT, stub: bool },
  ad_show: { placement: PLACEMENT, stub: bool },
  ad_close: { placement: PLACEMENT, stub: bool, early: bool },
  ad_reward: { placement: PLACEMENT, stub: bool },
  ad_error: { placement: PLACEMENT, stub: bool, errCode: CODE },
  interstitial_show: { placement: PLACEMENT, stub: bool },
  error: { where: TOKEN, code: CODE },
  // server-side events: no client props accepted
  mod_verdict: {}, mod_void: {}, room_create: {}, room_start: {}, room_round: {}, room_end: {}, room_close: {}, chain_reveal: {}, chain_expire: {}, share_update: {}, subscribe_send: {}, ugc_pause: {}, strike: {}, restrict: {},
};

/** client + server event names (spec 14). Unknown names are dropped. */
const EVENT_NAMES = Object.keys(EVENT_PROPS);

/** prop keys that must never be stored, whatever their value (also used by the client queue; defence in depth) */
const FORBIDDEN_KEYS = /^(text|content|prompt|promptText|customText|desc|description|sentence|strokes|drawing|image|png|openid|openId|unionid|groupId|openGId|opengid|groupRef|shareTicket|cloudID|nickName|nickname|avatar|phone)$/i;

const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

/** the (unchanged) value when it passes the spec, else undefined */
function checkValue(spec, v) {
  switch (spec.t) {
    case 'bool':
      return typeof v === 'boolean' ? v : undefined;
    case 'int':
      return typeof v === 'number' && Number.isInteger(v) && v >= spec.lo && v <= spec.hi ? v : undefined;
    case 'enum':
      return typeof v === 'string' && spec.v.indexOf(v) >= 0 ? v : undefined;
    case 'str':
      return typeof v === 'string' && v.length <= MAX_STR && spec.re.test(v) ? v : undefined;
    case 'code':
      if (typeof v === 'number') return Number.isInteger(v) && Math.abs(v) <= 99999999 ? v : undefined;
      return typeof v === 'string' && v.length <= MAX_STR && TOKEN.re.test(v) ? v : undefined;
    default:
      return undefined;
  }
}

/** looks like an openid or a long opaque id (24+ chars of [A-Za-z0-9_-]) */
function looksLikeSecretId(s) {
  return typeof s === 'string' && /^[A-Za-z0-9_-]{24,}$/.test(s);
}

/**
 * Allowlist-copy a batch. Returns the clean events [{name, props, sessionId, clientTs}] (at most 50).
 */
function sanitizeEvents(events) {
  if (!Array.isArray(events)) return [];
  const out = [];
  for (const e of events.slice(0, MAX_EVENTS)) {
    if (!e || typeof e !== 'object' || typeof e.name !== 'string' || !has(EVENT_PROPS, e.name)) continue;
    const allowed = EVENT_PROPS[e.name];
    const props = {};
    const src = e.props && typeof e.props === 'object' && !Array.isArray(e.props) ? e.props : {};
    for (const k of Object.keys(src)) {
      const spec = has(allowed, k) ? allowed[k] : has(COMMON_PROPS, k) ? COMMON_PROPS[k] : null;
      if (!spec) continue; // unknown key for this event
      if (FORBIDDEN_KEYS.test(k) && !(k === 'strokes' && spec.t === 'int')) continue;
      const v = checkValue(spec, src[k]);
      if (v === undefined || looksLikeSecretId(v)) continue;
      props[k] = v;
    }
    out.push({
      name: e.name,
      props,
      sessionId: typeof e.sessionId === 'string' && e.sessionId.length <= 40 && /^[A-Za-z0-9_-]+$/.test(e.sessionId) ? e.sessionId : null,
      clientTs: Number.isFinite(e.clientTs) ? e.clientTs : null,
    });
  }
  return out;
}

module.exports = { EVENT_NAMES, EVENT_PROPS, COMMON_PROPS, sanitizeEvents, FORBIDDEN_KEYS };
