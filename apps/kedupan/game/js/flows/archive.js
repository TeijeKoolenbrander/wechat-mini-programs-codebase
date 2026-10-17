/**
 * 往期刻度 (spec 2.3, 6.9, PD-10, AC 36-38, 59): the list of closed days, a read-only review of a day played as the
 * daily, archive play (5 cards scored LOCALLY against the server's frozen finals: unranked, device-only, never a board
 * or a streak), the set end, and the interstitial decision on 再来一期 / 返回列表.
 */

const S = require('../../core/score');

module.exports = function install(K) {
  const { st, store, api, ruler, ads } = K;
  const a = st.arch;

  // ---- list ------------------------------------------------------------------------------------------------------------------------

  K.openArchive = function openArchive() {
    st.play = null;
    ruler.reset();
    a.view = 'list';
    const tok = K.go('archive');
    return loadList(false, tok);
  };

  async function loadList(more, tok) {
    if (!more) {
      a.state = 'loading';
      a.offline = false;
    }
    K.invalidate();
    const before = more && a.items.length ? a.items[a.items.length - 1].dateKey : null;
    const r = await api.getArchive(before ? { before, limit: 30 } : { limit: 30 });
    if (!K.live(tok)) return;
    if (r.ok) {
      a.items = more ? a.items.concat(r.items) : r.items;
      a.hasMore = r.hasMore;
      a.bestStreak = r.bestStreak;
      a.state = a.items.length ? 'ready' : 'empty';
      a.offline = false;
      if (!more) {
        store.state.archiveCache = { items: r.items.map((x) => ({ dateKey: x.dateKey, issueNo: x.issueNo, mine: x.mine })), bestStreak: r.bestStreak, hasMore: r.hasMore, at: K.now() };
        store.save();
      }
    } else if (more) {
      K.toast(K.copy(r.code, 'getArchive'));
    } else {
      K.track('error', { where: 'getArchive', code: r.code || 'unknown' });
      const c = store.state.archiveCache;
      if (c && c.items.length) {
        a.items = c.items.slice();
        a.hasMore = false; // the cached page only
        a.bestStreak = c.bestStreak;
        a.state = 'ready';
        a.offline = true;
      } else {
        a.items = [];
        a.state = K.isNet(r.code) ? 'offline' : 'error';
      }
    }
    K.track('archive_view', { items: a.items.length, state: a.state });
    K.invalidate();
    K.syncBanner();
  }

  K.on('archive:back', () => {
    if (a.view === 'end') return backToList(true);
    K.goHome();
  });
  K.on('archive:retry', () => loadList(false, st.nav));
  K.on('archive:more', () => loadList(true, st.nav));
  K.on('archive:list', () => {});
  K.onPrefix('archive:item:', (dateKey) => openDay(dateKey));

  // ---- a day: review or play -------------------------------------------------------------------------------------------------------

  async function openDay(dateKey) {
    const item = a.items.find((x) => x.dateKey === dateKey);
    if (item && item.mine) return openReview(dateKey);
    const tok = st.nav;
    const r = await api.getArchiveDay({ dateKey });
    if (!K.live(tok)) return;
    if (!r.ok) return K.toast(r.code === 'DAY_OPEN' ? K.copy('DAY_OPEN') : '往期需联网查看');
    if (r.mine && r.mine.complete) {
      showReview(dateKey, r);
      return;
    }
    startPlay(r);
  }
  K.openArchiveDay = openDay;

  function showReview(dateKey, r) {
    a.view = 'review';
    a.review = { state: 'ready', dateKey, data: r };
    K.go('archive');
    K.invalidate();
  }

  async function openReview(dateKey) {
    a.view = 'review';
    a.review = { state: 'loading', dateKey, data: null };
    const tok = K.go('archive');
    const r = await api.getArchiveDay({ dateKey });
    if (!K.live(tok)) return;
    if (r.ok && r.mine && r.mine.complete) a.review = { state: 'ready', dateKey, data: r };
    else if (r.ok) {
      startPlay(r); // the day turned out to be unplayed (partial): play it
      return;
    } else a.review = { state: 'error', dateKey, data: null };
    K.invalidate();
  }

  K.on('review:back', () => backToList(false));
  K.on('review:retry', () => openReview(a.review.dateKey));
  K.on('review:scroll', () => {});
  K.on('review:distribution', () => K.distributionTap(a.review.dateKey));

  function startPlay(r) {
    ruler.reset();
    a.view = 'list';
    st.play = K.newPlay({ mode: 'archive', dateKey: r.dateKey, issueNo: r.issueNo, cards: r.cards, finals: r.finals, idx: 0, positions: [] });
    K.go('card');
  }

  // ---- local confirm (archive and bonus) ---------------------------------------------------------------------------------------------

  K.confirmLocal = function confirmLocal(p) {
    const i = p.mode === 'bonus' ? 0 : p.idx;
    const pos = ruler.pos;
    const ref = p.finals[i];
    const sc = S.scoreAt(pos, ref);
    p.pos = pos;
    if (p.mode === 'archive') p.positions[p.idx] = pos;
    K.presentReveal(p, { pos, ref, n: 0, agreePct: null, group: null, frozen: true }, true);
    if (p.mode === 'bonus') K.track('bonus_card', { itemId: p.cards[0].itemId, score: sc.score });
  };

  K.archiveNext = function archiveNext(p) {
    if (p.idx < 4) {
      ruler.reset();
      p.idx += 1;
      p.pos = null;
      p.phase = 'empty';
      p.reveal = null;
      p.confetti = null;
      K.invalidate();
      return;
    }
    finishSet(p);
  };

  // ---- set end ---------------------------------------------------------------------------------------------------------------------------

  function nextUnplayed(dateKey) {
    const plays = store.state.archivePlays;
    const it = a.items.find((x) => x.dateKey !== dateKey && !x.mine && !plays[x.dateKey]);
    return it ? it.dateKey : null;
  }

  function finishSet(p) {
    const t = S.dailyTotal(p.positions, p.finals);
    const plays = store.state.archivePlays;
    plays[p.dateKey] = { total: t.total, positions: p.positions.slice(), at: K.srvNow() };
    const keys = Object.keys(plays);
    if (keys.length > 400) keys.sort().slice(0, keys.length - 400).forEach((k) => delete plays[k]);
    p.cards.forEach((c) => K.rememberItem(c.itemId));
    store.state.lifetimeSets += 1;
    store.save();
    a.sessionSets += 1;
    K.track('archive_set_complete', { dateKey: p.dateKey, total: t.total, setsThisSession: a.sessionSets });
    a.end = { dateKey: p.dateKey, issueNo: p.issueNo, cards: p.cards, finals: p.finals, positions: p.positions.slice(), scores: t.scores, total: t.total, nextDateKey: nextUnplayed(p.dateKey), adHandled: false };
    a.view = 'end';
    st.play = null;
    ruler.reset();
    K.go('archive');
  }

  /** Decide and fire the interstitial for the set that just ended; never awaited, never delays navigation (spec 9). */
  function interstitialForEnd() {
    const e = a.end;
    if (!e || e.adHandled) return;
    e.adHandled = true;
    ads.interstitial(a.sessionSets);
  }

  function backToList(withAd) {
    if (withAd) interstitialForEnd();
    a.view = 'list';
    const tok = K.go('archive');
    return loadList(false, tok);
  }

  K.on('archive:backList', () => backToList(true));
  K.on('archive:again', () => {
    const e = a.end;
    if (!e || !e.nextDateKey) return;
    interstitialForEnd();
    const key = e.nextDateKey;
    openDay(key);
  });
  K.on('archive:distribution', () => a.end && K.distributionTap(a.end.dateKey));
};
