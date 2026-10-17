/**
 * Sharing, card entry and group binding (spec 9, AC 92-97) [COMPLIANCE: 诱导分享].
 *
 *  - every share starts from an explicit tap (wx.shareAppMessage) or the capsule menu (wx.onShareAppMessage); nothing is shared
 *    automatically; NO share ever grants anything; the UI never depends on whether a share happened (no callback is used)
 *  - `withShareTicket` via wx.updateShareMenu({withShareTicket:true}); never isUpdatableMessage:false (iOS bug, P0 4)
 *  - queries carry ids only: `m=<roomId>` (room invite / room reveal), `k=<chainId>` (慢慢传 invite) or `r=<chainId>` (慢慢传 reveal). Never text, openids or group ids
 *  - share images never contain user drawings (PO-24): the invite card has our art + progress, the reveal card the two passed
 *    texts. The card canvas is drawn by frontend-ui (`share.cardRenderer`); on any failure the static fallback is used
 *  - the updatable invite card (9.4, V7) is used only when features.updatableCard is on; otherwise static cards
 *  - group context: wx.getGroupEnterInfo -> cloudID -> joinGroup (the server decrypts and returns an opaque groupRef). This is
 *    the documented 小游戏 API (developers.weixin.qq.com/minigame/dev/api/open-api/group/wx.getGroupEnterInfo.html, base library
 *    2.10.4, group message cards 2.17.3); wx.getShareInfo is deprecated since 2.17.3 and is called ONLY as a fallback when
 *    getGroupEnterInfo does not exist on a very old client AND the entry carries a shareTicket (TD-80)
 */

const copy = require('../core/copy');

const FALLBACK_IMAGE = 'assets/share-fallback.png';
const ID_RE = /^[A-Za-z0-9]{10}$/;
const GENERIC_TITLE = '传画接龙：看上一棒，画出来或猜出来';
const ROOM_INVITE_TITLE = '来一局传画接龙吗？画得丑没关系';
const ROOM_FALLBACK_IMAGE = 'assets/share-fallback-room.png';

const inviteQuery = (chainId) => 'k=' + chainId;
const revealQuery = (chainId) => 'r=' + chainId;
const roomQuery = (roomId) => 'm=' + roomId;

