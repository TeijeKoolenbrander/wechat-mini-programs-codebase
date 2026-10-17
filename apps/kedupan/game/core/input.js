/**
 * Input validation for every client-callable function (spec 11.2, AC 15, 28, 31, 79). Pure JS, shared by the
 * cloud functions and the mock server. Each validator returns {ok:true, v:<cleaned input>} or {ok:false, code:'INVALID_INPUT'}.
 * Unknown fields are dropped (whitelist), strings are length-capped, nothing is trusted.
 */

const { CONFIG } = require('./config');
const { isPos } = require('./score');

const DATE_KEY = /^\d{8}$/;
const ROUND_ID = /^[A-Z2-7]{8}$/;
const GROUP_REF = /^[0-9a-f]{16}$/;
const ITEM_ID = /^s\d{3}i\d{2}$/;
const SPECTRUM_ID = /^s\d{3}$/;
/** a cloudID is a URL-safe token (studio standard, same in every app): 8-512 characters of A-Za-z0-9_- */
const CLOUD_ID_RE = /^[A-Za-z0-9_-]{8,512}$/;
const REPORT_REASONS = ['unsuitable', 'ambiguous', 'typo'];
/** typed clue text kept for the rules: anything longer than this is cut (it is `length` long either way) */
const CLUE_INPUT_CAP = 200;

const BAD = { ok: false, code: 'INVALID_INPUT' };
const good = (v) => ({ ok: true, v });

function isDateKey(s) {
  if (typeof s !== 'string' || !DATE_KEY.test(s)) return false;
  const d = new Date(Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8)));
  return d.toISOString().slice(0, 10).replace(/-/g, '') === s;
}
function optGroupRef(x) {
  return x === undefined || x === null ? null : typeof x === 'string' && GROUP_REF.test(x) ? x : false;
}
function obj(e) {
  return e && typeof e === 'object' && !Array.isArray(e) ? e : {};
}

