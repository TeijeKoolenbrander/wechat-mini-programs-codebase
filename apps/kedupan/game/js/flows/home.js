/**
 * Home flow (spec 6.1, 6.11): the daily card state, the howto and settings sheets, and getDaily.
 */

const V = require('../vm');
const { normalizeFeatures } = require('../../core/config');

module.exports = function createHome(c) {
  const { S, api, track, privacy, deps } = c;
  const h = {
    status: 'loading', // 'loading' | 'ok' | 'offline' | 'error' | 'unavailable' (when there is no usable S.daily)
    sheet: null,
    loading: false,
  };

  const hasToday = () => !!S.daily && S.daily.dateKey === c.todayKey();

  /** Daily state for the home card (spec 10). */
  function dailyState() {
    if (!hasToday()) return h.status === 'ok' ? 'loading' : h.status;
    const d = S.daily;
    if (S.pending && S.pending.dateKey === d.dateKey) return 'pendingSubmit';
    if (d.complete) return 'done';
    if (d.answered > 0) return 'inProgress';
    return 'available';
  }

  /** Store a getDaily response as the day's cache. */
  function absorb(r) {
    c.offsetMs = r.serverNow - Date.now();
    const prev = S.daily && S.daily.dateKey === r.dateKey ? S.daily : null;
    S.daily = {
      dateKey: r.dateKey,
      issueNo: r.issueNo,
      cards: r.cards,
      pos: r.mine.pos.slice(),
      answered: r.mine.answered,
      complete: r.mine.complete,
      total: r.mine.total === undefined ? null : r.mine.total,
      refs: r.refs || [null, null, null, null, null],
      groupMedians: r.groupRefs || null,
      divisiveIdx: r.divisiveIdx === undefined ? (prev ? prev.divisiveIdx : null) : r.divisiveIdx,
      yesterday: r.yesterday || null,
      streak: r.myStreak || { current: 0, best: 0 },
    };
    if (r.features) {
      S.features = r.features;
      c.features = normalizeFeatures(r.features);
    }
    // the server wins over a pending answer that another device already sent
    if (S.pending && S.pending.dateKey === r.dateKey && r.mine.pos[S.pending.idx] !== null) S.pending = null;
    c.store.save();
  }
  h.absorb = absorb;

  h.refreshDaily = async function (quiet) {
    if (h.loading) return;
    h.loading = true;
    if (!quiet && !hasToday()) h.status = 'loading';
    c.invalidate();
    const r = await api.getDaily({ groupRef: c.group.status === 'ok' ? c.group.groupRef : undefined });
    h.loading = false;
    if (r && r.ok) {
      absorb(r);
      h.status = 'ok';
    } else {
      const code = r && r.code;
      const net = !r || code === 'NETWORK' || code === 'TIMEOUT';
      h.status = net ? 'offline' : code === 'DAILY_UNAVAILABLE' ? 'unavailable' : 'error';
      track('error', { where: 'getDaily', code: code || 'none' });
    }
    c.invalidate();
  };

  h.onStart = function () {
    if (!S.howtoSeen) {
      h.sheet = 'howto';
      track('howto_view', { auto: true });
    }
  };

  h.onEnter = function () {
    h.sheet = null;
    // the server day moved on while we were on another screen
    if (S.daily && c.todayKey() !== S.daily.dateKey) h.refreshDaily();
  };

  h.onShow = function () {
    // the server day moved on (midnight) while we were away
    if (S.daily && c.todayKey() !== S.daily.dateKey) {
      if (c.screen === 'home') h.refreshDaily();
    } else if (c.screen === 'home' && S.daily) h.refreshDaily(true);
  };

  function primary() {
    const st = dailyState();
    if (st === 'available' || st === 'inProgress') return c.flows.card.startDaily();
    if (st === 'done') return c.flows.result.open(false);
    if (st === 'pendingSubmit') return c.flows.card.resumePending();
    if (st === 'error' || st === 'offline' || st === 'unavailable') return h.refreshDaily();
    return undefined;
  }

  h.hit = function (id) {
    switch (id) {
      case 'home:daily':
      case 'home:retry':
        return primary();
      case 'home:host':
        return c.flows.host.open();
      case 'home:archive':
        return c.flows.archive.open();
      case 'home:group':
      case 'home:groupBanner':
        return c.flows.boards.openGroup(false);
      case 'home:friend':
        return c.flows.boards.openFriend();
      case 'home:howto':
        h.sheet = 'howto';
        return track('howto_view', { auto: false });
      case 'home:settings':
        h.sheet = 'settings';
        return undefined;
      case 'home:sound':
      case 'settings:sound':
        S.muted = !S.muted;
        if (deps.audio) deps.audio.setMuted(S.muted);
        return c.store.save();
      case 'settings:large':
        S.largeText = !S.largeText;
        c.store.save();
        return track('display_setting', { largeText: S.largeText, highContrast: S.highContrast, source: 'settings' });
      case 'settings:contrast':
        S.highContrast = !S.highContrast;
        c.store.save();
        return track('display_setting', { largeText: S.largeText, highContrast: S.highContrast, source: 'settings' });
      case 'settings:openSetting':
        return privacy.openSetting();
      case 'settings:privacy':
        if (c.wx.openPrivacyContract) c.wx.openPrivacyContract({});
        return undefined;
      case 'settings:feedback':
        return undefined; // native overlay button, positioned by main.js
      case 'sheet:close':
        if (h.sheet === 'howto' && !S.howtoSeen) {
          S.howtoSeen = true;
          c.store.save();
        }
        h.sheet = null;
        return undefined;
    }
    return undefined;
  };

  h.animating = () => dailyState() === 'loading';

  h.vm = function (t) {
    const d = S.daily;
    const st = dailyState();
    const today = hasToday();
    const model = {
      state: st,
      issueNo: d ? d.issueNo : 0,
      dateKey: d ? d.dateKey : c.todayKey(),
      answered: today && d ? d.answered : 0,
      total: today && d ? d.total : null,
      final: false,
      yesterday: today && d ? d.yesterday : null,
      streak: d ? d.streak : null,
      group: { status: c.group.status === 'checking' ? 'checking' : c.group.status === 'ok' ? 'ok' : c.group.status === 'failed' ? 'failed' : 'none' },
      muted: S.muted,
      showHowToOnce: h.sheet === 'howto' && !S.howtoSeen,
      sheet: h.sheet,
      settings: h.sheet === 'settings' ? V.settingsVm(S, privacy.status()) : null,
      t,
    };
    if (today && d && d.complete && d.refs.every((x) => x !== null)) model.total = require('../../core/score').dayTotal(d.pos, d.refs);
    return V.homeVm(model, c.display(), c.featuresVm());
  };

  h.dailyState = dailyState;
  return h;
};
