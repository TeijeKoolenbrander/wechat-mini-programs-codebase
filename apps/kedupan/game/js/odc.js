/**
 * Open data domain bridge (spec 8.5). One-way: the main domain posts the render message; the open data
 * domain draws onto the shared canvas, which the board renderer composites (`vm.sharedCanvas`). The main
 * domain never receives openids, nicknames or avatars. Rows carry only hashes (spec 8.3).
 */

function createOdc(wx) {
  const odc = { ctx: null, canvas: null, posted: [] };

  function ctx() {
    if (!odc.ctx && wx && wx.getOpenDataContext) {
      try {
        odc.ctx = wx.getOpenDataContext();
        odc.canvas = odc.ctx.canvas || (wx.getSharedCanvas && wx.getSharedCanvas()) || null;
      } catch (e) {
        odc.ctx = null;
      }
    }
    return odc.ctx;
  }

  /** Size the shared canvas for the rect and post the render message. Returns false when there is no open data context. */
  odc.render = function (msg) {
    const c = ctx();
    if (!c) return false;
    try {
      // resizing clears the canvas, so size first, then send the render message
      if (odc.canvas) {
        odc.canvas.width = Math.round(msg.width * (msg.dpr || 1));
        odc.canvas.height = Math.round(msg.height * (msg.dpr || 1));
      }
      odc.posted.push(msg.view);
      c.postMessage(msg);
      return true;
    } catch (e) {
      return false;
    }
  };

  odc.scroll = function (offset) {
    const c = ctx();
    if (!c) return false;
    try {
      c.postMessage({ type: 'scroll', offset });
      return true;
    } catch (e) {
      return false;
    }
  };

  odc.sharedCanvas = function () {
    ctx();
    return odc.canvas;
  };
  return odc;
}

module.exports = { createOdc };
