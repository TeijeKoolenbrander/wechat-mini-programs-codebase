/**
 * 本群 page and 好友榜 (spec 6.8, 8, PD-6, PD-20, PD-21, AC 41-49, 64-65) [COMPLIANCE].
 *
 * Ranks, scores and order come ONLY from the server rows (getGroupDay / getFriendBoard); the open data domain adds
 * nicknames and avatars by hashing its own openid list with the row salt and never ranks; the KV marker never overrides
 * a server value (AC 43). Names need the privacy agreement and scope.WxFriendInteraction; with either refused every
 * view still renders the server rows anonymously ("群友 A/B") and play is never blocked. A prompt happens only from
 * the tap that opens the page (AC 64, 65).
 */

const P = require('../../core/present');

module.exports = function install(K) {
  const { st, api, privacy, odc, share, wx } = K;

  K.boardSize = function boardSize(banner) {
    const L = K.layout();
    const r = K.d.boardRect ? K.d.boardRect(L, banner, K.display()) : null;
    const b = r || L.board || { w: L.contentW || L.W, h: 300 };
    return { w: b.w, h: b.h };
  };

  function post(view, board, extra, anonymous) {
    const size = K.boardSize(board.banner || { show: false, reservedHeight: 0 });
    const msg = Object.assign(
      {
        type: 'render',
        view,
        salt: extra.salt,
        selfHash: extra.selfHash,
        viewerDone: extra.viewerDone,
        dateKey: extra.dateKey,
        rows: extra.rows,
        width: size.w,
        height: size.h,
        dpr: K.layout().dpr || 1,
        palette: K.display().palette,
        scale: K.display().scale,
      },
      view === 'friend' ? { mode: extra.mode, refs: extra.refs || undefined } : {}
    );
    if (view === 'group' && st.group.shareTicket) msg.shareTicket = st.group.shareTicket;
    if (anonymous) msg.anonymous = true;
    odc.render(msg);
  }

  function bannerFor(state) {
    const f = st.features.banner;
    const show = !!(f && f.enabled && f.adUnitId) && (state === 'ready' || state === 'empty');
    return { show, reservedHeight: show ? K.ads.bannerHeight || 64 : 0 };
  }

  function back() {
    if (st.boardFrom === 'result' && st.result) return K.go('result');
    K.goHome();
  }

  // ---- 本群 ---------------------------------------------------------------------------------------------------------------------

  K.openGroupPage = async function openGroupPage() {
    st.boardFrom = st.screen === 'result' ? 'result' : 'home';
    st.boardKind = 'group';
    st.fpage = null;
    const g = (st.gpage = { state: st.group.status === 'checking' ? 'checkingGroup' : 'loading', data: null, listScroll: 0 });
    const tok = K.go('group');
    if (st.group.status === 'checking' && K.groupJoin) {
      await K.groupJoin;
      if (!K.live(tok)) return;
    }
    if (st.group.status !== 'ok') {
      g.state = st.group.status === 'failed' ? 'groupFailed' : 'noGroup';
      K.track('group_view', { state: g.state, hasMq: false });
      K.invalidate();
      return;
    }
    return loadGroup(g, tok);
  };

  async function loadGroup(g, tok) {
    g.state = 'loading';
    K.invalidate();
    const r = await api.getGroupDay({ groupRef: st.group.groupRef, dateKey: K.todayKey() });
    if (!K.live(tok) || st.gpage !== g) return;
    if (!r.ok) {
      g.data = null;
      g.state = 'serverError';
      K.track('error', { where: 'getGroupDay', code: r.code || 'unknown' });
      K.track('group_view', { state: 'serverError', hasMq: false });
      K.invalidate();
      return;
    }
    g.data = r;
    let state = P.groupState(r);
    let anonymous = false;
    if (state === 'ready' || state === 'small') {
      const gate = await privacy.ensureForBoard('group_open');
      if (!K.live(tok) || st.gpage !== g) return;
      if (gate.state !== 'ok') {
        anonymous = true;
        state = gate.state; // privacyDenied | unauthorized: the anonymous list and the stat lines still draw
      }
    }
    g.state = state;
    K.track('group_view', { state, n: r.n, hasMq: r.mq !== null });
    if (state === 'ready' || state === 'small' || state === 'privacyDenied' || state === 'unauthorized') {
      post('group', { banner: bannerFor('ready') }, { salt: r.salt, selfHash: r.selfHash, viewerDone: r.viewerDone, dateKey: r.dateKey, rows: r.rows }, anonymous);
    }
    K.invalidate();
    K.syncBanner();
  }

  // ---- 好友榜 -------------------------------------------------------------------------------------------------------------------

  K.openFriendBoard = async function openFriendBoard() {
    st.boardFrom = st.screen === 'result' ? 'result' : 'home';
    st.boardKind = 'friend';
    st.gpage = null;
    const f = (st.fpage = { state: 'loading', data: null, listScroll: 0 });
    const tok = K.go('group');
    return loadFriends(f, tok);
  };

  async function loadFriends(f, tok) {
    f.state = 'loading';
    K.invalidate();
    const r = await api.getFriendBoard({ dateKey: K.todayKey() });
    if (!K.live(tok) || st.fpage !== f) return;
    if (!r.ok) {
      f.data = null;
      f.state = 'serverError';
      K.track('error', { where: 'getFriendBoard', code: r.code || 'unknown' });
      K.track('friend_board_view', { state: 'serverError' });
      K.invalidate();
      return;
    }
    f.data = r;
    let state = r.rows.length === 0 ? 'empty' : 'ready';
    let anonymous = false;
    if (state === 'ready') {
      const gate = await privacy.ensureForBoard('friend_open');
      if (!K.live(tok) || st.fpage !== f) return;
      if (gate.state !== 'ok') {
        anonymous = true;
        state = gate.state;
      }
    }
    f.state = state;
    K.track('friend_board_view', { state, mode: r.mode });
    if (state === 'ready' || state === 'privacyDenied' || state === 'unauthorized') {
      post('friend', { banner: bannerFor('ready') }, { salt: r.salt, selfHash: r.selfHash, viewerDone: r.viewerDone, dateKey: r.dateKey, rows: r.rows, mode: r.mode, refs: r.refs }, anonymous);
    }
    K.invalidate();
    K.syncBanner();
  }

  // ---- shared handlers ------------------------------------------------------------------------------------------------------------

  const current = () => (st.boardKind === 'friend' ? st.fpage : st.gpage);
  const reload = () => {
    const b = current();
    if (!b) return;
    if (st.boardKind === 'friend') loadFriends(b, st.nav);
    else if (st.group.status === 'ok') loadGroup(b, st.nav);
    else K.openGroupPage();
  };

  K.on('board:back', back);
  K.on('board:retry', reload);
  K.on('board:list', () => {});
  K.on('board:goPlay', () => {
    K.goHome();
    K.loadDaily().then(() => {
      const s = K.homeState();
      if (s === 'available' || s === 'inProgress') K.handlers['home:daily']();
    });
  });
  K.on('board:share', () => {
    const b = current();
    share.shareGroup({ mq: st.boardKind === 'group' && b && b.data && b.data.mq !== null ? b.data.mq : null });
  });
  K.on('board:contract', () => {
    if (wx.openPrivacyContract) wx.openPrivacyContract({ success() {}, fail() {} });
  });
  K.on('board:agree', async () => {
    const r = await privacy.requestPrivacy('board_agree');
    if (r === 'agreed') {
      await privacy.flushPending();
      reload();
    }
  });
  K.on('board:openSetting', async () => {
    await privacy.openSetting();
    K.afterPrivacyChange();
  });
  K.onPrefix('board:round:', (roundId) => K.openRound(roundId, {}));

  /** onShow after the player may have enabled the scope in the system settings: re-render, never prompt (AC 65). */
  K.afterPrivacyChange = function afterPrivacyChange() {
    if (st.screen !== 'group') return;
    const b = current();
    if (!b || (b.state !== 'unauthorized' && b.state !== 'privacyDenied')) return;
    const pv = K.store.state.privacy;
    if (pv.privacy === 'agreed' && pv.friendScope === 'granted') reload();
  };
};
