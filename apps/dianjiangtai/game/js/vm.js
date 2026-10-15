/**
 * View-model builders (spec 13, plus the extra optional fields in
 * js/render/CONTRACT.md). Pure functions: plain data in, plain data out, so QA
 * can unit-test every screen state without a canvas.
 *
 * v1 additions (spec 13 "v1 additions"): display settings, seal descriptors,
 * 识人 hiding, streaks, history, banner reservation, save/subscribe states.
 */

const { SLOTS, fitOf } = require('../core/content');
const draft = require('../core/draft');
const { lineupDetail } = require('../core/score');
const { bandFor } = require('../core/config');
const { chanceText, LUCK } = require('./util');
const A = require('./core-adapter');

/** Shown when 复盘 or the opponent's lineup is sealed until today's daily is done (spoiler rule). */
const REPLAY_LOCKED_TEXT = '今日军令完成后可复盘';
const LINEUP_LOCKED_TEXT = '对方阵容 · 完成今日军令后可见';
const SHIREN_LABEL = '识人';
const SHIREN_COACH_TEXT = '识人军令：五德暂不显示，凭你对三国人物的了解点将。出征后揭晓。';
const SHIREN_DRAFT_TAG = '识人 · 五德出征后揭晓';
const BEST_LOCKED_TEXT = '今日军令结束后公布';
const STREAK_MIN = 2;
const HISTORY_MIN_RUNS = 30;

const BAND_SHARE_TEXT = (share, w) => (w >= 12 ? '今日仅 ' + (share * 100).toFixed(1) + '% 的主公一统天下' : '今日仅 ' + (share * 100).toFixed(1) + '% 的主公达到此战绩');

/** { current } -> { current, text } ('连续出征 N 天' only when N >= 2; no reward wording, spec 8.9). */
function streakVm(st) {
  const cur = st && st.current > 0 ? st.current : 0;
  return { current: cur, text: cur >= STREAK_MIN ? '连续出征 ' + cur + ' 天' : null };
}

/** Display settings shared by every screen (spec 13 v1, 8.10). */
function displayVm(d) {
  const largeText = !!(d && d.largeText);
  const highContrast = !!(d && d.highContrast);
  return { largeText, highContrast, scale: largeText ? 1.25 : 1, palette: highContrast ? 'highContrast' : 'standard' };
}

// ---------------------------------------------------------------- home

/**
 * daily: { state, issueNo, dateKey, round?, record?, bandLabel?, variant?, streak? }
 * opts: { hasGroupContext, muted, showHowToOnce, friendBoardEnabled, sheet, t, display, privacy, friendScope, album, scrollY, sheetScroll }
 */
function homeVm(daily, opts) {
  const d = { state: daily.state, issueNo: daily.issueNo, dateKey: daily.dateKey };
  if (daily.round !== undefined) d.round = daily.round;
  if (daily.record) d.record = daily.record;
  if (daily.bandLabel) d.bandLabel = daily.bandLabel;
  d.variant = daily.variant === 'shiren' ? 'shiren' : 'standard';
  d.variantLabel = d.variant === 'shiren' ? SHIREN_LABEL : null;
  d.streak = streakVm(daily.streak);
  const disp = opts.display || {};
  return {
    daily: d,
    nav: { historyEnabled: true },
    hasGroupContext: !!opts.hasGroupContext,
    muted: !!opts.muted,
    showHowToOnce: !!opts.showHowToOnce,
    settings: {
      friendBoardEnabled: !!opts.friendBoardEnabled,
      muted: !!opts.muted,
      largeText: !!disp.largeText,
      highContrast: !!disp.highContrast,
      privacy: opts.privacy || 'unknown',
      friendScope: opts.friendScope || 'unknown',
      album: opts.album || 'unknown',
    },
    sheet: opts.sheet || null,
    scrollY: opts.scrollY || 0,
    sheetScroll: opts.sheetScroll || 0,
    t: opts.t || 0,
  };
}

// ---------------------------------------------------------------- draft

/** Respin block (spec 13 `respin`). */
function respinVm(run, adState) {
  const f = draft.respinInfo(run, 'faction');
  const e = draft.respinInfo(run, 'era');
  const adLeft = Math.max(0, run.allowance.ad - run.adUsed);
  return {
    faction: { free: run.free.faction ? 0 : 1, enabled: f.enabled && !run.free.faction, hint: f.hint },
    era: { free: run.free.era ? 0 : 1, enabled: e.enabled && !run.free.era, hint: e.hint },
    adLeft,
    adAllowed: run.mode === 'free' && run.allowance.ad > 0 && adLeft > 0,
    adState: adState || 'idle',
  };
}

