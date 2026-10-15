/**
 * Sharing and card entry (spec 9). [COMPLIANCE: 诱导分享]
 *
 *  - every share starts from an explicit tap or the capsule menu; nothing is shared automatically;
 *    NO share ever grants anything (starts, colours, 棒, reveals ...)
 *  - no success callback is used (shareAppMessage documents none); the UI never depends on the result
 *  - `withShareTicket` via wx.updateShareMenu({withShareTicket:true}), never with isUpdatableMessage:false (iOS bug)
 *  - group context: wx.getGroupEnterInfo -> cloudID -> cloud function joinGroup. wx.getShareInfo is never called
 *  - card queries carry ids only: `k=<chainId>` (invite) or `r=<chainId>` (reveal)
 *  - share IMAGES never contain user drawings (PO-24): the invite card has no prompt, no drawing, no sentence;
 *    the reveal card has only the prompt and the final sentence (already passed text)
 *  - updatable invite card (9.4): the fixed template "成员正在加入，当前 n/6 人", n = passed 棒; static fallback
 *    when features.updatableCard is false or the call throws
 *
 * The card canvases (500 x 400) are drawn by frontend-ui; the hook is `share.cardRenderer = (cardVm) =>
 * Promise<tempFilePath>`. On any failure the static fallback image is used.
 */

const FALLBACK_IMAGE = 'assets/share-fallback.png';
const ID_RE = /^[0-9A-Za-z]{10}$/;

/** '第 4 棒等你接，看看你能猜出什么？' / '第 3 棒等你接，你来画画看？' */
function inviteTitle(nextStep, nextKind) {
  return nextKind === 'draw' ? '第 ' + nextStep + ' 棒等你接，你来画画看？' : '第 ' + nextStep + ' 棒等你接，看看你能猜出什么？';
}

/** '「月亮吃月饼」传了 6 棒，变成了「外星人在吃披萨」'; falls back when a text is hidden (edge 28). */
function revealTitle(promptText, finalText, passed) {
  if (!promptText) return '一条接龙揭晓了，看看变成了什么';
  if (!finalText) return '「' + promptText + '」传了 ' + passed + ' 棒，看看变成了什么';
  return '「' + promptText + '」传了 ' + passed + ' 棒，变成了「' + finalText + '」';
}

/** Content-free card data for the invite image (AC 95). */
function inviteCardVm(o) {
  return { kind: 'invite', passed: o.passed, length: 6, nextStep: o.nextStep, nextKind: o.nextKind };
}

/** Reveal card data: the two passed texts only, never a drawing (AC 95). */
function revealCardVm(o) {
  return { kind: 'reveal', promptText: o.promptText || '', finalText: o.finalText || '', passed: o.passed, participantCount: o.participantCount || 0 };
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
 * Entry routing (spec 9.5). options = wx.getEnterOptionsSync() shape { scene, query, shareTicket, chatType }.
 * Returns { kind: 'invite'|'reveal'|'fallbackShare'|'none'|'malformed', chainId?, hasShareTicket, shareTicket, scene, chatType, join }
 * `join` = true when joinGroup should run (a ticket is present on a k= or r= card).
 */
function parseEnter(options) {
  const o = options || {};
  const q = parseQuery(o.query);
  const hasTicket = !!o.shareTicket;
  const base = { hasShareTicket: hasTicket, shareTicket: o.shareTicket || null, scene: o.scene, chatType: o.chatType, join: false };
  if (q.wxad_fallback_share === '1') return Object.assign(base, { kind: 'fallbackShare' });
  if (q.k !== undefined) {
    if (!ID_RE.test(q.k)) return Object.assign(base, { kind: 'malformed' });
    return Object.assign(base, { kind: 'invite', chainId: q.k, join: hasTicket });
  }
  if (q.r !== undefined) {
    if (!ID_RE.test(q.r)) return Object.assign(base, { kind: 'malformed' });
    return Object.assign(base, { kind: 'reveal', chainId: q.r, join: hasTicket });
  }
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

  /**
   * Capsule menu: sharing is off by default in mini games. `getContext()` returns what the player is looking at:
   *   { kind: 'invite', chainId, passed, nextStep, nextKind } | { kind: 'reveal', chainId, promptText, finalText, passed } | null
   */
  share.register = function (getContext) {
    ctxGetter = getContext;
    if (wx.showShareMenu) wx.showShareMenu({ menus: ['shareAppMessage'] });
    if (wx.updateShareMenu) wx.updateShareMenu({ withShareTicket: true });
    if (wx.onShareAppMessage) {
      wx.onShareAppMessage(() => {
        const c = (ctxGetter && ctxGetter()) || null;
        if (c && c.kind === 'invite') {
          analytics.track('share_tap', { kind: 'menu', chainState: 'open', step: c.nextStep });
          return { title: inviteTitle(c.nextStep, c.nextKind), query: 'k=' + c.chainId, imageUrl: FALLBACK_IMAGE };
        }
        if (c && c.kind === 'reveal') {
          analytics.track('share_tap', { kind: 'menu', chainState: 'revealed' });
          return { title: revealTitle(c.promptText, c.finalText, c.passed), query: 'r=' + c.chainId, imageUrl: FALLBACK_IMAGE };
        }
        analytics.track('share_tap', { kind: 'menu', chainState: 'none' });
        return { title: '传画接龙：看上一棒，画出来或猜出来', query: '', imageUrl: FALLBACK_IMAGE };
      });
    }
  };

  /** Explicit tap: 发到群里接龙. c = { chainId, passed, nextStep, nextKind, activityId?, updatable:boolean } */
  share.shareInvite = async function (c) {
    const imageUrl = await cardImage(inviteCardVm(c));
    analytics.track('share_tap', { kind: 'invite', chainState: 'open', step: c.nextStep });
    let updatable = false;
    if (c.updatable && c.activityId && wx.updateShareMenu) {
      try {
        wx.updateShareMenu({
          withShareTicket: true,
          isUpdatableMessage: true,
          activityId: c.activityId,
          templateInfo: { parameterList: [{ name: 'member_count', value: String(c.passed) }, { name: 'room_limit', value: '6' }] },
        });
        updatable = true;
      } catch (e) {
        analytics.track('error', { where: 'share_update', code: 'throw' });
      }
    }
    wx.shareAppMessage({ title: inviteTitle(c.nextStep, c.nextKind), imageUrl, query: 'k=' + c.chainId });
    return { ok: true, kind: 'invite', updatable };
  };

  /** Explicit tap: 分享揭晓卡. */
  share.shareReveal = async function (c) {
    const imageUrl = await cardImage(revealCardVm(c));
    analytics.track('share_tap', { kind: 'reveal', chainState: 'revealed' });
    wx.shareAppMessage({ title: revealTitle(c.promptText, c.finalText, c.passed), imageUrl, query: 'r=' + c.chainId });
    return { ok: true, kind: 'reveal' };
  };

  /**
   * Group context for an entry with a shareTicket (9.2). Resolves to { status: 'ok'|'failed', groupRef, errCode }.
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

module.exports = { createShare, parseEnter, parseQuery, inviteTitle, revealTitle, inviteCardVm, revealCardVm, FALLBACK_IMAGE };
