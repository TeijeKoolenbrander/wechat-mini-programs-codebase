'use strict';
/**
 * Machine-readable backend inventory (spec 13): collections with indexes, cloud functions with timeouts and callers,
 * environment variables. The single source for js/api.js (names, timeouts), the security-rule tests and the drift
 * test that keeps cloudfunctions/CONTRACT.md honest (tests/contract-docs.test.js). Pure data.
 */

/**
 * Every collection is deny-all for clients (AC 57): rules `{read:false, write:false}`, EXCEPT `room_signals`, whose custom read rule is
 * `doc._openid == auth.openid` (a content-free doorbell, spec 3A.7, 13.4). Indexes are [{fields:[...], unique?}] in console order (the
 * backend README turns them into console steps).
 */
const COLLECTIONS = {
  chains: { indexes: [['openGId', 'state', 'lastActivityAt'], ['state', 'expiresAt'], ['participants'], ['createdAt'], ['state', 'createdAt'], ['roomId']] },
  steps: { indexes: [['author', 'createdAt'], ['chainId'], ['chainId', 'claimId'], ['state', 'mod.submittedAt']] },
  rooms: { indexes: [['openGId', 'state', 'lastActivityAt'], ['state', 'deadline'], ['state', 'lastActivityAt'], ['seats.openid', 'state'], ['createdAt']] },
  room_signals: { indexes: [['_openid', 'roomId'], ['roomId']], rules: { read: 'doc._openid == auth.openid', write: false } },
  mod_traces: { indexes: [] },
  mod_log: { indexes: [['stepId'], ['ts']] },
  mod_quota: { indexes: [] },
  reports: { indexes: [['state', 'createdAt'], ['stepId'], ['createdAt']] },
  players: { indexes: [['lastActiveAt'], ['flagged']] },
  group_members: { indexes: [['openGId', 'lastSeen'], ['openid']] },
  group_stats: { indexes: [['lastActivityAt']] },
  reactions: { indexes: [['createdAt']] },
  sub_grants: { indexes: [['used', 'chainId'], ['grantedAt']] },
  daily_stats: { indexes: [] },
  audit_log: { indexes: [['ts']] },
  events: { indexes: [['ts'], ['name', 'ts']] },
  rate_limits: { indexes: [['expireAt']] },
  app_config: { indexes: [] },
};

/**
 * Cloud functions (13.2). caller: 'client' (callFunction from the mini game), 'server' (timer or push, rejects any call that
 * carries an OPENID), 'console' (admin: console test invocation only, ADMIN_OPENIDS fallback). openapi = permissions in
 * config.json. timeoutSec = function.config.json timeout; the client waits `clientMs`. bank = the function loads the prompt bank
 * (server-only, TD-103): sync-core copies core/prompts.js and core/content/prompts.v*.js only into these.
 */
const GAME_SYNC = ['wxa.game.contentSpam.mediaCheckSync', 'wxa.game.contentSpam.msgSecCheck', 'security.msgSecCheck'];
const CARD = ['updatableMessage.setUpdatableMsg']; // the room card count / started state (9.5)
const FUNCTIONS = {
  getHome: { caller: 'client', timeoutSec: 5, clientMs: 8000 },
  agreeRules: { caller: 'client', timeoutSec: 5, clientMs: 8000 },
  joinGroup: { caller: 'client', timeoutSec: 5, clientMs: 8000 },
  rollPrompts: { caller: 'client', timeoutSec: 5, clientMs: 8000, bank: true },
  createChain: { caller: 'client', timeoutSec: 8, clientMs: 10000, openapi: GAME_SYNC, bank: true },
  getChain: { caller: 'client', timeoutSec: 5, clientMs: 8000, openapi: ['updatableMessage.createActivityId'] },
  claimStep: { caller: 'client', timeoutSec: 5, clientMs: 8000 },
  releaseClaim: { caller: 'client', timeoutSec: 5, clientMs: 8000 },
  submitStep: { caller: 'client', timeoutSec: 15, clientMs: 17000, openapi: GAME_SYNC.concat(['security.mediaCheckAsync', 'updatableMessage.setUpdatableMsg']) },
  createRoom: { caller: 'client', timeoutSec: 5, clientMs: 8000, openapi: CARD },
  joinRoom: { caller: 'client', timeoutSec: 5, clientMs: 8000, openapi: CARD, bank: true },
  leaveRoom: { caller: 'client', timeoutSec: 5, clientMs: 8000, openapi: CARD, bank: true },
  startRoom: { caller: 'client', timeoutSec: 8, clientMs: 10000, openapi: CARD, bank: true },
  getRoom: { caller: 'client', timeoutSec: 5, clientMs: 8000, openapi: ['updatableMessage.createActivityId'], bank: true },
  submitRoomStep: { caller: 'client', timeoutSec: 15, clientMs: 17000, openapi: GAME_SYNC, bank: true },
  roomTick: { caller: 'client', timeoutSec: 8, clientMs: 10000, bank: true },
  getRoomReveal: { caller: 'client', timeoutSec: 5, clientMs: 10000, bank: true },
  rematch: { caller: 'client', timeoutSec: 5, clientMs: 8000, openapi: CARD },
  onMediaCheck: { caller: 'server', timeoutSec: 5, openapi: ['updatableMessage.setUpdatableMsg'] },
  modSweeper: { caller: 'server', timeoutSec: 60, timer: '0 */5 * * * * *', openapi: ['security.mediaCheckAsync', 'subscribeMessage.send', 'updatableMessage.setUpdatableMsg'] },
  roomSweeper: { caller: 'server', timeoutSec: 60, timer: '0 */1 * * * * *', bank: true },
  getReveal: { caller: 'client', timeoutSec: 5, clientMs: 10000, bank: true },
  revealNow: { caller: 'client', timeoutSec: 5, clientMs: 8000, openapi: ['updatableMessage.setUpdatableMsg'] },
  laugh: { caller: 'client', timeoutSec: 5, clientMs: 8000 },
  report: { caller: 'client', timeoutSec: 5, clientMs: 8000 },
  getMyChains: { caller: 'client', timeoutSec: 5, clientMs: 8000 },
  getGroupChains: { caller: 'client', timeoutSec: 5, clientMs: 8000 },
  deleteMyStep: { caller: 'client', timeoutSec: 10, clientMs: 12000 },
  subscribeReveal: { caller: 'client', timeoutSec: 5, clientMs: 8000 },
  grantReward: { caller: 'client', timeoutSec: 5, clientMs: 8000 },
  admin: { caller: 'console', timeoutSec: 20, bank: true },
  track: { caller: 'client', timeoutSec: 5, clientMs: 6000 },
  cleanup: { caller: 'server', timeoutSec: 120, timer: '0 0 4 * * * *' },
};

