/**
 * Sharing and card entry (spec 7, 8.1) [COMPLIANCE: 诱导分享].
 *
 *  - every share starts from an explicit tap or the capsule menu; nothing is shared automatically (AC 51)
 *  - NO share ever grants anything (AC 50); no success callback is used (shareAppMessage documents none)
 *  - `withShareTicket` via wx.updateShareMenu({withShareTicket:true}), never together with isUpdatableMessage:false
 *  - group context: wx.getGroupEnterInfo -> cloudID -> cloud function joinGroup. wx.getShareInfo is never called (AC 41)
 *  - the daily card is spoiler-safe (PD-11): prompts and per-card label blocks only, no positions, medians or group numbers (AC 52)
 *  - a round card's query carries the id only, never the target (AC 28, 53); reveal cards carry no names
 *
 * The 500x400 share-card canvas is drawn by frontend-ui; the hook is `share.cardRenderer = (cardVm) => Promise<tempFilePath>`.
 * On any failure the static fallback image is used.
 */

const FALLBACK_IMAGE = 'assets/share-fallback.png';
const ROUND_ID = /^[0-9A-Za-z]{8}$/;

// ---------------------------------------------------------------- titles and queries (pure)

function dailyTitle(card1, total) {
  return card1.prompt + '是' + card1.left + '还是' + card1.right + '？我今天和全国的默契分 ' + total + '，你呢';
}

function roundTitle(left, right) {
  return '我出了一道刻度题：' + left + '↔' + right + '，猜猜我心里的位置';
}

function revealTitle(mq) {
  return '刻度题揭晓：本题默契值 ' + mq;
}

function groupTitle(mq) {
  return mq !== null && mq !== undefined ? '本群今日默契度 ' + mq + '，你的指针放在哪？' : '本群今日刻度，你的指针放在哪？';
}

const DEFAULT_TITLE = '群友刻度盘：把指针放到你觉得对的位置';

const dailyQuery = (dateKey) => 's=d&d=' + (dateKey || '');
const roundQuery = (id) => 'r=' + id;
const groupQuery = () => 's=g';

// ---------------------------------------------------------------- card view models for frontend-ui (no spoilers)

/** rows: [{ prompt, left, right, label }], no positions. */
function dailyCardVm(issueNo, rows, total, bandLabel) {
  return {
    kind: 'daily',
    header: '群友刻度盘 · 每日刻度 第' + issueNo + '期',
    rows: rows.map((r) => ({ prompt: r.prompt, ends: r.left + '↔' + r.right, label: r.label })),
    footer: '今日默契分 ' + total + ' · ' + bandLabel,
    cta: '你会把指针放在哪？',
  };
}

function roundCardVm(left, right, clueText) {
  return { kind: 'round', header: '群友出了一道刻度题', left, right, clue: clueText ? '提示：' + clueText : '提示在群聊里', ruler: 'empty' };
}

/** dots = guess positions (unnamed). */
function revealCardVm(left, right, target, dots, mq) {
  return { kind: 'reveal', header: '刻度题揭晓', left, right, target, dots, mqText: '本题默契值 ' + mq + ' · ' + dots.length + ' 人作答' };
}

function groupCardVm(mq) {
  return { kind: 'group', header: '群友刻度盘', mqText: mq !== null && mq !== undefined ? '本群今日默契度 ' + mq : '本群今日刻度' };
}

// ---------------------------------------------------------------- entry parsing (7.5)

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
 * options = wx.getEnterOptionsSync() shape: { scene, query, shareTicket, chatType }. Returns
 * { kind: 'daily'|'group'|'round'|'fallbackShare'|'none'|'malformed', roundId?, dateKey?, hasShareTicket, shareTicket, scene, chatType, join, notice }
 * `join` = true when joinGroup should run (a ticket is present on an s=d, s=g or r= card).
 */
