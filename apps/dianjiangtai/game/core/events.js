'use strict';
/**
 * Analytics event catalogue (spec §15): the ONE list of client-sendable events and the props each may carry (security
 * hardening L2). The `track` cloud function validates every batch against it: unknown events are dropped, unknown prop keys
 * are dropped, and values of the wrong type or outside their enum are dropped, so a modified client cannot write arbitrary
 * documents or free text into the `events` collection. Pure; the tests check it against the events the shipped client sends.
 *
 * Prop type specs:
 *   'bool'                   boolean
 *   ['int', min, max]        integer in [min, max]
 *   ['enum', a, b, ...]      one of the listed strings
 *   'tag'                    short identifier-like string (<= 40 of [A-Za-z0-9_.:-])
 *   'text'                   short display-ish string (<= 80, control characters removed)
 *   'code'                   error code: integer, or a 'text'
 *   'runId' 'challengeId' 'generalId' 'dateKey'   the same shapes the cloud functions validate
 *   'texts'                  array (<= 12) of 'text'
 * Server-only events (daily_gen, board_list, anomaly_daily) are NOT in the catalogue.
 */

const RUN_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
const CHALLENGE_ID_RE = /^[A-Z2-7]{8}$/;
const GENERAL_ID_RE = /^g_[a-z0-9_]{1,40}$/;
const DATE_KEY_RE = /^\d{8}$/;
const TAG_RE = /^[A-Za-z0-9_.:-]{1,40}$/;

const MODE = ['enum', 'daily', 'free', 'challenge'];
const VARIANT = ['enum', 'standard', 'shiren'];
const PLACEMENT = ['enum', 'respin', 'replay', 'interstitial', 'banner'];
const WINS = ['int', 0, 12];

/** props every event may carry (analytics.js adds them to every event; sessionId is handled by track itself) */
const COMMON = {
  isNewUser: 'bool',
  contentVersion: ['int', 0, 100000],
  appVersion: 'tag',
  platform: 'tag',
};

const CATALOGUE = {
  session_start: { scene: ['int', 0, 100000], fromCard: ['enum', 'none', 'result', 'challenge'], hasShareTicket: 'bool', challengeId: 'challengeId' },
  card_open: { cardKind: ['enum', 'result', 'challenge'], hasShareTicket: 'bool', challengeId: 'challengeId' },
  run_start: { runId: 'runId', mode: MODE, source: 'tag', variant: VARIANT },
  round_fetch: { runId: 'runId', round: ['int', 1, 5], result: ['enum', 'ok', 'timeout', 'offline', 'invalid'], ms: ['int', 0, 3600000] },
  respin: { runId: 'runId', round: ['int', 1, 5], dim: ['enum', 'faction', 'era'], src: ['enum', 'free', 'ad'] },
  draft_pick: {
    runId: 'runId', round: ['int', 1, 5], generalId: 'generalId', slot: 'tag', fit: ['enum', 'good', 'ok', 'bad'], pickFaction: 'text',
    poolSize: ['int', 0, 100], poolTotal: ['int', 0, 1000],
  },
  draft_undo: { runId: 'runId', round: ['int', 1, 5] },
  run_complete: {
    runId: 'runId', mode: MODE, wins: WINS, durationMs: ['int', 0, 86400000], respinsFree: ['int', 0, 10], respinsAd: ['int', 0, 10],
    events: 'texts', variant: VARIANT, multiAppearancePicks: ['int', 0, 5],
  },
  run_abandon: { runId: 'runId', mode: MODE, round: ['int', 0, 5] },
  reveal_skip: { runId: 'runId', atBattle: ['int', 0, 12] },
  shiren_reveal: { runId: 'runId', skipped: 'bool' },
  share_tap: { runId: 'runId', kind: ['enum', 'result', 'challenge', 'group_invite', 'menu'], mode: MODE, wins: WINS },
  challenge_created: { challengeId: 'challengeId', mode: MODE, wins: WINS },
  challenge_answered: { challengeId: 'challengeId', myWins: WINS, theirWins: WINS, countsAsDaily: 'bool' },
  board_view: { kind: ['enum', 'group', 'friend'], state: 'tag', mode: 'tag' },
  group_join: {
    result: ['enum', 'ok', 'wrongScene', 'leftGroup', 'notGroup', 'error'], errCode: 'code', scene: ['int', 0, 100000], chatType: ['int', -1, 100],
  },
  privacy_result: { trigger: 'tag', result: 'tag' },
  friend_scope_result: { result: 'tag', via: 'tag' },
  board_write: { dateKey: 'dateKey', result: 'tag', w: WINS },
  streak_shown: { current: ['int', 0, 100000], where: 'tag' },
  history_view: { items: ['int', 0, 1000], state: 'tag' },
  history_issue_view: { dateKey: 'dateKey', hasMine: 'bool', bestShown: 'bool' },
  save_image: { mode: 'tag', result: 'tag', errCode: 'code' },
  subscribe_offer: { where: 'tag' },
  subscribe_result: { result: 'tag', errCode: 'code' },
  display_setting: { largeText: 'bool', highContrast: 'bool', source: 'tag' },
  ad_request: { placement: PLACEMENT, stub: 'bool' },
  ad_show: { placement: PLACEMENT, stub: 'bool' },
  ad_reward: { placement: PLACEMENT, stub: 'bool' },
  ad_close_early: { placement: PLACEMENT, stub: 'bool' },
  ad_error: { placement: PLACEMENT, stub: 'bool', errCode: 'code' },
  interstitial_show: { runsThisSession: ['int', 0, 100000] },
  error: { where: 'text', code: 'code' },
};

