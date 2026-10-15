/**
 * Open data domain entry. Receives postMessage from the main domain:
 *   {type:'render', view:'group'|'friend'|'round', shareTicket?, groupid?,
 *    salt, selfHash, viewerDone, rows, refs?, target?, mode?, width, height,
 *    palette, scale, dpr?, rowH, footH, fontScale}
 *   {type:'scroll', offset}
 * It reads rows with getGroupCloudStorage (group page; a round opened with a
 * ticket) or getFriendCloudStorage (friend board; a round without one),
 * hashes each row's openid with the given salt, matches them to the server
 * rows and ranks by SERVER values only (board.js). If reading fails or the
 * friend scope is refused, the server rows are still drawn, anonymously
 * ("群友 A/B/C"). It never posts anything back; nicknames, avatars and
 * openids never leave this context.
 */

const { buildModel, KV_KEY } = require('./board');
const { drawBoard } = require('./draw');

let msg = null;
let model = null;
let scroll = 0;
let status = null;
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
  const m = model || { view: msg.view, entries: [], unverified: [] };
  const res = drawBoard(ctx, m, {
    width: w,
    height: h,
    scroll,
    rowH: msg.rowH,
    footH: msg.footH,
    fontScale: msg.fontScale || msg.scale || 1,
    palette: msg.palette,
    images,
    message: status,
  });
  scroll = Math.min(scroll, res.maxScroll);
}

function loadAvatars() {
  if (!model) return;
  model.entries.concat(model.unverified || []).forEach((r) => {
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
  const common = { keyList: [KV_KEY], success: (res) => onRows(res.data || []), fail: onFail };
  const useGroup = msg.view === 'group' || (msg.view === 'round' && (msg.shareTicket || msg.groupid));
  if (useGroup) {
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
  status = '正在读取…';
  redraw();
  fetchRows(
    (rows) => {
      status = null;
      model = buildModel(msg, rows);
      redraw();
      loadAvatars();
    },
    () => {
      // refused or failed: still show the server rows, anonymously
      status = null;
      model = buildModel(msg, []);
      redraw();
    }
  );
});
