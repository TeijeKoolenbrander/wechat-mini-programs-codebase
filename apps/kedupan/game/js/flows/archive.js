/**
 * Archive flow (spec 2.3, 6.9): the list of closed days, archive play (scored locally against the frozen
 * finals, unranked, stored on the device), the read-only review of a day played as the daily, and the
 * interstitial that may follow a completed set (only here, spec 9).
 */

const S_ = require('../../core/score');
const V = require('../vm');

module.exports = function createArchive(c) {
  const { S, api, ads, track } = c;
  const a = { state: 'loading', items: [], hasMore: false, bestStreak: 0, offlineNote: false, loadingMore: false };
  const d = { state: 'loading', dateKey: null, issueNo: null, kind: 'play', cards: [], finals: [], mine: null, done: false, sheet: null, distAd: 'idle', hist: null };
  const f = {};

  function localOf(dk) {
    return S.archive.results[dk] || null;
  }

  function applyPage(r, append) {
    const items = r.items.slice();
    a.items = append ? a.items.concat(items) : items;
    a.hasMore = !!r.hasMore;
    a.bestStreak = r.bestStreak || 0;
  }

  async function load(append) {
    if (!append) {
      a.state = 'loading';
      c.invalidate();
    }
    const before = append && a.items.length ? a.items[a.items.length - 1].dateKey : undefined;
    const r = await api.getArchive({ before, limit: 30 });
    a.loadingMore = false;
    if (r && r.ok) {
      applyPage(r, append);
      a.offlineNote = false;
      a.state = a.items.length ? 'ready' : 'empty';
      if (!append) {
        S.archive.page = { items: r.items, hasMore: r.hasMore, bestStreak: r.bestStreak || 0 };
        c.store.save();
      }
    } else if (!append) {
      const code = r && r.code;
      const net = !r || code === 'NETWORK' || code === 'TIMEOUT';
      if (S.archive.page) {
        applyPage(S.archive.page, false);
        a.offlineNote = true;
        a.state = a.items.length ? 'ready' : 'empty';
      } else a.state = net ? 'offline' : 'error';
      track('error', { where: 'getArchive', code: code || 'none' });
    }
    if (!append) track('archive_view', { items: a.items.length, state: a.state });
    c.invalidate();
  }

  f.open = function () {
    c.go('archive');
    return load(false);
  };

  /** Back to the list from card play without reloading. */
  f.reenter = function () {
    c.stack = [];
    c.screen = 'archive';
    c.invalidate();
  };

  // ---------------------------------------------------------------- opening a day

  async function openDay(dateKey) {
    const item = a.items.find((x) => x.dateKey === dateKey);
    const res = await api.getArchiveDay({ dateKey });
    if (!res || !res.ok) {
      track('error', { where: 'getArchiveDay', code: (res && res.code) || 'none' });
      return c.toast(res && res.code === 'DAY_OPEN' ? '这一期还没结束' : '这一期需要联网打开');
    }
    const local = localOf(dateKey);
    if (item && item.mine && res.mine) {
      // played as the daily: read-only review
      return showDay(res, 'review', { positions: res.mine.pos, total: res.mine.total, pct: res.mine.pct });
    }
    if (local) return showDay(res, 'review', { positions: local.positions, total: local.total, pct: null });
    return f.startPlay(res);
  }

  function showDay(res, kind, mine) {
    Object.assign(d, { state: 'ready', dateKey: res.dateKey, issueNo: res.issueNo, kind, cards: res.cards, finals: res.finals, mine, done: false, sheet: null, distAd: 'idle', hist: res.hist || null });
    c.go('archiveDay', { replace: c.screen === 'archiveDay' });
  }

  f.startPlay = function (res) {
    c.flows.card.startArchive(res);
  };

  // ---------------------------------------------------------------- finishing a set (called by the card flow)

  f.finishSet = function (card) {
    const positions = card.positions.slice(0, 5);
    const total = S_.dayTotal(positions, card.finals);
    S.archive.results[card.dateKey] = { total, positions, finals: card.finals.slice() };
    S.lifetimeSets++;
    c.sessionSets++;
    c.store.save();
    track('archive_set_complete', { dateKey: card.dateKey, total, setsThisSession: c.sessionSets });
    Object.assign(d, { state: 'ready', dateKey: card.dateKey, issueNo: card.issueNo, kind: 'play', cards: card.cards, finals: card.finals, mine: { positions, total, pct: null }, done: true, sheet: null, distAd: 'idle', hist: null });
    c.go('archiveDay', { replace: true });
  };

  function maybeInterstitial() {
    // never awaited: an ad can never delay navigation
    ads.interstitial({ setsThisSession: c.sessionSets, lifetimeSets: S.lifetimeSets });
  }

  function nextUnplayed() {
    return a.items.find((it) => it.dateKey !== d.dateKey && !it.mine && !localOf(it.dateKey));
  }

  async function distribution() {
    if (d.hist) {
      d.sheet = 'distribution';
      return;
    }
    if (d.distAd !== 'idle') return;
    d.distAd = 'loading';
    c.invalidate();
    const out = await ads.rewarded('distribution');
    if (out.toast) c.toast(out.toast);
    if (!out.granted) {
      d.distAd = 'idle';
      return;
    }
    const res = await api.unlockDistribution({ dateKey: d.dateKey });
    d.distAd = 'idle';
    if (res && res.ok) {
      d.hist = res.hist;
      track('distribution_unlock', { dateKey: d.dateKey, via: out.reason === 'noFillGrant' ? 'nofill' : 'ad' });
      d.sheet = 'distribution';
    } else c.toast('全国分布暂时打不开，稍后再试');
  }

  // ---------------------------------------------------------------- hits and view

  f.hit = function (id) {
    if (c.screen === 'archive') {
      if (id === 'back') return c.goHome();
      if (id === 'archive:retry') return load(false);
      if (id === 'archive:more') {
        if (a.loadingMore || !a.hasMore) return undefined;
        a.loadingMore = true;
        return load(true);
      }
      if (id.indexOf('archive:item:') === 0) return openDay(id.slice(13));
      return undefined;
    }
    // archiveDay
    if (d.sheet) {
      if (id === 'sheet:close' || id === 'back') d.sheet = null;
      return undefined;
    }
    switch (id) {
      case 'back':
      case 'archiveDay:list':
        if (d.done) maybeInterstitial();
        c.stack = [];
        c.screen = 'archive';
        return undefined;
      case 'archiveDay:next': {
        if (d.done) maybeInterstitial();
        const n = nextUnplayed();
        if (!n) {
          c.stack = [];
          c.screen = 'archive';
          return c.toast('已经玩遍啦，明天再来');
        }
        return openDay(n.dateKey);
      }
      case 'archiveDay:dist':
        return distribution();
    }
    return undefined;
  };

  f.drag = function () {};
  f.animating = () => (c.screen === 'archive' && a.state === 'loading') || (c.screen === 'archiveDay' && d.distAd === 'loading');
  f.bannerWant = () => (c.screen === 'archive' ? { screen: 'archive', state: a.state } : null);

  f.vm = function () {
    if (c.screen === 'archive') {
      const bw = V.bannerVm(c.features, a.state === 'ready' || a.state === 'empty');
      return V.archiveListVm(
        { state: a.state, bestStreak: a.bestStreak, hasMore: a.hasMore, items: a.items.map((it) => ({ dateKey: it.dateKey, issueNo: it.issueNo, mine: it.mine, local: !it.mine ? localOf(it.dateKey) : null })), banner: bw, offlineNote: a.offlineNote },
        c.display(),
        c.featuresVm()
      );
    }
    const unlockedHist = d.hist;
    return V.archiveDayVm(
      { state: d.state, dateKey: d.dateKey, issueNo: d.issueNo, kind: d.kind, cards: d.cards, finals: d.finals, mine: d.mine, done: d.done, dist: { unlocked: !!unlockedHist, hist: unlockedHist, adState: d.distAd === 'loading' ? 'loading' : 'idle' }, sheet: d.sheet, canNext: !!nextUnplayed() },
      c.display(),
      c.featuresVm()
    );
  };

  return f;
};
