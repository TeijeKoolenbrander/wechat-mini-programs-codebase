/**
 * Open data domain entry (game.json: "openDataContext": "opendata"). Receives
 * postMessage from the main domain:
 *   {type:'render', kind:'group'|'friend', dateKey, issueNo, shareTicket?,
 *    groupid?, salt, selfHash, mode, rows, showUnverified, othersPlaying?,
 *    width, height, dpr?, display?}
 *   {type:'scroll', offset}
 * rows are the getBoard rows [h, st, n, hi, b, s, k?]. It reads friend/group
 * rows with get*CloudStorage, hashes each row's openid with the day's salt,
 * matches them to the server rows and orders by SERVER values only
 * (board.js). It never posts anything back; nicknames, avatars and openids
 * never leave this context.
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
  const m = model || { solved: [], playing: [], gaveup: [], unverified: [], kind: msg.kind, othersPlaying: 0 };
  const res = drawBoard(ctx, m, { width: w, height: h, scroll, images, message: status, display: msg.display });
  scroll = Math.min(scroll, res.maxScroll);
}

function loadAvatars() {
  if (!model) return;
  [].concat(model.solved, model.playing, model.gaveup, model.unverified).forEach((r) => {
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
  status = '正在读取榜单…';
  redraw();
  fetchRows(
    (rows) => {
      status = null;
      model = buildModel(msg, rows);
      redraw();
      loadAvatars();
    },
    () => {
      status = '榜单暂时读取失败';
      redraw();
    }
  );
});