/** Lineup rows. hidden (识人): no score or fit until the verdict. */
function lineupVm(run, hidden) {
  const content = run.content;
  const fac = A.draftedFactions(run);
  return lineupDetail(content, draft.lineupOf(run).filter((e) => e.generalId)).map((e) => {
    const label = content.roleByKey[e.slot].label;
    return {
      slot: e.slot,
      label,
      generalId: e.generalId,
      name: e.name,
      factionKey: e.generalId ? fac[e.slot] || null : null,
      score: hidden ? null : e.score,
      fit: hidden ? null : e.fit,
    };
  });
}

function poolRow(content, g, factionKey, hidden, drafted) {
  return {
    id: g.id,
    name: g.name,
    courtesy: g.courtesy || '',
    monogram: g.monogram,
    portraitUrl: null,
    seal: A.sealOf(content, g.id, { factionKey, hidden }),
    blurb: g.blurb,
    appearanceNote: A.appearanceNote(g, factionKey, content),
    tier: hidden ? null : g.tier,
    stats: hidden ? null : Object.assign({}, g.stats),
    drafted: !!drafted,
  };
}

/**
 * Draft view model.
 * ui = { selectedId, poolScroll, flip, coach, adState, t, hidden, roundFetch, shirenCoach, display }
 */
function draftVm(run, ui) {
  ui = ui || {};
  const hidden = !!ui.hidden;
  const content = run.content;
  const complete = draft.isComplete(run);
  let phase = run.phase;
  if (phase === 'flipped') phase = ui.selectedId ? 'selecting' : 'flipped';
  else if (phase === 'placed') phase = complete ? 'readyToMarch' : 'placed';
  const roundFetch = ui.roundFetch || 'idle';

  const fk = run.token ? run.token.faction : null;
  const pool = draft.currentPool(run).map((gi) => poolRow(content, content.generals[gi], fk, hidden, false));
  // drafted elsewhere (PO-2): dimmed rows after the pool, unselectable
  for (const gi of A.draftedInCell(run)) pool.push(poolRow(content, content.generals[gi], fk, hidden, true));

  let selected = null;
  if (ui.selectedId && content.byId[ui.selectedId] && run.phase === 'flipped') {
    const g = content.byId[ui.selectedId];
    const gi = content.indexOf[g.id];
    const slotOptions = [];
    SLOTS.forEach((s, k) => {
      if (run.slots[s]) return;
      const score = content.roleScores[gi][k];
      slotOptions.push({ slot: s, label: content.roleByKey[s].label, score: hidden ? null : Math.round(score * 10) / 10, fit: hidden ? null : fitOf(score) });
    });
    selected = {
      generalId: g.id,
      name: g.name,
      courtesy: g.courtesy || '',
      seal: A.sealOf(content, g.id, { factionKey: g.faction, hidden, size: 96 }),
      blurb: g.blurb,
      statNote: hidden ? null : g.statNote,
      appearanceNote: A.appearanceNote(g, fk, content),
      tier: hidden ? null : g.tier,
      stats: hidden ? null : Object.assign({}, g.stats),
      slotOptions,
    };
  }

  const tokens = run.token
    ? {
        faction: { key: run.token.faction, label: content.factionByKey[run.token.faction].label, color: content.factionByKey[run.token.faction].color },
        era: { key: run.token.era, label: content.eraByKey[run.token.era].label },
      }
    : null;

  const last = run.round === 5 ? '出征' : '下一轮';
  const primaryLabel = roundFetch === 'loading' ? '翻令中…' : phase === 'awaitFlip' ? '翻令' : last;
  let notice = null;
  for (let i = run.log.length - 1; i >= 0; i--) {
    if (run.log[i].round === run.round) {
      notice = run.phase === 'flipped' ? run.log[i].text : null;
      break;
    }
  }

  return {
    mode: run.mode,
    round: run.round,
    phase,
    hidden,
    variantLabel: hidden ? SHIREN_LABEL : null,
    headerTag: hidden ? SHIREN_DRAFT_TAG : null,
    shirenCoach: hidden && ui.shirenCoach ? SHIREN_COACH_TEXT : null,
    roundFetch,
    roundFetchText: roundFetch === 'failed' ? '令牌传递中断' : null,
    tokens,
    respin: respinVm(run, ui.adState),
    pool,
    poolTotal: A.poolTotal(run),
    selected,
    lineup: lineupVm(run, hidden),
    canUndo: run.phase === 'placed',
    primaryLabel,
    primaryDisabled: roundFetch === 'loading',
    poolScroll: ui.poolScroll || 0,
    sheetScroll: ui.sheetScroll || 0,
    flip: ui.flip === undefined ? (run.phase === 'awaitFlip' ? 0 : 1) : ui.flip,
    notice,
    coach: ui.coach || 0,
    t: ui.t || 0,
  };
}

