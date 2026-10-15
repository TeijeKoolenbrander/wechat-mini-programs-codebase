/**
 * Group page and friend board (spec 6.8, 8). The main domain shows the server-computed stats; the rows
 * (names, avatars) are drawn by the open data domain from hashed server rows. Refusal of privacy or the friend
 * scope never blocks anything: the server rows render anonymously ("群友 A/B/C") with a passive [去设置开启].
 * A tampered KV value never changes a displayed score or rank (the open data domain only matches hashes).
 */

const V = require('../vm');
const Sh = require('../share');

module.exports = function createBoards(c) {
  const { S, api, track, privacy, odc } = c;
  const f = {};
  const g = { state: 'noGroup', base: null, data: null, rowCount: 0, scroll: 0, loadSeq: 0 };
  const fr = { state: 'loading', base: null, data: null, mode: null, rowCount: 0, scroll: 0, loadSeq: 0 };

  const dateKey = () => (S.daily && S.daily.dateKey) || c.todayKey();

  function post(view, r, anon, extra) {
    const rc = c.odcRect();
    const disp = c.display();
    return odc.render(
      V.odcMessage(
        view,
        Object.assign(
          {
            salt: r.salt,
            selfHash: r.selfHash,
            viewerDone: r.viewerDone,
            rows: r.rows,
            refs: r.refs || undefined,
            width: rc.w,
            height: rc.h,
            dpr: rc.dpr,
            palette: disp.palette,
            scale: disp.scale,
            anon,
          },
          extra || {}
        )
      )
    );
  }

  // ---------------------------------------------------------------- group page

  /**
   * auto = no in-game tap led here (a card entry): privacy is never prompted. quiet = refresh without the skeleton.
   */
  f.openGroup = async function (auto, quiet) {
    if (c.screen !== 'group') c.go('group');
    const seq = ++g.loadSeq;
    g.scroll = 0;
    if (c.group.status === 'none') return setGroup('noGroup');
    if (c.group.status === 'checking') return setGroup('checkingGroup');
    if (c.group.status === 'failed') return setGroup('groupFailed');
    if (!quiet) setGroup('loading');
    const gate = await c.gateNames(!!auto, 'group_open');
    const r = await api.getGroupDay({ groupRef: c.group.groupRef, dateKey: dateKey() });
    if (seq !== g.loadSeq) return undefined;
    if (!r || !r.ok) {
      track('error', { where: 'getGroupDay', code: (r && r.code) || 'none' });
      return setGroup('serverError');
    }
    g.data = r;
    g.rowCount = r.rows.length;
    g.base = !r.viewerDone ? 'notPlayed' : r.n === 0 ? 'empty' : r.n < 3 ? 'small' : 'ready';
    const anon = gate !== 'ok';
    if (r.rows.length) post('group', r, anon, { shareTicket: c.group.shareTicket || undefined });
    g.state = gate === 'ok' ? g.base : gate;
    track('group_view', { state: g.state, n: r.n, hasMq: r.mq !== null && r.mq !== undefined });
    c.invalidate();
    return undefined;
  };

  function setGroup(state) {
    g.state = state;
    if (state === 'noGroup' || state === 'groupFailed' || state === 'serverError') track('group_view', { state, hasMq: false });
    c.invalidate();
  }

  // ---------------------------------------------------------------- friend board

  f.openFriend = async function () {
    if (c.screen !== 'friend') c.go('friend');
    const seq = ++fr.loadSeq;
    fr.scroll = 0;
    fr.state = 'loading';
    c.invalidate();
    const gate = await c.gateNames(false, 'friend_board_open');
    const r = await api.getFriendBoard({ dateKey: dateKey() });
    if (seq !== fr.loadSeq) return;
    if (!r || !r.ok) {
      track('error', { where: 'getFriendBoard', code: (r && r.code) || 'none' });
      fr.state = 'serverError';
      return c.invalidate();
    }
    fr.data = r;
    fr.mode = r.mode;
    fr.rowCount = r.rows.length;
    fr.base = r.rows.length ? 'ready' : 'empty';
    if (r.rows.length) post('friend', r, gate !== 'ok', { mode: r.mode });
    fr.state = gate === 'ok' ? fr.base : gate;
    track('friend_board_view', { state: fr.state, mode: r.mode });
    c.invalidate();
  };

  // ---------------------------------------------------------------- hits

  function reload() {
    return c.screen === 'group' ? f.openGroup(false) : f.openFriend();
  }

  f.shareContext = function () {
    if (c.screen !== 'group') return null;
    const mq = g.data && g.data.mq !== undefined ? g.data.mq : null;
    return { kind: 'group', mq, card: Sh.groupCardVm(mq) };
  };

  f.hit = function (id) {
    const isGroup = c.screen === 'group';
    const pre = isGroup ? 'group:' : 'friend:';
    if (id === 'back') return c.back();
    if (id === 'board:list') return undefined;
    if (isGroup && id.indexOf('group:round:') === 0) return c.flows.round.open(id.slice(12), 'group', false);
    if (id.indexOf(pre) !== 0) return undefined;
    switch (id.slice(pre.length)) {
      case 'retry':
        return reload();
      case 'play':
        c.goHome();
        return c.flows.home.hit('home:daily');
      case 'share': {
        const ctx = f.shareContext();
        if (ctx) c.share.shareGroup(ctx);
        return undefined;
      }
      case 'contract':
        if (c.wx.openPrivacyContract) c.wx.openPrivacyContract({});
        return undefined;
      case 'agree':
        return privacy.requestPrivacy('board_open').then(async (r) => {
          if (r === 'agreed') await privacy.flushPending();
          return reload();
        });
      case 'openSetting':
        return privacy.openSetting().then(() => reload());
    }
    return undefined;
  };

  f.drag = function (id, dy) {
    if (id !== 'board:list') return;
    const cur = c.screen === 'group' ? g : fr;
    const L = c.layout();
    const cap = (cur.rowCount || 0) * 66 * (L.s || 1);
    cur.scroll = Math.max(0, Math.min(cap, cur.scroll - dy));
    odc.scroll(cur.scroll);
  };

  f.animating = () => (c.screen === 'group' && (g.state === 'loading' || g.state === 'checkingGroup')) || (c.screen === 'friend' && fr.state === 'loading');

  f.bannerWant = () => {
    if (c.screen === 'group') return { screen: 'group', state: g.state === 'privacyDenied' || g.state === 'unauthorized' ? g.base : g.state };
    if (c.screen === 'friend') return { screen: 'friend', state: fr.state === 'privacyDenied' || fr.state === 'unauthorized' ? fr.base : fr.state };
    return null;
  };

  f.vm = function () {
    if (c.screen === 'friend') {
      const base = fr.base;
      const selfOnly = fr.mode === 'selfOnly';
      return V.friendVm(
        {
          state: fr.state,
          mode: fr.mode,
          issueNo: fr.data ? fr.data.issueNo : S.daily ? S.daily.issueNo : 0,
          selfText: selfOnly ? '你的成绩已校验，好友成绩为自报' : null,
          banner: V.bannerVm(c.features, fr.state === 'ready' || fr.state === 'empty'),
          base,
          sharedCanvas: odc.sharedCanvas(),
          rowCount: fr.rowCount,
          viewerDone: !!(fr.data && fr.data.viewerDone),
        },
        c.display(),
        c.featuresVm()
      );
    }
    const d = g.data;
    const notice = g.state === 'unauthorized' ? '开启「微信朋友关系」可显示群友昵称' : g.state === 'privacyDenied' ? '查看群友昵称需要同意《用户隐私保护指引》' : null;
    return V.groupVm(
      {
        state: g.state,
        base: g.base,
        issueNo: d ? d.issueNo : S.daily ? S.daily.issueNo : 0,
        n: d ? d.n : 0,
        mq: d ? d.mq : null,
        viewerDone: !!(d && d.viewerDone),
        divisiveIdx: d ? d.divisiveIdx : null,
        cards: S.daily && d && S.daily.dateKey === d.dateKey ? S.daily.cards : null,
        trend: d ? d.trend : null,
        rounds: d ? d.rounds : [],
        banner: V.bannerVm(c.features, g.state === 'ready' || g.state === 'small' || g.state === 'empty' || g.state === 'notPlayed' || ((g.state === 'privacyDenied' || g.state === 'unauthorized') && !!g.base)),
        notice,
        sharedCanvas: odc.sharedCanvas(),
        rowCount: g.rowCount,
      },
      c.display(),
      c.featuresVm()
    );
  };

  f.groupState = () => g;
  f.friendState = () => fr;
  return f;
};
