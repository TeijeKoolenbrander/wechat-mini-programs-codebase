/**
 * Open data domain bridge (spec 8.5). One-way: the main domain posts the render message and scroll offsets; the open
 * data domain draws onto the shared canvas, which the group renderer composites (`vm.sharedCanvas`). The main domain
 * never receives openids, nicknames or avatars, and the message carries only server rows (hashed), never an openGId.
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
    odc.posted.push(msg);
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
