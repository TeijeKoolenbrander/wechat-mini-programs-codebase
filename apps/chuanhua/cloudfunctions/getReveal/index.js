'use strict';
// getReveal: the full strip for participants only (starter + authors of passed 棒, membership NOT required, edge 13);
// everyone else gets NOT_PARTICIPANT with the teaser (passed prompt + final sentence), never a drawing (spec 3.7, AC 80).
const views = require('./core/views');
const store = require('./common/store');
const players = require('./common/players');
const appconfig = require('./common/appconfig');
const env = require('./common/env');
const roomio = require('./common/roomio');
const { bad, errResp } = require('./common/errors');
const { chainIdOf } = require('./common/input');
const { now } = require('./common/util');

exports.main = store.handler(async (event, { openid }) => {
  env.ugcGuard();
  await store.rateLimit(openid, 'reveal', 1, 60);
  const id = chainIdOf(event);
  let chain = id && (await store.getDoc('chains', id));
  if (!chain) bad('CHAIN_NOT_FOUND');
  // a live room's chains take their final shape when the room is over (materialisation, idempotent): make sure that has happened
  if (chain.mode === 'live' && chain.state === 'open') {
    const room = await roomio.loadRoom(chain.roomId);
    if (room && room.state === 'reveal') {
      await roomio.materialize(room._id);
      chain = await store.getDoc('chains', id);
    }
  }
  const cfg = await appconfig.get();
  const ids = [];
  for (let n = 1; n <= chain.length; n++) if (chain.stepIds[n]) ids.push(chain.stepIds[n]);
  const docs = await Promise.all(ids.map((sid) => store.getDoc('steps', sid)));
  const stepsByN = {};
  docs.forEach((s) => {
    if (s) stepsByN[s.n] = s;
  });
  const reactions = await Promise.all(ids.map((sid) => store.getDoc('reactions', sid + '_' + openid)));
  const myLaughs = {};
  reactions.forEach((r) => {
    if (r) myLaughs[r.stepId] = true;
  });
  const resp = views.revealResponse(chain, stepsByN, {
    openid,
    viewEnabled: cfg.ugc.viewEnabled,
    myLaughs,
  });
  if (!resp.ok) return errResp(resp.code, resp);
  // first view: remember it (the 我的接龙 dot) and count the lifetime reveal, atomically
  if (!(chain.revealViewed || []).includes(openid)) {
    await store.txn(async (t) => {
      const c = await store.getDocT(t, 'chains', chain._id);
      if (!c || (c.revealViewed || []).includes(openid)) return;
      const p = await players.getT(t, openid);
      await players.putT(t, 'chains', c._id, Object.assign({}, c, { revealViewed: (c.revealViewed || []).concat(openid) }));
      await players.putPlayerT(t, Object.assign({}, p, { lifetimeReveals: (p.lifetimeReveals || 0) + (c.mode === 'live' ? 0 : 1) }));
    });
  }
  if (chain.mode === 'live') {
    const room = await roomio.loadRoom(chain.roomId);
    resp.roomId = chain.roomId;
    resp.chainNo = chain.seat + 1;
    resp.chainCount = room ? room.n : null;
    resp.mineStarted = chain.starter === openid;
  }
  resp.serverNow = now();
  return resp;
});