// ---------------------------------------------------------------- result

function moraleVm(m) {
  return { total: m.total, lord: m.lord, bonds: m.bonds.map((b, i) => b + ' +' + (m.bondBonus / Math.max(1, m.bonds.length)).toFixed(2)), cohesion: m.cohesion };
}

/** Result lineup rows. During the 识人 reveal, slots not yet revealed carry no stats, tier, score or fit. */
function resultLineup(res, content, revealedCount) {
  const hiddenRun = !!res.shiren;
  return (res.lineupDetail || []).map((e, idx) => {
    const shown = !hiddenRun || idx < revealedCount;
    const row = { slot: e.slot, name: e.name, score: shown ? e.score : null, fit: shown ? e.fit : null };
    if (content && e.generalId && content.byId[e.generalId]) {
      const g = content.byId[e.generalId];
      const fk = (res.lineupFac && res.lineupFac[e.slot]) || g.faction;
      row.label = content.roleByKey[e.slot].label;
      row.factionKey = fk;
      row.monogram = g.monogram;
      row.seal = A.sealOf(content, g.id, { factionKey: fk, hidden: !shown });
      row.tier = shown ? g.tier : null;
      row.stats = shown ? Object.assign({}, g.stats) : null;
      row.revealed = shown;
    }
    return row;
  });
}

/**
 * res: the controller's result object (see controller).
 * ui: { revealCount, stampT, scrollY, sheet, sheetScroll, replayAdState, replayLocked, t, content }
 */
function resultVm(res, ui) {
  ui = ui || {};
  const content = ui.content || null;
  const rv = res.reveal || null;
  const pending = !!(rv && rv.pending);
  const step = rv ? rv.step : 5;
  const out = {
    mode: res.mode,
    status: res.status,
    variantLabel: res.shiren ? SHIREN_LABEL : null,
    reveal: res.shiren ? { pending, step } : null,
    record: res.record || { w: 0, l: 0 },
    band: res.band || { key: '', label: '' },
    comment: res.comment || '',
    rarityText: res.rarityText || null,
    streak: res.ranked && res.mode !== 'free' ? streakVm(res.streak) : null,
    battles: (res.battles || []).map((b) => ({
      i: b.i,
      typeLabel: b.typeLabel,
      win: b.win,
      chanceText: '胜算' + chanceText(b.p),
      luckText: '天时' + LUCK[b.luck],
      cause: b.cause,
      event: b.event || null,
    })),
    lineup: resultLineup(res, content, step),
    morale: res.morale && !pending ? moraleVm(res.morale) : { total: 0, lord: 0, bonds: [], cohesion: 0 },
    replay: { unlocked: !!(res.replay && res.replay.unlocked), adState: ui.replayAdState || 'idle', locked: !!ui.replayLocked, lockedText: ui.replayLocked ? REPLAY_LOCKED_TEXT : null },
    interstitialDue: !!res.interstitialDue,
    saveImage: { state: res.saveState || 'idle' },
    subscribe: { state: (res.subscribe && res.subscribe.state) || 'hidden', challengeId: (res.subscribe && res.subscribe.challengeId) || null },
    revealCount: ui.revealCount === undefined ? 12 : ui.revealCount,
    stampT: ui.stampT === undefined ? 1 : ui.stampT,
    scrollY: ui.scrollY || 0,
    sheet: pending ? null : ui.sheet || null,
    sheetScroll: ui.sheetScroll || 0,
    privacyNote: !!res.privacyNote,
    boardLabel: res.boardLabel || '看群榜/好友榜',
    t: ui.t || 0,
  };
  if (res.replay && res.replay.best) out.replay.best = res.replay.best;
  if (res.challenge) {
    out.challenge = { theirRecord: res.challenge.theirRecord, theirLineup: res.challenge.theirLineup || null };
    if (res.challenge.lineupLocked) {
      out.challenge.theirLineup = null;
      out.challenge.lineupLocked = true;
      out.challenge.lockedText = LINEUP_LOCKED_TEXT;
    }
  }
  return out;
}

