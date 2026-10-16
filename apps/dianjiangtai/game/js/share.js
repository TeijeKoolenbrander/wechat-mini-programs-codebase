/**
 * Sharing and card entry (spec 8.4, 9, 9.2-9.4). [COMPLIANCE: 诱导分享]
 *
 *  - every share starts from an explicit tap or the capsule menu; nothing is
 *    shared automatically; NO share ever grants anything
 *  - no success callback is used (shareAppMessage documents none)
 *  - `withShareTicket` via wx.updateShareMenu({withShareTicket:true}), never
 *    together with isUpdatableMessage:false (iOS bug)
 *  - group context: wx.getGroupEnterInfo -> cloudID -> cloud function
 *    joinGroup. wx.getShareInfo is deprecated and never called (AC 35)
 *  - daily cards hide general names (D4); free-play cards show them
 *  - a challenge card's query carries the id only
 *
 * The share-card canvas (500x400) is drawn by frontend-ui; the hook is
 * `share.cardRenderer = (cardVm) => Promise<tempFilePath>`. On any failure
 * the static fallback image is used (AC 31).
 */

const { recordDigits } = require('./util');

const FALLBACK_IMAGE = 'assets/share-fallback.png';

function dailyTitle(record, variant) {
  if (variant === 'shiren') return '识人军令，我 ' + recordDigits(record) + '，你认得几员将？';
  return '我今日 ' + recordDigits(record) + '，同一手令牌，你敢来吗？';
}

/** names: [a, b] two generals from the lineup. */
function freeTitle(record, names) {
  const pair = names && names.length >= 2 ? names[0] + '+' + names[1] : '这套阵容';
  return pair + '才 ' + recordDigits(record) + '？不服来点将';
}

function challengeTitle(record) {
  return '同一手令牌，我 ' + recordDigits(record) + '，敢接战书吗？';
}

function resultQuery(mode, dateKey) {
  return 's=r&m=' + (mode === 'daily' ? 'daily' : 'free') + '&d=' + (dateKey || '');
}

function challengeQuery(id) {
  return 'c=' + id;
}

/** decodeURIComponent that never throws: a malformed escape (a lone %) keeps the raw text */
function safeDecode(x) {
  try {
    return decodeURIComponent(x);
  } catch (e) {
    return x;
  }
}

/**
 * Launch query -> plain object. The query comes from outside the game (a share card, a scanned code), so it never throws:
 * malformed escapes keep their raw text and anything unexpected yields what was parsed so far. __proto__ keys are skipped.
 */
function parseQuery(q) {
  const out = {};
  try {
    if (!q) return out;
    if (typeof q === 'object') {
      Object.keys(q).forEach((k) => {
        if (k !== '__proto__') out[k] = q[k];
      });
      return out;
    }
    String(q)
      .split('&')
      .forEach((kv) => {
        const i = kv.indexOf('=');
        if (i > 0) {
          const key = safeDecode(kv.slice(0, i));
          if (key !== '__proto__') out[key] = safeDecode(kv.slice(i + 1));
        }
      });
  } catch (e) {
    /* keep what was parsed */
  }
  return out;
}

/**
 * Entry routing (spec 9.4). options = wx.getEnterOptionsSync() shape:
 * { scene, query, shareTicket, chatType }. Returns
 * { kind: 'challenge'|'result'|'fallbackShare'|'none'|'malformed', challengeId?, hasShareTicket, shareTicket, scene, chatType, join }
 * `join` = true when joinGroup should run (a ticket is present on an s=r or c= card).
 */