/** launch-query parsing is untrusted input (a crafted card/link): it never throws, a bad query is `{__bad:'1'}` (malformed) */
function parseQuery(q) {
  try {
    return parseQueryUnsafe(q);
  } catch (e) {
    return { __bad: '1' };
  }
}
function parseQueryUnsafe(q) {
  const out = {};
  if (!q) return out;
  if (typeof q === 'object') {
    Object.keys(q).forEach((k) => {
      out[k] = String(q[k]);
    });
    return out;
  }
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
 * Entry routing (spec 9.5). options = wx.getEnterOptionsSync() shape: { scene, query, shareTicket, chatType }. Returns
 * { kind: 'room'|'invite'|'reveal'|'fallbackShare'|'none'|'malformed', roomId?, chainId?, fromCard, hasShareTicket, shareTicket, scene, chatType, join }
 * `join` = true when joinGroup should run (a ticket is present on a k= or r= card). Unknown extra keys are ignored.
 */
function parseEnter(options) {
  const o = options || {};
  const q = parseQuery(o.query);
  const hasTicket = !!o.shareTicket;
  const base = { hasShareTicket: hasTicket, shareTicket: o.shareTicket || null, scene: o.scene, chatType: o.chatType, join: false, fromCard: 'none' };
  if (q.__bad) return Object.assign(base, { kind: 'malformed' });
  if (q.wxad_fallback_share === '1') return Object.assign(base, { kind: 'fallbackShare' });
  if (q.m !== undefined) {
    if (!ID_RE.test(q.m)) return Object.assign(base, { kind: 'malformed' });
    return Object.assign(base, { kind: 'room', roomId: q.m, join: hasTicket, fromCard: 'room' });
  }
  if (q.k !== undefined) {
    if (!ID_RE.test(q.k)) return Object.assign(base, { kind: 'malformed' });
    return Object.assign(base, { kind: 'invite', chainId: q.k, join: hasTicket, fromCard: 'invite' });
  }
  if (q.r !== undefined) {
    if (!ID_RE.test(q.r)) return Object.assign(base, { kind: 'malformed' });
    // scene 1014 = a subscribe-message (service notice) launch
    return Object.assign(base, { kind: 'reveal', chainId: q.r, join: hasTicket, fromCard: o.scene === 1014 ? 'notice' : 'reveal' });
  }
  if (Object.keys(q).length === 0) return Object.assign(base, { kind: 'none' });
  return Object.assign(base, { kind: 'malformed' });
}

function createShare(opts) {
  const { wx, api, analytics } = opts;
  const share = { cardRenderer: null, FALLBACK_IMAGE };
  let ctxGetter = null;

  /** Render the card to a temp file. Resolves { path, fallback }. */
  async function cardFile(card, fallback) {
    if (share.cardRenderer) {
      try {
        const p = await share.cardRenderer(card, {});
        if (p) return { path: p, fallback: false };
      } catch (e) {
        analytics.track('error', { where: 'share_card', code: 'render' });
      }
    }
    return { path: fallback || FALLBACK_IMAGE, fallback: true };
  }
  share.cardFile = cardFile;

  /** titles + queries for a context from the capsule menu or a tap (pure, no side effects) */
  share.descriptorFor = function (c) {
    if (c && c.kind === 'roomInvite' && c.roomId) return { title: ROOM_INVITE_TITLE, query: roomQuery(c.roomId), card: { kind: 'roomInvite' }, fallback: ROOM_FALLBACK_IMAGE };
    if (c && c.kind === 'roomReveal' && c.roomId) {
      const title = c.promptText && c.finalText ? '我们这一局，「' + c.promptText + '」传成了「' + c.finalText + '」' : '我们这一局传了 ' + (c.chainCount || 0) + ' 条接龙，来看看变成了什么';
      const card = { kind: 'roomReveal', chainCount: c.chainCount || 0 };
      if (c.promptText && c.finalText) {
        card.promptText = c.promptText;
        card.finalText = c.finalText;
      }
      return { title, query: roomQuery(c.roomId), card, fallback: ROOM_FALLBACK_IMAGE };
    }
    if (c && c.kind === 'reveal' && c.chainId) {
      return { title: copy.revealShareTitle(c.promptText, c.finalText, c.passed || 6), query: revealQuery(c.chainId), card: { kind: 'reveal', promptText: c.promptText || '', finalText: c.finalText || '', participantCount: c.participantCount || 0 } };
    }
    if (c && c.kind === 'invite' && c.chainId && c.nextStep) {
      return { title: copy.inviteShareTitle(c.nextKind, c.nextStep), query: inviteQuery(c.chainId), card: { kind: 'invite', passed: c.passed || 0, length: 6 } };
    }
    return { title: GENERIC_TITLE, query: '', card: null };
  };

  /** Capsule menu: share is off by default in mini games. The menu card uses the static image (the callback is synchronous). */
  share.register = function (getContext) {
    ctxGetter = getContext;
    if (wx.showShareMenu) wx.showShareMenu({ menus: ['shareAppMessage'] });
    if (wx.updateShareMenu) wx.updateShareMenu({ withShareTicket: true });
    if (wx.onShareAppMessage) {
      wx.onShareAppMessage(() => {
        const c = (ctxGetter && ctxGetter()) || null;
        const d = share.descriptorFor(c);
        analytics.track('share_tap', { kind: 'menu', chainState: (c && c.chainState) || undefined, step: (c && c.nextStep) || undefined });
        return { title: d.title, query: d.query, imageUrl: d.fallback || FALLBACK_IMAGE };
      });
    }
  };

  /** Re-assert the share menu (withShareTicket only; optionally the updatable form of 9.4). */
  share.setMenu = function (updatable) {
    if (!wx.updateShareMenu) return Promise.resolve(false);
    return new Promise((resolve) => {
      const arg = { withShareTicket: true };
      if (updatable && updatable.activityId) {
        arg.isUpdatableMessage = true;
        arg.activityId = updatable.activityId;
        arg.templateInfo = { parameterList: [{ name: 'member_count', value: String(updatable.passed) }, { name: 'room_limit', value: String(updatable.limit || 6) }] };
      }
      arg.success = () => resolve(true);
      arg.fail = () => resolve(false);
      try {
        wx.updateShareMenu(arg);
      } catch (e) {
        resolve(false);
      }
    });
  };

  /**
   * Explicit tap: 发到群里接龙. c = { chainId, passed, nextStep, nextKind, activityId?, chainState? }. Resolves { ok, updatable }.
   * The card image is rendered first (async), then the share dialog opens.
   */
  share.shareInvite = async function (c) {
    const d = share.descriptorFor(Object.assign({ kind: 'invite' }, c));
    const file = await cardFile(d.card);
    let updatable = false;
    if (c.activityId) updatable = await share.setMenu({ activityId: c.activityId, passed: c.passed });
    analytics.track('share_tap', { kind: 'invite', chainState: c.chainState, step: c.nextStep });
    wx.shareAppMessage({ title: d.title, imageUrl: file.path, query: d.query });
    return { ok: true, kind: 'invite', updatable, fallbackImage: file.fallback };
  };

  /** Explicit tap: 邀请群友 (lobby) or the capsule menu during a game. c = { roomId, joined, activityId? }. Resolves { ok, updatable }. */
  share.shareRoomInvite = async function (c) {
    const d = share.descriptorFor({ kind: 'roomInvite', roomId: c.roomId });
    const file = await cardFile(d.card, d.fallback);
    let updatable = false;
    if (c.activityId) updatable = await share.setMenu({ activityId: c.activityId, passed: c.joined || 1, limit: 10 });
    analytics.track('share_tap', { kind: 'room' });
    wx.shareAppMessage({ title: d.title, imageUrl: file.path, query: d.query });
    return { ok: true, kind: 'room', updatable, fallbackImage: file.fallback };
  };

  /** Explicit tap: 分享揭晓卡 of a room (overview). c = { roomId, chainCount, promptText?, finalText? }. */
  share.shareRoomReveal = async function (c) {
    const d = share.descriptorFor(Object.assign({ kind: 'roomReveal' }, c));
    const file = await cardFile(d.card, d.fallback);
    analytics.track('share_tap', { kind: 'reveal', chainState: 'revealed' });
    wx.shareAppMessage({ title: d.title, imageUrl: file.path, query: d.query });
    return { ok: true, kind: 'reveal', fallbackImage: file.fallback };
  };

  /** Explicit tap: 分享揭晓卡. c = { chainId, promptText, finalText, passed, participantCount }. */
  share.shareReveal = async function (c) {
    const d = share.descriptorFor(Object.assign({ kind: 'reveal' }, c));
    const file = await cardFile(d.card);
    analytics.track('share_tap', { kind: 'reveal', chainState: 'revealed' });
    wx.shareAppMessage({ title: d.title, imageUrl: file.path, query: d.query });
    return { ok: true, kind: 'reveal', fallbackImage: file.fallback };
  };

  /**
   * Group context for an entry with a shareTicket (9.2). Resolves { status: 'ok'|'failed', groupRef, errCode }.
   * `ctx.privacy` (optional) lets one "privacy not agreed" (errno 104) failure be retried after the official popup.
   */
  share.enterGroup = function (entry, ctx) {
    const props = { scene: entry.scene, chatType: entry.chatType };
    const fail = (result, code) => {
      analytics.track('group_join', Object.assign({ result, errCode: code }, props));
      return { status: 'failed', groupRef: null, errCode: code };
    };
    const attempt = (retried) =>
      new Promise((resolve) => {
        const viaTicket = !wx.getGroupEnterInfo && !!wx.getShareInfo && !!entry.shareTicket; // old base library only
        if (!wx.getGroupEnterInfo && !viaTicket) return resolve(fail('error', 'unsupported'));
        try {
          (viaTicket ? (o) => wx.getShareInfo(Object.assign({ shareTicket: entry.shareTicket }, o)) : wx.getGroupEnterInfo.bind(wx))({
            success: (info) => {
              if (!info || typeof info.cloudID !== 'string' || !info.cloudID) return resolve(fail('error', 'nocloudid'));
              // M1 (TD-96): send the RAW cloudID string, never wx.cloud.CloudID() and never a decrypted-looking object. The server
              // decrypts it itself (cloud.getOpenData); the mock server resolves it to a stand-in group so DevTools can run the flows.
              api.joinGroup({ cloudID: info.cloudID }).then((r) => {
                if (r && r.ok && r.groupRef) {
                  analytics.track('group_join', Object.assign({ result: 'ok' }, props));
                  resolve({ status: 'ok', groupRef: r.groupRef, errCode: undefined });
                } else {
                  const code = r && r.code;
                  const result = code === 40097 ? 'wrongScene' : code === 65206 ? 'leftGroup' : code === 'NOT_GROUP' ? 'notGroup' : 'error';
                  resolve(fail(result, code));
                }
              }).catch(() => resolve(fail('error', 'net')));
            },
            fail: (e) => {
              const code = e && (e.errno || e.errCode);
              if (code === 104 && !retried && ctx && ctx.privacy) {
                // the player has not agreed to the privacy guide: the official popup, once, then retry
                return ctx.privacy.requirePrivacy('group_enter').then((s) => (s === 'agreed' ? attempt(true).then(resolve) : resolve(fail('privacyDenied', code))));
              }
              resolve(fail(code === 40097 ? 'wrongScene' : code === 65206 ? 'leftGroup' : 'error', code));
            },
          });
        } catch (e) {
          resolve(fail('error', 'throw'));
        }
      });
    return attempt(false);
  };

  return share;
}

module.exports = { createShare, parseEnter, parseQuery, inviteQuery, revealQuery, roomQuery, FALLBACK_IMAGE, ROOM_FALLBACK_IMAGE, GENERIC_TITLE, ROOM_INVITE_TITLE };