/** Rarity line (7.5): daily from the server share (hidden under 30 runs), free from the tool's distribution. */
function rarityText(res, config) {
  if (res.mode === 'free') {
    const share = config.freeRarity[res.record.w];
    return share === undefined ? null : '约 ' + Math.max(0.1, Math.round(share * 1000) / 10) + '% 的阵容能达到';
  }
  // server contract (submitRun.rarity): { pct: percent at or better with one decimal, total }, null under 30 runs.
  // `share` (a 0..1 fraction) is accepted too.
  const rr = res.rarity;
  if (rr && rr.pct !== null && rr.pct !== undefined) return BAND_SHARE_TEXT(rr.pct / 100, res.record.w);
  if (rr && rr.share !== null && rr.share !== undefined) return BAND_SHARE_TEXT(rr.share, res.record.w);
  return null;
}

// ---------------------------------------------------------------- challenge

function challengeVm(c, t) {
  const out = {
    status: c.status,
    variantLabel: c.variant === 'shiren' ? SHIREN_LABEL : null,
    theirRecord: c.theirRecord || { w: 0, l: 0 },
    mode: c.mode || 'daily',
    countsAsDaily: !!c.countsAsDaily,
    isFriendly: !!c.isFriendly,
    t: t || 0,
  };
  if (c.status === 'own') out.subscribe = { state: c.subscribeState || 'hidden' };
  if (c.answerCount !== undefined) out.answerCount = c.answerCount;
  if (c.bestRecord) out.bestRecord = c.bestRecord;
  if (c.lineupLocked) {
    out.lineupLocked = true;
    out.lockedText = LINEUP_LOCKED_TEXT;
  }
  return out;
}

// ---------------------------------------------------------------- boards

/** b.banner: { show, reservedHeight, stub } (spec 12: board ready/empty only, config-driven) */
function boardVm(b) {
  const banner = b.banner || { show: false, reservedHeight: 0 };
  return {
    kind: b.kind,
    dateKey: b.dateKey,
    issueNo: b.issueNo,
    variantLabel: b.variant === 'shiren' ? SHIREN_LABEL : null,
    state: b.state,
    mode: b.mode || null,
    viewerPlayed: !!b.viewerPlayed,
    self: b.self || { record: null, bandLabel: null },
    actions: {
      canOpenSetting: b.state === 'unauthorized',
      canRetryPrivacy: b.state === 'privacyDenied',
      canShareToGroup: b.state === 'noGroup' || b.state === 'empty' || b.state === 'ready',
    },
    banner: { show: !!banner.show, reservedHeight: banner.show ? banner.reservedHeight || 0 : 0, stub: !!banner.stub },
    sharedCanvas: b.state === 'ready' ? b.sharedCanvas || null : null,
    t: b.t || 0,
  };
}

/** Main domain -> open data domain message (13). Rows may carry the server streak k as the 5th element. */
function boardMessage(kind, payload, extra) {
  const { content, groupRef, shareTicket, groupid, board, dpr, showUnverified, display } = extra;
  const msg = {
    type: 'render',
    kind,
    dateKey: payload.dateKey,
    issueNo: payload.issueNo,
    variant: payload.variant === 'shiren' ? 'shiren' : 'standard',
    contentVersion: payload.contentVersion,
    salt: payload.salt,
    selfHash: payload.selfHash,
    mode: payload.mode,
    viewerPlayed: payload.viewerPlayed,
    rows: payload.rows,
    showUnverified: !!showUnverified,
    width: board.w,
    height: board.h,
    dpr: dpr || 1,
    roster: content.generals.map((g) => [g.monogram, g.faction, g.tier]),
    display: { largeText: !!(display && display.largeText), highContrast: !!(display && display.highContrast) },
  };
  if (kind === 'group') {
    if (groupid) msg.groupid = groupid;
    else if (shareTicket) msg.shareTicket = shareTicket;
  }
  void groupRef;
  return msg;
}

// ---------------------------------------------------------------- history (spec 8.9)

function dateText(dateKey) {
  return +dateKey.slice(4, 6) + '月' + +dateKey.slice(6, 8) + '日';
}

/** list: { state, items?, bestStreak? } as built by the controller from getHistory. */
function historyVm(h, ctx) {
  const { config, todayKey } = ctx;
  const items = (h.items || []).map((it) => ({
    dateKey: it.dateKey,
    issueNo: it.issueNo,
    dateText: dateText(it.dateKey),
    variantLabel: it.variant === 'shiren' ? SHIREN_LABEL : null,
    mine: it.mine ? { record: { w: it.mine.w, l: it.mine.l }, bandLabel: bandFor(config, it.mine.w).label } : null,
    isToday: it.dateKey === todayKey,
    statusText: it.dateKey === todayKey ? '进行中' : null,
  }));
  return {
    state: h.state,
    bestStreakText: h.bestStreak >= STREAK_MIN ? '最长连续出征 ' + h.bestStreak + ' 天' : null,
    items,
    scrollY: h.scroll || 0,
    t: ctx.t || 0,
  };
}

