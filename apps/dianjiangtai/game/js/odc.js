/**
 * Open data domain bridge (spec 11.4). One-way: the main domain posts the
 * board message and scroll offsets; the open data domain draws onto the shared
 * canvas, which the board renderer composites (`vm.sharedCanvas`). The main
 * domain never receives openids, nicknames or avatars.
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

  /** Size the shared canvas for the board rect and post the render message. */
  odc.render = function (msg) {
    const c = ctx();
    if (!c) return false;
    // resizing clears the canvas, so size first, then send the render message
    if (odc.canvas) {
      odc.canvas.width = Math.round(msg.width * (msg.dpr || 1));
      odc.canvas.height = Math.round(msg.height * (msg.dpr || 1));
    }
    odc.posted.push(msg.type);
    c.postMessage(msg);
    return true;
  };

  odc.scroll = function (offset) {
    const c = ctx();
    if (!c) return false;
    c.postMessage({ type: 'scroll', offset });
    return true;
  };

  odc.sharedCanvas = function () {
    ctx();
    return odc.canvas;
  };
  return odc;
}

module.exports = { createOdc };
