/**
 * Day result flow (spec 2.1 step 7, 6.4): live total, the 5 mini rulers, share, rewarded 加一题 and 全国分布.
 * No interstitial or banner ever appears here (spec 9).
 */

const S_ = require('../../core/score');
const { dateKeyToMs, DAY_MS } = require('../../core/date');
const V = require('../vm');
const Sh = require('../share');

module.exports = function createResult(c) {
  const { S, api, ads, track } = c;
  const r = { sheet: null, bonusAd: 'idle', distAd: 'idle', group: null, stale: false, bonusGrant: false, open_: false };
  const f = {};

  const closeMs = (dk) => dateKeyToMs(dk) + DAY_MS + c.config.daily.graceMs;
  const bonusLeft = () => {
    if (S.bonus.day !== c.todayKey()) return c.config.extras.bonusPerDay;
    return Math.max(0, c.config.extras.bonusPerDay - S.bonus.used);
  };

  function complete() {
    const d = S.daily;
    return !!d && d.complete && d.refs.every((x) => x !== null);
  }

  async function loadGroup() {
    r.group = null;
    if (c.group.status !== 'ok') return;
    const d = S.daily;
    const g = await api.getGroupDay({ groupRef: c.group.groupRef, dateKey: d.dateKey });
    if (!g || !g.ok || !g.viewerDone) return;
    const me = g.rows.find((row) => row[0] === g.selfHash);
    r.group = { gs: me ? me[1] : null, mq: g.mq, n: g.n };
  }

  async function refresh() {
    const res = await api.getDaily({ groupRef: c.group.status === 'ok' ? c.group.groupRef : undefined });
    if (res && res.ok) {
      c.flows.home.absorb(res);
      r.stale = false;
      await loadGroup();
    } else r.stale = true;
    c.invalidate();
  }

  /**
   * Open the day result. first = reached by finishing card 5 (the 看结果 tap): this is where the marker write happens.
   * quiet = coming back from a bonus card: refresh, but do not count another daily_result_view.
   */
  f.open = async function (first, quiet) {
    if (!complete()) return c.goHome();
    const d = S.daily;
    c.go('result', { replace: c.screen === 'card' || c.screen === 'result' });
    r.sheet = null;
    r.bonusAd = 'idle';
    r.distAd = 'idle';
    r.stale = false;
    if (!quiet) {
      track('daily_result_view', { dateKey: d.dateKey, final: c.serverNow() >= closeMs(d.dateKey) });
      c.analytics.flush();
    }
    if (first && S.markerDay !== d.dateKey) c.privacy.writeMarker(d.dateKey, d.total).then(() => c.invalidate());
    await refresh();
    return undefined;
  };

  function cardVm() {
    const d = S.daily;
    const rows = d.cards.map((card, i) => ({ prompt: card.prompt, left: card.left, right: card.right, label: S_.labelFor(Math.abs(d.pos[i] - d.refs[i])).label }));
    const total = S_.dayTotal(d.pos, d.refs);
    return Sh.dailyCardVm(d.issueNo, rows, total, S_.bandFor(total).label);
  }

  f.shareContext = function () {
    if (c.screen !== 'result' || !complete()) return null;
    const d = S.daily;
    return { kind: 'daily', dateKey: d.dateKey, card1: d.cards[0], total: S_.dayTotal(d.pos, d.refs), card: cardVm() };
  };

  async function bonus() {
    if (r.bonusAd !== 'idle') return;
    if (bonusLeft() <= 0) return c.toast('今天的加一题用完了');
    r.bonusAd = 'loading';
    c.invalidate();
    if (!r.bonusGrant) {
      const out = await ads.rewarded('bonus');
      if (out.toast) c.toast(out.toast);
      if (!out.granted) {
        r.bonusAd = 'idle';
        return;
      }
      r.bonusGrant = true;
    }
    const res = await api.getBonusCard({});
    r.bonusAd = 'idle';
    if (res && res.ok) {
      r.bonusGrant = false;
      if (S.bonus.day !== c.todayKey()) S.bonus = { day: c.todayKey(), used: 0 };
      S.bonus.used++;
      c.store.save();
      return c.flows.card.startBonus(res.card, res.final, res.dateKey);
    }
    if (res && res.code === 'RATE_LIMITED') {
      r.bonusGrant = false;
      S.bonus = { day: c.todayKey(), used: c.config.extras.bonusPerDay };
      c.store.save();
      return c.toast('今天的加一题用完了');
    }
    if (res && res.code === 'NO_CARD') {
      r.bonusGrant = false;
      return c.toast('暂时没有可加的题，明天再来');
    }
    track('error', { where: 'getBonusCard', code: (res && res.code) || 'none' });
    return c.toast('加一题暂时取不到，再点一次重试');
  }

  async function distribution() {
    const d = S.daily;
    if (S.dist[d.dateKey]) {
      r.sheet = 'distribution';
      return;
    }
    if (r.distAd !== 'idle') return;
    r.distAd = 'loading';
    c.invalidate();
    const out = await ads.rewarded('distribution');
    if (out.toast) c.toast(out.toast);
    if (!out.granted) {
      r.distAd = 'idle';
      return;
    }
    const res = await api.unlockDistribution({ dateKey: d.dateKey });
    r.distAd = 'idle';
    if (res && res.ok) {
      S.dist[d.dateKey] = { hist: res.hist };
      c.store.save();
      track('distribution_unlock', { dateKey: d.dateKey, via: out.reason === 'noFillGrant' ? 'nofill' : 'ad' });
      r.sheet = 'distribution';
    } else c.toast('全国分布暂时打不开，稍后再试');
  }

  f.hit = function (id) {
    if (r.sheet) {
      if (id === 'sheet:close' || id === 'back') r.sheet = null;
      return undefined;
    }
    switch (id) {
      case 'back':
        return c.goHome();
      case 'result:share': {
        const ctx = f.shareContext();
        if (ctx) c.share.shareDaily(ctx);
        return undefined;
      }
      case 'result:group':
        return c.flows.boards.openGroup(false);
      case 'result:friend':
        return c.flows.boards.openFriend();
      case 'result:bonus':
        return bonus();
      case 'result:dist':
        return distribution();
      case 'result:host':
        return c.flows.host.open();
      case 'result:archive':
        return c.flows.archive.open();
      case 'result:retry':
        return refresh();
    }
    return undefined;
  };

  f.animating = () => r.bonusAd === 'loading' || r.distAd === 'loading';

  f.vm = function () {
    const d = S.daily;
    if (!complete()) return c.flows.home.vm(c.now());
    const final = c.serverNow() >= closeMs(d.dateKey);
    const dist = S.dist[d.dateKey];
    return V.resultVm(
      {
        issueNo: d.issueNo,
        final,
        cards: d.cards,
        pos: d.pos,
        refs: d.refs,
        pct: final && d.yesterday && d.yesterday.dateKey === d.dateKey ? d.yesterday.pct : null,
        divisiveIdx: d.divisiveIdx,
        streak: d.streak,
        group: r.group,
        bonus: { left: bonusLeft(), adState: r.bonusAd === 'loading' ? 'loading' : 'idle' },
        distribution: { unlocked: !!dist, hist: dist && dist.hist, adState: r.distAd === 'loading' ? 'loading' : 'idle' },
        sheet: r.sheet,
        stale: r.stale,
      },
      c.display(),
      c.featuresVm()
    );
  };

  return f;
};