function thousands(n) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** withStats: 识人 days show the five stats in the archive (the day is over for this player, spec 8.9); other days show names and seals only. */
function lineupFromIdx(content, idx, fac, hidden, withStats) {
  return SLOTS.map((slot, k) => {
    const g = content.generals[idx[k]];
    if (!g) return { slot, label: content.roleByKey[slot].label, name: '', seal: null, tier: null, stats: null };
    const fk = (fac && fac[k]) || g.faction;
    return {
      slot,
      label: content.roleByKey[slot].label,
      name: g.name,
      seal: A.sealOf(content, g.id, { factionKey: fk, hidden: !!hidden }),
      tier: g.tier,
      stats: withStats ? Object.assign({}, g.stats) : null,
    };
  });
}

/** Issue detail (spec 8.9): the player's lineup, the distribution (>= 30 runs), the best lineup after D+1 00:30. */
function historyIssueVm(item, ctx) {
  const { content, config, windowClosed } = ctx;
  if (!item) return { state: ctx.state || 'error', dateKey: null, issueNo: 0, variantLabel: null, mine: null, stats: null, best: null, bestLockedText: null, scrollY: 0, t: ctx.t || 0 };
  const mine = item.mine
    ? { record: { w: item.mine.w, l: item.mine.l }, bandLabel: bandFor(config, item.mine.w).label, lineup: lineupFromIdx(content, item.mine.lineupIdx || [], item.mine.lineupFac, false, item.variant === 'shiren') }
    : null;
  let stats = null;
  if (item.hist && item.total >= HISTORY_MIN_RUNS) {
    stats = {
      totalText: '共 ' + thousands(item.total) + ' 人出征',
      bands: config.bands.map((b) => {
        let n = 0;
        for (let w = b.min; w <= b.max; w++) n += item.hist[w] || 0;
        return { label: b.label, shareText: (Math.round((n / item.total) * 1000) / 10).toFixed(1) + '%' };
      }),
    };
  }
  const best = item.best ? { record: item.best.record, lineup: lineupFromIdx(content, item.best.lineupIdx, item.best.lineupFac || null, false, false).map((e) => ({ slot: e.slot, label: e.label, name: e.name, seal: e.seal })) } : null;
  return {
    state: 'ready',
    dateKey: item.dateKey,
    issueNo: item.issueNo,
    variantLabel: item.variant === 'shiren' ? SHIREN_LABEL : null,
    mine,
    stats,
    best,
    bestLockedText: best || windowClosed ? null : BEST_LOCKED_TEXT,
    scrollY: ctx.scroll || 0,
    t: ctx.t || 0,
  };
}

/** Share card view model (shareCard contract). Daily cards carry no general names (D4). Tiles use the drafted cell's faction. */
function cardVm(res, content) {
  const detail = res.lineupDetail || [];
  return {
    mode: res.mode === 'daily' ? 'daily' : 'free',
    issueNo: res.issueNo,
    variantLabel: res.shiren ? SHIREN_LABEL : null,
    footer: '微信小游戏 · 点将台',
    record: res.record,
    bandLabel: res.band ? res.band.label : '',
    lineup: detail.map((e) => {
      const g = content.byId[e.generalId];
      const fk = (res.lineupFac && res.lineupFac[e.slot]) || g.faction;
      const f = content.factionByKey[fk];
      const era = content.eraByKey[g.eras[0]];
      return {
        slotLabel: content.roleByKey[e.slot].label,
        name: res.mode === 'daily' ? '' : g.name,
        monogram: res.mode === 'daily' ? '' : g.monogram,
        faction: fk,
        factionLabel: f.label,
        sub: res.mode === 'daily' ? '' : f.label + ' · ' + era.label,
      };
    }),
    battles: (res.battles || []).map((b) => !!b.win),
  };
}

module.exports = {
  REPLAY_LOCKED_TEXT,
  LINEUP_LOCKED_TEXT,
  SHIREN_COACH_TEXT,
  SHIREN_DRAFT_TAG,
  BEST_LOCKED_TEXT,
  homeVm,
  draftVm,
  resultVm,
  challengeVm,
  boardVm,
  boardMessage,
  cardVm,
  rarityText,
  respinVm,
  lineupVm,
  moraleVm,
  streakVm,
  displayVm,
  historyVm,
  historyIssueVm,
  dateText,
};
