/**
 * Boot: registers the platform events and runs the frame loop. All wiring lives in js/app.js and all game logic in
 * js/controller.js, so the headless tests drive the same code. Boots with no backend: build-config `cloudEnv` is empty, so
 * the in-memory mock server (js/mock-server.js) answers every call.
 */

const { createApp } = require('./app');

function boot() {
  const app = createApp({ wx, setInterval, clearInterval, setTimeout, clearTimeout });
  wx.onTouchStart((e) => app.input.touchStart(e));
  if (wx.onTouchMove) wx.onTouchMove((e) => app.input.touchMove(e));
  wx.onTouchEnd((e) => app.input.touchEnd(e));
  wx.onTouchCancel((e) => app.input.touchCancel(e));
  wx.onShow((opts) => app.onShow(opts));
  if (wx.onHide) wx.onHide(() => app.onHide());
  app.start();
  const loop = () => {
    app.frame();
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  return app;
}

const app = boot();
module.exports = app;
