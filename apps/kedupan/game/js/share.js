/**
 * Sharing and group context (spec 7, 8.1) [COMPLIANCE: 诱导分享].
 *
 *  - every share starts from an explicit tap (the `share*` methods are called only from a tap handler) or the capsule
 *    menu (`register`); nothing is shared automatically; NO share ever grants or unlocks anything (AC 50, 51)
 *  - no success callback is used (shareAppMessage documents none); nothing waits on whether a share succeeded
 *  - `wx.updateShareMenu({withShareTicket: true})`, never together with `isUpdatableMessage: false` (spec 7)
 *  - titles and queries come from core/entry.js (daily: s=d&d=<dateKey>, round and reveal: r=<roundId> only, group:
 *    s=g); a title that fails core/entry.titleOk is replaced by the plain menu title
 *  - images: models come from core/entry.js and carry no positions / medians / group numbers / names / target before
 *    the reveal (AC 52, 53); the 500x400 canvas is drawn by render/shareCard via `share.cardRenderer`, with the static
 *    fallback image on any failure
 *  - group context: wx.getGroupEnterInfo -> cloudID -> joinGroup. wx.getShareInfo is never called (AC 41)
 */

const E = require('../core/entry');
const { shareClueLine } = require('./clue-ui');

const FALLBACK_IMAGE = 'assets/share-fallback.png';

function createShare(opts) {
  const { wx, api, analytics } = opts;
  const share = { cardRenderer: null, FALLBACK_IMAGE, sent: [] };
  let ctxGetter = null;

  /** Render a card model to a temp file. Resolves { path, fallback }. */
  async function cardFile(kind, model) {
    if (share.cardRenderer) {
      try {
        const p = await share.cardRenderer(Object.assign({ kind }, model));
        if (p) return { path: p, fallback: false };
      } catch (e) {
        analytics.track('error', { where: 'share_card', code: 'render' });
      }
    }
    return { path: FALLBACK_IMAGE, fallback: true };
  }
  share.cardFile = cardFile;

  const safe = (s) => (E.titleOk(s.title) ? s : Object.assign({}, s, { title: E.menuShare().title }));

  function send(kind, s, image, props) {
    const payload = { title: s.title, imageUrl: image, query: s.query };
    share.sent.push(Object.assign({ kind }, payload));
    analytics.track('share_tap', Object.assign({ kind }, props || {}));
    if (wx.shareAppMessage) wx.shareAppMessage(payload);
    return { ok: true, kind };
  }

  /** Capsule menu: share is off by default in mini games, so it is switched on explicitly. */
  share.register = function (getContext) {
    ctxGetter = getContext;
    if (wx.showShareMenu) wx.showShareMenu({ menus: ['shareAppMessage'] });
    if (wx.updateShareMenu) wx.updateShareMenu({ withShareTicket: true });
    if (wx.onShareAppMessage) {
      wx.onShareAppMessage(() => {
        const c = (ctxGetter && ctxGetter()) || {};
        analytics.track('share_tap', { kind: 'menu' });
        const s = c.menu || E.menuShare();
        return { title: safe(s).title, query: s.query, imageUrl: FALLBACK_IMAGE };
      });
    }
  };

  /**
   * Explicit tap: 分享 on the day result. d = { dateKey, issueNo, cards, labels[5], total, band }.
   * Title: "火锅是冷还是热？我今天和全国的默契分 412，你呢"; query s=d&d=<dateKey>.
   */
  share.shareDaily = async function (d) {
    const s = safe(E.dailyShare({ card1: d.cards[0], total: d.total, dateKey: d.dateKey }));
    const model = E.dailyShareImageModel({ issueNo: d.issueNo, cards: d.cards, labels: d.labels, total: d.total, band: d.band });
    const img = await cardFile('daily', model);
    return send('daily', s, img.path, { dateKey: d.dateKey });
  };

  /**
   * Explicit tap: 发到群里 / 再发到群里. r = { roundId, left, right, clueMode: 'text'|'preset'|'chat', presetText }. The target is never an
   * input, and neither is a typed clue (PD-37, AC 96): the image reads "提示在题目里，点开看看" for a typed round, the curated preset
   * text for a preset round, and the legacy chat line otherwise. The title is the same for every mode.
   */
  share.shareRound = async function (r) {
    const s = safe(E.roundShare({ left: r.left, right: r.right, roundId: r.roundId }));
    const img = await cardFile('round', E.roundImageModel({ left: r.left, right: r.right, clueText: shareClueLine(r.clueMode, r.presetText) }));
    return send('round', s, img.path, { roundId: r.roundId });
  };

  /** Explicit tap: 分享揭晓. r = { roundId, left, right, target, guesses[], mq, guessCount }. No names. */
  share.shareReveal = async function (r) {
    const s = safe(E.revealShare({ roundId: r.roundId, mq: r.mq }));
    const img = await cardFile('reveal', E.revealImageModel({ left: r.left, right: r.right, target: r.target, guesses: r.guesses, mq: r.mq, guessCount: r.guessCount }));
    return send('reveal', s, img.path, { roundId: r.roundId });
  };

  /** Explicit tap: 分享到本群. mq = 群默契度 or null. */
  share.shareGroup = async function (g) {
    const s = safe(E.groupShare({ mq: g && g.mq !== undefined ? g.mq : null }));
    const img = await cardFile('group', { title: g && g.mq !== null && g.mq !== undefined ? '本群今日默契度 ' + g.mq : '本群今日刻度' });
    return send('group', s, img.path, {});
  };

  /**
   * Group context for an entry with a shareTicket (spec 8.1). Resolves { status: 'ok'|'failed', groupRef, errCode }.
   * In mock mode (no cloud) the CloudID is replaced by synthetic group data so the flow can be exercised in DevTools.
   */
  share.enterGroup = function (entry) {
    const props = { scene: entry.scene === undefined ? 0 : entry.scene };
    if (entry.chatType !== undefined) props.chatType = entry.chatType;
    const fail = (result, code) => {
      analytics.track('group_join', Object.assign({ result }, code !== undefined ? { errCode: code } : {}, props));
      return { status: 'failed', groupRef: null, errCode: code };
    };
    return new Promise((resolve) => {
      if (!wx.getGroupEnterInfo) return resolve(fail('error', 'unsupported'));
      const opts2 = {
        success: (info) => {
          if (!info || !info.cloudID) return resolve(fail('error', 'nocloudid'));
          // M1: the raw cloudID string; the server resolves it (cloud.getOpenData). Never a wx.cloud.CloudID() wrapper or an object.
          let cloudID = String(info.cloudID);
          if (api.mode === 'mock' && api.mock) cloudID = api.mock.cloudID('mock-group-' + cloudID.slice(-8), entry.chatType === undefined ? 3 : entry.chatType);
          Promise.resolve(api.joinGroup({ cloudID })).then((r) => {
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
      };
      wx.getGroupEnterInfo(opts2);
    });
  };

  return share;
}

module.exports = { createShare, FALLBACK_IMAGE };
