/**
 * Open data domain entry (spec 8.5; js/render/CONTRACT.md "open data domain"). Receives postMessage from the main domain:
 *   {type:'render', view:'group'|'friend'|'round', shareTicket?, groupid?, salt, selfHash, viewerDone, mode?, dateKey, rows, refs?,
 *    target?, closestH?, anonymous?, width, height, dpr?, palette, scale}
 *   {type:'scroll', offset}
 * It reads friend or group storage (KV key 'kd'), joins the rows to the SERVER rows with match.buildModel (ranks and values come
 * from the server rows only; KV never ranks, AC 43) and draws with draw.js. A read failure (privacy or scope refused, API error)
 * draws the same list anonymously ("群友 A/B/C"). It never posts anything back; nicknames, avatars and openids stay in this context.
 */

const { buildModel } = require('./match');
const { drawView } = require('./draw');

let msg = null;
let model = null;
let scroll = 0;
let status = null; // 'loading' while the storage read is pending
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
  const m = model || { rows: [], peer: null, selfReported: [], hasNames: false };
  const res = drawView(ctx, m, {
    view: msg.view,
    width: w,
    height: h,
    scroll,
    images,
    palette: msg.palette,
    scale: msg.scale,
    status,
    refs: msg.refs,
    target: msg.target,
    closestH: msg.closestH,
    anonymous: !!msg.anonymous,
  });
  scroll = Math.min(scroll, res.maxScroll);
}

function loadAvatars() {
  if (!model) return;
  model.rows.forEach((r) => {
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

function build(kvList) {
  model = buildModel({
    view: msg.view,
    serverRows: msg.rows || [],
    salt: msg.salt,
    selfHash: msg.selfHash,
    kvList,
    viewerDone: !!msg.viewerDone,
    mode: msg.mode,
    dateKey: msg.dateKey,
  });
  status = null;
  redraw();
  loadAvatars();
}

function readStorage() {
  if (msg.anonymous) return build([]); // names unavailable: never read the friend / group storage
  const done = (res) => build((res && res.data) || []);
  const fail = () => build([]); // anonymous list
  const common = { keyList: ['kd'], success: done, fail };
  const useGroup = msg.view === 'group' || (msg.view === 'round' && (msg.shareTicket || msg.groupid));
  if (useGroup) {
    if (msg.groupid) wx.getGroupCloudStorage(Object.assign({ groupid: msg.groupid }, common));
    else if (msg.shareTicket) wx.getGroupCloudStorage(Object.assign({ shareTicket: msg.shareTicket }, common));
    else fail();
  } else wx.getFriendCloudStorage(common);
}

if (typeof wx !== 'undefined' && wx.onMessage) {
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
    status = 'loading';
    redraw();
    readStorage();
  });
}

module.exports = { _test: { redraw } };
