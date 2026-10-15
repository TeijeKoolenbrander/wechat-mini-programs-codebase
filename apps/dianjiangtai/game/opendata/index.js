/**
 * Open data domain entry. Receives postMessage from the main domain:
 *   {type:'render', kind, dateKey, issueNo, contentVersion, shareTicket?,
 *    groupid?, salt, selfHash, mode, viewerPlayed, rows, showUnverified,
 *    width, height, dpr?, roster?}
 *   {type:'scroll', offset}
 * It reads friend/group rows with get*CloudStorage, hashes each row's openid
 * with the day's salt, matches them to the server rows and ranks by SERVER
 * values only (board.js). It never posts anything back, and nicknames,
 * avatars and openids never leave this context.
 */

const { buildModel } = require('./board');
const { drawBoard } = require('./draw');

let msg = null;
let model = null;
let scroll = 0;
let status = null; // inline message when the read failed
const images = {};

function canvasAndCtx() {
  const canvas = wx.getSharedCanvas();
  const dpr = (msg && msg.dpr) || 1;
  const w = msg ? msg.width : canvas.width;
  const h = msg ? msg.height : canvas.height;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h };
}

function redraw() {
  if (!msg) return;
  const { ctx, w, h } = canvasAndCtx();
  const m = model || { ranked: [], unverified: [], kind: msg.kind };
  const res = drawBoard(ctx, m, { width: w, height: h, scroll, roster: msg.roster, images, message: status, display: msg.display });
  scroll = Math.min(scroll, res.maxScroll);
}

function loadAvatars() {
  if (!model) return;
  model.ranked.concat(model.unverified).forEach((r) => {
    const url = r.avatarUrl;
    if (!url || images[url]) return;
    const img = wx.createImage();
    img.onload = () => {
      images[url] = img;
      redraw();
    };
    img.src = url;
  });
}

function fetchRows(onRows, onFail) {
  const common = { keyList: ['d_' + msg.dateKey], success: (res) => onRows(res.data || []), fail: onFail };
  if (msg.kind === 'group') {
    const p = msg.groupid ? { groupid: msg.groupid } : { shareTicket: msg.shareTicket };
    wx.getGroupCloudStorage(Object.assign(p, common));
  } else {
    wx.getFriendCloudStorage(common);
  }
}

wx.onMessage((data) => {
  if (!data) return;
  if (data.type === 'scroll') {
    scroll = Math.max(0, data.offset || 0);
    redraw();
    return;
  }
  if (data.type !== 'render') return;
  msg = data;
  scroll = 0;
  model = null;
  status = '正在读取排行…';
  redraw();
  fetchRows(
    (rows) => {
      status = null;
      model = buildModel(msg, rows);
      redraw();
      loadAvatars();
    },
    () => {
      status = '排行榜暂时读取失败';
      redraw();
    }
  );
});