const V = {
  getDaily(e) {
    e = obj(e);
    const g = optGroupRef(e.groupRef);
    if (g === false) return BAD;
    if (e.dateKey !== undefined && !isDateKey(e.dateKey)) return BAD;
    return good({ groupRef: g, dateKey: e.dateKey || null });
  },
  submitCard(e) {
    e = obj(e);
    const g = optGroupRef(e.groupRef);
    if (g === false || !isDateKey(e.dateKey) || !Number.isInteger(e.idx) || e.idx < 0 || e.idx >= CONFIG.daily.cards || !isPos(e.pos)) return BAD;
    return good({ dateKey: e.dateKey, idx: e.idx, pos: e.pos, groupRef: g });
  },
  getArchive(e) {
    e = obj(e);
    if (e.before !== undefined && e.before !== null && !isDateKey(e.before)) return BAD;
    let limit = e.limit === undefined ? CONFIG.archive.pageMax : e.limit;
    if (!Number.isInteger(limit) || limit < 1) return BAD;
    limit = Math.min(limit, CONFIG.archive.pageMax);
    return good({ before: e.before || null, limit });
  },
  getArchiveDay(e) {
    e = obj(e);
    return isDateKey(e.dateKey) ? good({ dateKey: e.dateKey }) : BAD;
  },
  getBonusCard(e) {
    e = obj(e);
    let ex = [];
    if (e.exclude !== undefined) {
      if (!Array.isArray(e.exclude) || e.exclude.length > CONFIG.archive.bonusExcludeMax || !e.exclude.every((x) => typeof x === 'string' && ITEM_ID.test(x))) return BAD;
      ex = e.exclude.slice();
    }
    return good({ exclude: ex });
  },
  unlockDistribution(e) {
    e = obj(e);
    return isDateKey(e.dateKey) ? good({ dateKey: e.dateKey }) : BAD;
  },
  /**
   * The RAW cloudID string from wx.getGroupEnterInfo (M1). It is opaque to the client and is resolved on the server
   * (cloud.getOpenData). A decrypted-looking object (`groupData`, or an object as cloudID) is never accepted: the
   * platform only substitutes top-level wx.cloud.CloudID() values, and a plain object a modified client builds would
   * otherwise pass for decrypted data.
   */
  joinGroup(e) {
    e = obj(e);
    if (typeof e.cloudID !== 'string' || !CLOUD_ID_RE.test(e.cloudID)) return BAD;
    return good({ cloudID: e.cloudID });
  },
  getGroupDay(e) {
    e = obj(e);
    const g = optGroupRef(e.groupRef);
    if (!g || !isDateKey(e.dateKey)) return BAD;
    return good({ groupRef: g, dateKey: e.dateKey });
  },
  getFriendBoard(e) {
    e = obj(e);
    return isDateKey(e.dateKey) ? good({ dateKey: e.dateKey }) : BAD;
  },
  createRound(e) {
    e = obj(e);
    return typeof e.spectrumId === 'string' && SPECTRUM_ID.test(e.spectrumId) ? good({ spectrumId: e.spectrumId }) : BAD;
  },
  setClue(e) {
    e = obj(e);
    if (typeof e.roundId !== 'string' || !ROUND_ID.test(e.roundId)) return BAD;
    // D-2: 'chat' (我在群里说) is gone: INVALID_INPUT like any unknown mode. A preset ignores clueText, a typed clue ignores clueItemId.
    if (e.clueMode === 'preset' && typeof e.clueItemId === 'string' && ITEM_ID.test(e.clueItemId)) return good({ roundId: e.roundId, clueMode: 'preset', clueItemId: e.clueItemId, clueText: null });
    // the text is capped before any rule runs (core/clue.js answers `length` for anything over 12 characters)
    if (e.clueMode === 'text' && typeof e.clueText === 'string') return good({ roundId: e.roundId, clueMode: 'text', clueItemId: null, clueText: e.clueText.slice(0, CLUE_INPUT_CAP) });
    return BAD;
  },
  /** {rulesVersion} (the contract name) or {version} (the spec's name): the 发言规则 version the player agrees to */
  agreeRules(e) {
    e = obj(e);
    const v = e.rulesVersion !== undefined ? e.rulesVersion : e.version;
    return v === CONFIG.ugc.rulesVersion ? good({ rulesVersion: v }) : BAD;
  },
  /** {roundId, reason}: reason is one of the five (the legacy spelling 'ad' is read as 'ads') */
  reportClue(e) {
    e = obj(e);
    if (typeof e.roundId !== 'string' || !ROUND_ID.test(e.roundId)) return BAD;
    const reason = e.reason === 'ad' ? 'ads' : e.reason;
    if (typeof reason !== 'string' || CONFIG.ugc.reportReasons.indexOf(reason) < 0) return BAD;
    return good({ roundId: e.roundId, reason });
  },
  getRound(e) {
    e = obj(e);
    const g = optGroupRef(e.groupRef);
    if (g === false || typeof e.roundId !== 'string' || !ROUND_ID.test(e.roundId)) return BAD;
    // showAnswer: the viewer chooses 直接看答案 on a revealed round (L4); the server records that the reveal was served
    if (e.showAnswer !== undefined && typeof e.showAnswer !== 'boolean') return BAD;
    return good({ roundId: e.roundId, groupRef: g, showAnswer: e.showAnswer === true });
  },
  submitGuess(e) {
    e = obj(e);
    const g = optGroupRef(e.groupRef);
    if (g === false || typeof e.roundId !== 'string' || !ROUND_ID.test(e.roundId) || !isPos(e.pos)) return BAD;
    return good({ roundId: e.roundId, pos: e.pos, groupRef: g });
  },
  revealRound(e) {
    e = obj(e);
    return typeof e.roundId === 'string' && ROUND_ID.test(e.roundId) ? good({ roundId: e.roundId }) : BAD;
  },
  subscribeRound(e) {
    return V.revealRound(e);
  },
  reportCard(e) {
    e = obj(e);
    if (typeof e.itemId !== 'string' || !ITEM_ID.test(e.itemId) || REPORT_REASONS.indexOf(e.reason) < 0) return BAD;
    if (e.dateKey !== undefined && e.dateKey !== null && !isDateKey(e.dateKey)) return BAD;
    return good({ itemId: e.itemId, reason: e.reason, dateKey: e.dateKey || null });
  },
  track(e) {
    e = obj(e);
    if (!Array.isArray(e.events) || e.events.length === 0 || e.events.length > CONFIG.limits.trackBatchMax) return BAD;
    if (e.sessionId !== undefined && (typeof e.sessionId !== 'string' || e.sessionId.length > 64)) return BAD;
    return good({ sessionId: e.sessionId || null, events: e.events });
  },
};

module.exports = { V, isDateKey, REPORT_REASONS, ROUND_ID, GROUP_REF };