const EVENT_NAMES = Object.keys(CATALOGUE);
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

function text(x) {
  if (typeof x !== 'string') return undefined;
  // eslint-disable-next-line no-control-regex
  return x.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 80);
}

/** validate one value against its spec; returns the normalised value or undefined (= drop) */
function checkValue(spec, x) {
  if (Array.isArray(spec)) {
    if (spec[0] === 'enum') return typeof x === 'string' && spec.indexOf(x, 1) > 0 ? x : undefined;
    if (spec[0] === 'int') return Number.isInteger(x) && x >= spec[1] && x <= spec[2] ? x : undefined;
    return undefined;
  }
  switch (spec) {
    case 'bool': return typeof x === 'boolean' ? x : undefined;
    case 'tag': return typeof x === 'string' && TAG_RE.test(x) ? x : undefined;
    case 'text': return text(x);
    case 'code': return Number.isInteger(x) && Math.abs(x) <= 1e12 ? x : text(x);
    case 'runId': return typeof x === 'string' && RUN_ID_RE.test(x) ? x : undefined;
    case 'challengeId': return typeof x === 'string' && CHALLENGE_ID_RE.test(x) ? x : undefined;
    case 'generalId': return typeof x === 'string' && GENERAL_ID_RE.test(x) ? x : undefined;
    case 'dateKey': return typeof x === 'string' && DATE_KEY_RE.test(x) ? x : undefined;
    case 'texts': {
      if (!Array.isArray(x)) return undefined;
      const ok = x.slice(0, 12).map(text).filter((t) => t !== undefined && t !== '');
      return ok;
    }
    default: return undefined;
  }
}

/**
 * Props of `name` reduced to the catalogue: only declared keys (plus the common ones), each type/enum checked, everything
 * else dropped (prototype keys included). Returns null for an event name that is not in the catalogue. Never throws.
 */
function cleanProps(name, props) {
  if (typeof name !== 'string' || !has(CATALOGUE, name)) return null;
  const spec = CATALOGUE[name];
  const out = {};
  if (!props || typeof props !== 'object' || Array.isArray(props)) return out;
  const keys = Object.keys(props);
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    const s = has(spec, k) ? spec[k] : has(COMMON, k) ? COMMON[k] : null;
    if (!s) continue;
    const val = checkValue(s, props[k]);
    if (val !== undefined) out[k] = val;
  }
  return out;
}

module.exports = { CATALOGUE, COMMON, EVENT_NAMES, cleanProps, checkValue };