function parseEnter(options) {
  const o = options || {};
  const q = parseQuery(o.query);
  const hasTicket = !!o.shareTicket;
  const base = { hasShareTicket: hasTicket, shareTicket: o.shareTicket || null, scene: o.scene, chatType: o.chatType, join: false, notice: o.scene === 1107 };
  if (q.__bad) return Object.assign(base, { kind: 'malformed' });
  if (q.wxad_fallback_share === '1') return Object.assign(base, { kind: 'fallbackShare' });
  if (q.r !== undefined) {
    if (!ROUND_ID.test(q.r)) return Object.assign(base, { kind: 'malformed' });
    return Object.assign(base, { kind: 'round', roundId: q.r, join: hasTicket });
  }
  if (q.s === 'd') return Object.assign(base, { kind: 'daily', dateKey: /^\d{8}$/.test(q.d || '') ? q.d : null, join: hasTicket });
  if (q.s === 'g') return Object.assign(base, { kind: 'group', join: hasTicket });
  if (Object.keys(q).length === 0) return Object.assign(base, { kind: 'none' });
  return Object.assign(base, { kind: 'malformed' });
}

// ---------------------------------------------------------------- the share object

function createShare(opts) {
  const { wx, api, analytics } = opts;
  const share = { cardRenderer: null, FALLBACK_IMAGE, lastShare: null };
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

  async function send(kind, title, query, card, extra) {
    const imageUrl = await cardImage(card);
    analytics.track('share_tap', Object.assign({ kind }, extra || {}));
    const msg = { title, query, imageUrl };
    share.lastShare = msg;
    wx.shareAppMessage(msg);
    return { ok: true, kind, query };
  }

  /**
   * Capsule menu. getContext() returns the current share context or null:
   * { kind:'daily', dateKey, card1, total, card } | { kind:'round', roundId, left, right, clueText, card }
   * | { kind:'reveal', roundId, mq, card } | { kind:'group', mq, card }
   */
  share.register = function (getContext) {
    ctxGetter = getContext;
    if (wx.showShareMenu) wx.showShareMenu({ menus: ['shareAppMessage'] });
    if (wx.updateShareMenu) wx.updateShareMenu({ withShareTicket: true });
    if (wx.onShareAppMessage) {
      wx.onShareAppMessage(() => {
        const c = (ctxGetter && ctxGetter()) || null;
        analytics.track('share_tap', { kind: 'menu', dateKey: c && c.dateKey, roundId: c && c.roundId });
        if (!c) return { title: DEFAULT_TITLE, query: 's=d', imageUrl: FALLBACK_IMAGE };
        if (c.kind === 'daily') return { title: dailyTitle(c.card1, c.total), query: dailyQuery(c.dateKey), imageUrl: FALLBACK_IMAGE };
        if (c.kind === 'round') return { title: roundTitle(c.left, c.right), query: roundQuery(c.roundId), imageUrl: FALLBACK_IMAGE };
        if (c.kind === 'reveal') return { title: revealTitle(c.mq), query: roundQuery(c.roundId), imageUrl: FALLBACK_IMAGE };
        if (c.kind === 'group') return { title: groupTitle(c.mq), query: groupQuery(), imageUrl: FALLBACK_IMAGE };
        return { title: DEFAULT_TITLE, query: 's=d', imageUrl: FALLBACK_IMAGE };
      });
    }
  };

  /** Explicit tap: 分享 on the day result. c = { dateKey, card1, total, card } */
  share.shareDaily = (c) => send('daily', dailyTitle(c.card1, c.total), dailyQuery(c.dateKey), c.card, { dateKey: c.dateKey });
  /** Explicit tap: 发到群里 / 再发到群里. c = { roundId, left, right, clueText, card } */
  share.shareRound = (c) => send('round', roundTitle(c.left, c.right), roundQuery(c.roundId), c.card, { roundId: c.roundId });
  /** Explicit tap: 分享揭晓. c = { roundId, mq, card } */
  share.shareReveal = (c) => send('reveal', revealTitle(c.mq), roundQuery(c.roundId), c.card, { roundId: c.roundId });
  /** Explicit tap: 分享到本群 (voluntary). c = { mq, card } */
  share.shareGroup = (c) => send('group', groupTitle(c.mq), groupQuery(), c.card, {});

  /**
   * Group context for an entry with a shareTicket (8.1). Resolves { status: 'ok'|'failed', groupRef, errCode }.
   * Errors (40097, 65206, non-group, offline) just mean "no group context".
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

module.exports = {
  createShare,
  parseEnter,
  parseQuery,
  dailyTitle,
  roundTitle,
  revealTitle,
  groupTitle,
  dailyQuery,
  roundQuery,
  groupQuery,
  dailyCardVm,
  roundCardVm,
  revealCardVm,
  groupCardVm,
  FALLBACK_IMAGE,
  DEFAULT_TITLE,
};
