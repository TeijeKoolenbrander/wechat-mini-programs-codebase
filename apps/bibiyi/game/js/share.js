/**
 * Sharing and card entry (spec 7). [COMPLIANCE: 诱导分享]
 *
 *  - every share starts from an explicit tap or the capsule menu; nothing is
 *    shared automatically; NO share ever grants anything (AC 50, 51)
 *  - no success callback is used (shareAppMessage documents none)
 *  - `withShareTicket` via wx.updateShareMenu({withShareTicket:true}), never
 *    together with isUpdatableMessage:false (iOS bug)
 *  - group context: wx.getGroupEnterInfo -> cloudID -> cloud function
 *    joinGroup. wx.getShareInfo is deprecated and never called
 *  - daily cards never name a fact (spoilers); the free card names the
 *    missed pair without values (PO-27)
 *  - a challenge card's query carries the id only
 *
 * The share-card canvas (500x400) is drawn by frontend-ui; the hook is
 * `share.cardRenderer = (cardVm) => Promise<tempFilePath>`. On any failure the
 * static fallback image is used (AC 52).
 */

const FALLBACK_IMAGE = 'assets/share-fallback.png';

function dailyTitle(streak) {
  return '今日一比我连对 ' + streak + ' 个，你能比我多吗？';
}

/** miss = { bottomLabel, topLabel, hi } e.g. 黄河 / 长江 / 更长 -> "黄河和长江谁更长？我栽在这题了" */
function freeTitle(streak, miss) {
  if (miss && miss.bottomLabel && miss.topLabel) return miss.bottomLabel + '和' + miss.topLabel + '谁' + miss.hi + '？我栽在这题了';
  return '比一比：我连对了 ' + streak + ' 个，你能比我多吗？';
}

function challengeTitle(streak) {
  return '同一套题，我连对 ' + streak + '，你来试试？';
}

function resultQuery(mode, dateKey) {
  return 's=r&m=' + (mode === 'daily' ? 'daily' : 'free') + '&d=' + (dateKey || '');
}

function challengeQuery(id) {
  return 'c=' + id;
}

function parseQuery(q) {
  const out = {};
  if (!q) return out;
  if (typeof q === 'object') return Object.assign({}, q);
  String(q)
    .split('&')
    .forEach((kv) => {
      const i = kv.indexOf('=');
      if (i > 0) out[decodeURIComponent(kv.slice(0, i))] = decodeURIComponent(kv.slice(i + 1));
    });
  return out;
}

/**
 * Entry routing (spec 7). options = wx.getEnterOptionsSync() shape:
 * { scene, query, shareTicket, chatType }. Returns
 * { kind: 'challenge'|'result'|'fallbackShare'|'none'|'malformed', challengeId?, hasShareTicket, shareTicket, scene, chatType, join }
 * `join` = true when joinGroup should run (a ticket is present on an s=r or c= card).
 */
function parseEnter(options) {
  const o = options || {};
  const q = parseQuery(o.query);
  const hasTicket = !!o.shareTicket;
  const base = { hasShareTicket: hasTicket, shareTicket: o.shareTicket || null, scene: o.scene, chatType: o.chatType, join: false };
  if (q.wxad_fallback_share === '1') return Object.assign(base, { kind: 'fallbackShare' });
  if (q.c !== undefined) {
    if (!/^[0-9A-Za-z]{8}$/.test(q.c)) return Object.assign(base, { kind: 'malformed' });
    return Object.assign(base, { kind: 'challenge', challengeId: q.c, join: hasTicket });
  }
  if (q.s === 'r') return Object.assign(base, { kind: 'result', join: hasTicket });
  if (Object.keys(q).length === 0) return Object.assign(base, { kind: 'none' });
  return Object.assign(base, { kind: 'malformed' });
}

function createShare(opts) {
  const { wx, api, analytics } = opts;
  const share = { cardRenderer: null, FALLBACK_IMAGE };
  let ctxGetter = null;

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

  function titleFor(r, kind) {
    if (kind === 'challenge') return challengeTitle(r.streak);
    if (r.mode === 'daily') return dailyTitle(r.streak);
    return freeTitle(r.streak, r.miss);
  }

  /** Capsule menu: share is off by default in mini games. */
  share.register = function (getContext) {
    ctxGetter = getContext;
    if (wx.showShareMenu) wx.showShareMenu({ menus: ['shareAppMessage'] });
    if (wx.updateShareMenu) wx.updateShareMenu({ withShareTicket: true });
    if (wx.onShareAppMessage) {
      wx.onShareAppMessage(() => {
        const c = (ctxGetter && ctxGetter()) || {};
        analytics.track('share_tap', { kind: 'menu', mode: c.mode, streak: c.streak });
        if (c.streak !== undefined && c.mode) return { title: titleFor(c, 'result'), query: resultQuery(c.mode, c.dateKey), imageUrl: FALLBACK_IMAGE };
        return { title: '比一比：看上面的数，猜下面更多还是更少', query: 's=r&m=free&d=', imageUrl: FALLBACK_IMAGE };
      });
    }
  };

  /** Explicit tap: 分享. r = { mode, streak, dateKey, runId, miss?, card? } */
  share.shareResult = async function (r) {
    const imageUrl = await cardImage(r.card || r);
    analytics.track('share_tap', { runId: r.runId, kind: 'result', mode: r.mode, streak: r.streak });
    wx.shareAppMessage({ title: titleFor(r, 'result'), imageUrl, query: resultQuery(r.mode, r.dateKey) });
    return { ok: true, kind: 'result' };
  };

  /** Explicit tap: 发起挑战. Falls back to a plain result share if the id cannot be created (spec 7). */
  share.shareChallenge = async function (r) {
    const res = await api.createChallenge({ runId: r.runId });
    if (!res || !res.ok || !res.challengeId) {
      const out = await share.shareResult(r);
      return Object.assign(out, { fallback: true, toast: '挑战未能生成，已改为分享成绩' });
    }
    analytics.track('challenge_created', { challengeId: res.challengeId, kind: r.mode === 'daily' ? 'daily' : 'free', ownerStreak: r.streak });
    const imageUrl = await cardImage(r.card || r);
    analytics.track('share_tap', { runId: r.runId, kind: 'challenge', mode: r.mode, streak: r.streak });
    wx.shareAppMessage({ title: titleFor(r, 'challenge'), imageUrl, query: challengeQuery(res.challengeId) });
    return { ok: true, kind: 'challenge', challengeId: res.challengeId };
  };

  /** Explicit tap on the board explainer's voluntary 分享到本群. Grants nothing. */
  share.shareGroupInvite = function () {
    analytics.track('share_tap', { kind: 'group_invite' });
    wx.shareAppMessage({ title: '比一比：同一套题，来比比谁连对更多', imageUrl: FALLBACK_IMAGE, query: 's=r&m=free&d=' });
    return { ok: true, kind: 'group_invite' };
  };

  /**
   * Group context for an entry with a shareTicket. Resolves to
   * { status: 'ok'|'failed', groupRef, errCode }.
   */
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

module.exports = { createShare, parseEnter, parseQuery, dailyTitle, freeTitle, challengeTitle, resultQuery, challengeQuery, FALLBACK_IMAGE };
