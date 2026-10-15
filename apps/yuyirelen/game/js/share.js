/**
 * Sharing and card entry (spec 8.5, 9, 9.1-9.3). [COMPLIANCE: 诱导分享]
 *
 *  - every share starts from an explicit tap or the capsule menu; nothing is shared
 *    automatically; NO share ever grants anything (no hints, steps, streak help)
 *  - no success callback is used (shareAppMessage documents none)
 *  - withShareTicket via wx.updateShareMenu({withShareTicket:true}), never together with
 *    isUpdatableMessage:false (iOS bug)
 *  - group context: wx.getGroupEnterInfo -> cloudID -> cloud function joinGroup.
 *    wx.getShareInfo is deprecated and never called
 *  - every result share is a CHALLENGE on the same puzzle: the query carries the id only
 *    ("c=<challengeId>"); if createChallenge fails the share proceeds with "p=<puzzleId>"
 *  - the card and the title NEVER contain a word (core/card.js takes numbers only)
 *
 * The share-card canvas (500x400) is drawn by frontend-ui; the hook is
 * `share.cardRenderer = (cardVm) => Promise<tempFilePath>`. On any failure the static
 * fallback image is used.
 */

const { shareTitle, MENU_TITLE } = require('../core/card');
const { parsePuzzleId, isChallengeId } = require('../core/schedule');

const FALLBACK_IMAGE = 'assets/share-fallback.png';

function parseQuery(q) {
  const out = {};
  if (!q) return out;
  if (typeof q === 'object') return Object.assign({}, q);
  String(q)
    .split('&')
    .forEach((kv) => {
      const i = kv.indexOf('=');
      if (i > 0) {
        try {
          out[decodeURIComponent(kv.slice(0, i))] = decodeURIComponent(kv.slice(i + 1));
        } catch (e) {
          out.__bad = '1';
        }
      }
    });
  return out;
}

/**
 * Entry routing (spec 9.3). options = wx.getEnterOptionsSync() shape: { scene, query, shareTicket, chatType }.
 * -> { kind: 'challenge'|'puzzle'|'menu'|'fallbackShare'|'none'|'malformed', challengeId?, puzzleId?,
 *      hasShareTicket, shareTicket, scene, chatType, join }
 * `join` = true when joinGroup should run (a ticket is present on a card entry).
 */
function parseEnter(options) {
  const o = options || {};
  const q = parseQuery(o.query);
  const hasTicket = !!o.shareTicket;
  const base = { hasShareTicket: hasTicket, shareTicket: o.shareTicket || null, scene: o.scene, chatType: o.chatType, join: false };
  if (q.__bad) return Object.assign(base, { kind: 'malformed' });
  if (q.wxad_fallback_share === '1') return Object.assign(base, { kind: 'fallbackShare' });
  if (q.c !== undefined) {
    if (!isChallengeId(q.c)) return Object.assign(base, { kind: 'malformed' });
    return Object.assign(base, { kind: 'challenge', challengeId: q.c, join: hasTicket });
  }
  if (q.p !== undefined) {
    if (!parsePuzzleId(q.p)) return Object.assign(base, { kind: 'malformed' });
    return Object.assign(base, { kind: 'puzzle', puzzleId: q.p, join: hasTicket });
  }
  if (q.s === 'm') return Object.assign(base, { kind: 'menu', join: hasTicket });
  if (Object.keys(q).length === 0) return Object.assign(base, { kind: hasTicket ? 'menu' : 'none', join: hasTicket });
  return Object.assign(base, { kind: 'malformed' });
}

function createShare(opts) {
  const { wx, api, analytics } = opts;
  const share = { cardRenderer: null, FALLBACK_IMAGE };

  async function cardImage(card) {
    if (share.cardRenderer) {
      try {
        const p = await share.cardRenderer(card);
        if (p) return p;
      } catch (e) {
        analytics.track('error', { where: 'share_card', code: 'render' });
      }
    }
    return FALLBACK_IMAGE;
  }

  /** Capsule menu: share is off by default in mini games. The menu card is generic (no result). */
  share.register = function () {
    if (wx.showShareMenu) wx.showShareMenu({ menus: ['shareAppMessage'] });
    if (wx.updateShareMenu) wx.updateShareMenu({ withShareTicket: true });
    if (wx.onShareAppMessage) {
      wx.onShareAppMessage(() => {
        analytics.track('share_tap', { kind: 'menu' });
        return { title: MENU_TITLE, query: 's=m', imageUrl: FALLBACK_IMAGE };
      });
    }
  };

  /**
   * Explicit tap on 分享成绩 (only offered after finishing).
   * r = { puzzleId, kind, issueNo, practiceNo, outcome, steps, hints, best, card }
   */
  share.shareResult = async function (r) {
    const title = shareTitle(r);
    const made = await api.createChallenge({ puzzleId: r.puzzleId });
    let query;
    if (made && made.ok && made.challengeId) {
      query = 'c=' + made.challengeId;
      analytics.track('challenge_created', { challengeId: made.challengeId, puzzleKind: r.kind });
    } else {
      query = 'p=' + r.puzzleId; // fallback: recipient lands on that puzzle, no comparison
    }
    const imageUrl = await cardImage(r.card);
    analytics.track('share_tap', { kind: 'result', puzzleKind: r.kind, steps: r.steps });
    wx.shareAppMessage({ title, imageUrl, query });
    return { ok: true, query, fallback: query.charAt(0) === 'p' };
  };

  /** Explicit tap on the board explainer's voluntary 分享到群. Grants nothing. */
  share.shareGroupInvite = function () {
    analytics.track('share_tap', { kind: 'group_invite' });
    wx.shareAppMessage({ title: MENU_TITLE, imageUrl: FALLBACK_IMAGE, query: 's=m' });
    return { ok: true, kind: 'group_invite' };
  };

  /** Group context for an entry with a shareTicket (9.2). Resolves { status: 'ok'|'failed', groupRef, errCode }. */
  share.enterGroup = function (entry) {
    const props = { scene: entry.scene, chatType: entry.chatType };
    const fail = (result, code) => {
      analytics.track('group_join', Object.assign({ result, errCode: code }, props));
      return { status: 'failed', groupRef: null, errCode: code };
    };
    return new Promise((resolve) => {
      if (!wx.getGroupEnterInfo) return resolve(fail('error', 'unsupported'));
      wx.getGroupEnterInfo({
        success: (info) => {
          if (!info || !info.cloudID) return resolve(fail('error', 'nocloudid'));
          api.joinGroup({ groupData: wx.cloud && wx.cloud.CloudID ? wx.cloud.CloudID(info.cloudID) : info.cloudID }).then((r) => {
            if (r && r.ok && r.groupRef) {
              analytics.track('group_join', Object.assign({ result: 'ok' }, props));
              resolve({ status: 'ok', groupRef: r.groupRef, errCode: undefined });
            } else {
              const code = r && r.code;
              const result = code === 40097 ? 'wrongScene' : code === 65206 ? 'leftGroup' : code === 'NOT_GROUP' ? 'notGroup' : 'error';
              resolve(fail(result, code));
            }
          });
        },
        fail: (e) => {
          const code = e && (e.errno || e.errCode);
          resolve(fail(code === 40097 ? 'wrongScene' : code === 65206 ? 'leftGroup' : 'error', code));
        },
      });
    });
  };

  return share;
}

module.exports = { createShare, parseEnter, parseQuery, FALLBACK_IMAGE };