/** functions that read or write user-generated content: all return SERVER_CONFIG when mock moderation is set in production (AC 51) */
const UGC_FUNCTIONS = ['createChain', 'getChain', 'claimStep', 'releaseClaim', 'submitStep', 'onMediaCheck', 'getReveal', 'revealNow', 'laugh', 'report',
  'getMyChains', 'getGroupChains', 'deleteMyStep', 'rollPrompts', 'createRoom', 'joinRoom', 'leaveRoom', 'startRoom', 'getRoom', 'submitRoomStep',
  'roomTick', 'getRoomReveal', 'rematch', 'roomSweeper'];

const CLIENT_FUNCTIONS = Object.keys(FUNCTIONS).filter((k) => FUNCTIONS[k].caller === 'client');

/** the files of core/ that only the `bank` functions (and the dev mock server) may carry (CTO ruling, TD-103) */
const BANK_FILES = ['prompts.js', 'content/prompts.v1.js', 'content/prompts.v2.js'];

/**
 * Report document id (TD-29 backend, QA-6 / TD-92): `<openid>_<chainId>_<stepId|teaser>`, one report per player per
 * item. The teaser texts (step 0) are ONE item per chain whatever they currently show, so a repeat teaser report is
 * DUP_REPORT and cannot hide a second sentence. A step report is keyed by the step document id, so a repeat report of
 * a step that is already hidden is DUP_REPORT too (checked before the step state). Worst case length: 28 (openid) + 1 +
 * 10 (chainId) + 1 + 15 (stepId) = 55 <= 64.
 */
function reportKey(openid, chainId, stepId) {
  return openid + '_' + chainId + '_' + (stepId ? stepId : 'teaser');
}

/** the signal document id of one seat (3A.7) */
function signalId(roomId, seat) {
  return roomId + '_' + seat;
}

/** environment variables (never committed; spec 13 and 6.6) */
const ENV_VARS = ['GROUP_REF_PEPPER', 'MODERATION_MODE', 'ENV_KIND', 'MOD_TEXT_DAILY_BUDGET', 'MOD_IMAGE_DAILY_BUDGET', 'MOCK_SYNC_DELAY_MS', 'MOCK_MEDIA_DELAY_SEC', 'ADMIN_OPENIDS', 'PUSH_TOKEN', 'PUSH_AES_KEY', 'TZ'];

/** admin ops (7.2) */
const ADMIN_OPS = ['listReports', 'getStep', 'sample', 'upholdReport', 'dismissReport', 'hideStep', 'restoreStep', 'removeChain', 'removeRoom', 'restrict', 'liftRestriction', 'setUgc', 'setModeration'];

/**
 * The shared test AppID's cloud environment is shared across apps, so EVERY physical collection name carries the app slug:
 * logical 'chains' is the collection `chuanhua_chains`. Code uses logical names through `collectionName()` (cloudfunctions
 * common/util.js `col()` does the same); rules, indexes and the console use the physical names.
 */
const COLLECTION_PREFIX = 'chuanhua_';
function collectionName(logical) {
  return COLLECTION_PREFIX + logical;
}
const PHYSICAL_COLLECTIONS = Object.keys(COLLECTIONS).map(collectionName);

/** the database security rules per physical collection: deny-all, except the custom read rule of room_signals (13.4) */
function denyAllRules() {
  const out = {};
  for (const c of Object.keys(COLLECTIONS)) out[collectionName(c)] = COLLECTIONS[c].rules ? Object.assign({}, COLLECTIONS[c].rules) : { read: false, write: false };
  return out;
}

module.exports = {
  reportKey, signalId, COLLECTION_PREFIX, collectionName, PHYSICAL_COLLECTIONS, COLLECTIONS, FUNCTIONS, UGC_FUNCTIONS, CLIENT_FUNCTIONS,
  BANK_FILES, ENV_VARS, ADMIN_OPS, denyAllRules,
};