function parseEnter(options) {
  const o = options && typeof options === 'object' ? options : {};
  const q = parseQuery(o.query);
  const hasTicket = !!o.shareTicket;
  const base = { hasShareTicket: hasTicket, shareTicket: o.shareTicket || null, scene: o.scene, chatType: o.chatType, join: false };
  if (q.wxad_fallback_share === '1') return Object.assign(base, { kind: 'fallbackShare' });
  if (q.c !== undefined) {
    if (typeof q.c !== 'string' || !/^[0-9A-Za-z]{8}$/.test(q.c)) return Object.assign(base, { kind: 'malformed' });
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

  /** Render the card to a temp file. opts.pixelScale 2 -> 1000 x 800 (save to album, 8.12). Resolves { path, fallback }. */
  async function cardFile(card, opts) {
    if (share.cardRenderer) {
      try {
        const p = await share.cardRenderer(card, opts);
        if (p) return { path: p, fallback: false };
      } catch (e) {
        analytics.track('error', { where: 'share_card', code: 'render' });
      }
    }
    return { path: FALLBACK_IMAGE, fallback: true };
  }
  share.cardFile = cardFile;

  async function cardImage(card) {
    return (await cardFile(card)).path;
  }

  function titleFor(r, kind) {
    if (kind === 'challenge') return challengeTitle(r.record);
    if (r.mode === 'daily') return dailyTitle(r.record, r.variant);
    return freeTitle(r.record, r.shareNames);
  }

  /** Capsule menu: share is off by default in mini games. */
  share.register = function (getContext) {
    ctxGetter = getContext;
    if (wx.showShareMenu) wx.showShareMenu({ menus: ['shareAppMessage'] });
    if (wx.updateShareMenu) wx.updateShareMenu({ withShareTicket: true });
    if (wx.onShareAppMessage) {
      wx.onShareAppMessage(() => {
        const c = (ctxGetter && ctxGetter()) || {};
        analytics.track('share_tap', { kind: 'menu', mode: c.mode, wins: c.record ? c.record.w : undefined });
        if (c.record) return { title: titleFor(c, 'result'), query: resultQuery(c.mode, c.dateKey), imageUrl: FALLBACK_IMAGE };
        return { title: '点将台：同一手令牌，谁能一统天下？', query: 's=r&m=free&d=', imageUrl: FALLBACK_IMAGE };
      });
    }
  };

  /** Explicit tap: 分享战报. r = { mode, record, dateKey, runId, card?, shareNames? } */
  share.shareResult = async function (r) {
    const imageUrl = await cardImage(r.card || r);
    analytics.track('share_tap', { runId: r.runId, kind: 'result', mode: r.mode, wins: r.record.w });
    wx.shareAppMessage({ title: titleFor(r, 'result'), imageUrl, query: resultQuery(r.mode, r.dateKey) });
    return { ok: true, kind: 'result' };
  };

  /** Explicit tap: 发起挑战. Falls back to a plain result share if the id cannot be created (9.3 step 6). */
  share.shareChallenge = async function (r) {
    const res = await api.createChallenge({ runId: r.runId });
    if (!res || !res.ok || !res.challengeId) {
      const out = await share.shareResult(r);
      return Object.assign(out, { fallback: true, toast: '战书未能生成，已改为分享战报' });
    }
    analytics.track('challenge_created', { challengeId: res.challengeId, mode: r.mode, wins: r.record.w });
    const imageUrl = await cardImage(r.card || r);
    analytics.track('share_tap', { runId: r.runId, kind: 'challenge', mode: r.mode, wins: r.record.w });
    wx.shareAppMessage({ title: titleFor(r, 'challenge'), imageUrl, query: challengeQuery(res.challengeId) });
    return { ok: true, kind: 'challenge', challengeId: res.challengeId };
  };

  /** Explicit tap on the board explainer's voluntary 分享到群. Grants nothing. */
  share.shareGroupInvite = function () {
    analytics.track('share_tap', { kind: 'group_invite' });
    wx.shareAppMessage({ title: '点将台：同一手令牌，来比比谁能一统天下', imageUrl: FALLBACK_IMAGE, query: 's=r&m=free&d=' });
    return { ok: true, kind: 'group_invite' };
  };

  /**
   * Group context for an entry with a shareTicket (9.2). Resolves to
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
          if (!info || typeof info.cloudID !== 'string' || !info.cloudID) return resolve(fail('error', 'nocloudid'));
          // the RAW cloudID string only (M1): the server resolves it with cloud.getOpenData, so the openGId can never be client-shaped
          api.joinGroup({ cloudID: info.cloudID }).then((r) => {
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
