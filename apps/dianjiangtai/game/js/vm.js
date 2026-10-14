/**
 * View-model builders (spec 13, plus the extra optional fields in
 * js/render/CONTRACT.md). Pure functions: plain data in, plain data out, so QA
 * can unit-test every screen state without a canvas.
 */

const { SLOTS, fitOf } = require('../core/content');
const draft = require('../core/draft');
const { lineupDetail } = require('../core/score');
const { chanceText, LUCK } = require('./util');

const BAND_SHARE_TEXT = (share, w) => (w >= 12 ? '今日仅 ' + (share * 100).toFixed(1) + '% 的主公一统天下' : '今日仅 ' + (share * 100).toFixed(1) + '% 的主公达到此战绩');

// ---------------------------------------------------------------- home

/**
 * daily: { state, issueNo, dateKey, round?, record?, bandLabel? }
 * opts: { hasGroupContext, muted, showHowToOnce, friendBoardEnabled, sheet, t }
 */
function homeVm(daily, opts) {
  const d = { state: daily.state, issueNo: daily.issueNo, dateKey: daily.dateKey };
  if (daily.round !== undefined) d.round = daily.round;
  if (daily.record) d.record = daily.record;
  if (daily.bandLabel) d.bandLabel = daily.bandLabel;
  return {
    daily: d,
    hasGroupContext: !!opts.hasGroupContext,
    muted: !!opts.muted,
    showHowToOnce: !!opts.showHowToOnce,
    settings: { friendBoardEnabled: !!opts.friendBoardEnabled },
    sheet: opts.sheet || null,
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

function lineupVm(run) {
  const content = run.content;
  return lineupDetail(content, draft.lineupOf(run).filter((e) => e.generalId)).map((e) => {
    const label = content.roleByKey[e.slot].label;
    return { slot: e.slot, label, generalId: e.generalId, name: e.name, score: e.score, fit: e.fit };
  });
}

/** Draft view model. ui = { selectedId, poolScroll, flip, coach, adState, t } */
function draftVm(run, ui) {
  ui = ui || {};
  const content = run.content;
  const complete = draft.isComplete(run);
  let phase = run.phase;
  if (phase === 'flipped') phase = ui.selectedId ? 'selecting' : 'flipped';
  else if (phase === 'placed') phase = complete ? 'readyToMarch' : 'placed';

  const pool = draft.currentPool(run).map((gi) => {
    const g = content.generals[gi];
    return { id: g.id, name: g.name, monogram: g.monogram, portraitUrl: null, tier: g.tier, stats: Object.assign({}, g.stats), drafted: false };
  });

  let selected = null;
  if (ui.selectedId && content.byId[ui.selectedId] && run.phase === 'flipped') {
    const g = content.byId[ui.selectedId];
    const gi = content.indexOf[g.id];
    const slotOptions = [];
    SLOTS.forEach((s, k) => {
      if (run.slots[s]) return;
      const score = content.roleScores[gi][k];
      slotOptions.push({ slot: s, label: content.roleByKey[s].label, score: Math.round(score * 10) / 10, fit: fitOf(score) });
    });
    selected = { generalId: g.id, name: g.name, blurb: g.blurb, statNote: g.statNote, slotOptions };
  }

  const tokens = run.token
    ? {
        faction: { key: run.token.faction, label: content.factionByKey[run.token.faction].label, color: content.factionByKey[run.token.faction].color },
        era: { key: run.token.era, label: content.eraByKey[run.token.era].label },
      }
    : null;

  const last = run.round === 5 ? '出征' : '下一轮';
  const primaryLabel = phase === 'awaitFlip' ? '翻令' : last;
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
    tokens,
    respin: respinVm(run, ui.adState),
    pool,
    selected,
    lineup: lineupVm(run),
    canUndo: run.phase === 'placed',
    primaryLabel,
    poolScroll: ui.poolScroll || 0,
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

/**
 * res: the controller's result object (see controller). ui: { revealCount, stampT, scrollY, sheet, sheetScroll, t }
 */
function resultVm(res, ui) {
  ui = ui || {};
  const out = {
    mode: res.mode,
    status: res.status,
    record: res.record || { w: 0, l: 0 },
    band: res.band || { key: '', label: '' },
    comment: res.comment || '',
    rarityText: res.rarityText || null,
    battles: (res.battles || []).map((b) => ({
      i: b.i,
      typeLabel: b.typeLabel,
      win: b.win,
      chanceText: '胜算' + chanceText(b.p),
      luckText: '天时' + LUCK[b.luck],
      cause: b.cause,
      event: b.event || null,
    })),
    lineup: (res.lineupDetail || []).map((e) => ({ slot: e.slot, name: e.name, score: e.score, fit: e.fit })),
    morale: res.morale ? moraleVm(res.morale) : { total: 0, lord: 0, bonds: [], cohesion: 0 },
    replay: { unlocked: !!(res.replay && res.replay.unlocked), adState: ui.replayAdState || 'idle' },
    interstitialDue: !!res.interstitialDue,
    revealCount: ui.revealCount === undefined ? 12 : ui.revealCount,
    stampT: ui.stampT === undefined ? 1 : ui.stampT,
    scrollY: ui.scrollY || 0,
    sheet: ui.sheet || null,
    sheetScroll: ui.sheetScroll || 0,
    privacyNote: !!res.privacyNote,
    boardLabel: res.boardLabel || '看群榜/好友榜',
    t: ui.t || 0,
  };
  if (res.replay && res.replay.best) out.replay.best = res.replay.best;
  if (res.challenge) out.challenge = { theirRecord: res.challenge.theirRecord, theirLineup: res.challenge.theirLineup || null };
  return out;
}

/** Rarity line (7.5): daily from the server share (hidden under 30 runs), free from the tool's distribution. */
function rarityText(res, config) {
  if (res.mode === 'free') {
    const share = config.freeRarity[res.record.w];
    return share === undefined ? null : '约 ' + Math.max(0.1, Math.round(share * 1000) / 10) + '% 的阵容能达到';
  }
  if (res.rarity && res.rarity.share !== null && res.rarity.share !== undefined) return BAND_SHARE_TEXT(res.rarity.share, res.record.w);
  return null;
}

// ---------------------------------------------------------------- challenge

function challengeVm(c, t) {
  const out = {
    status: c.status,
    theirRecord: c.theirRecord || { w: 0, l: 0 },
    mode: c.mode || 'daily',
    countsAsDaily: !!c.countsAsDaily,
    isFriendly: !!c.isFriendly,
    t: t || 0,
  };
  if (c.answerCount !== undefined) out.answerCount = c.answerCount;
  if (c.bestRecord) out.bestRecord = c.bestRecord;
  return out;
}

// ---------------------------------------------------------------- boards

function boardVm(b) {
  return {
    kind: b.kind,
    dateKey: b.dateKey,
    issueNo: b.issueNo,
    state: b.state,
    mode: b.mode || null,
    viewerPlayed: !!b.viewerPlayed,
    self: b.self || { record: null, bandLabel: null },
    actions: {
      canOpenSetting: b.state === 'unauthorized',
      canRetryPrivacy: b.state === 'privacyDenied',
      canShareToGroup: b.state === 'noGroup' || b.state === 'empty' || b.state === 'ready',
    },
    sharedCanvas: b.state === 'ready' ? b.sharedCanvas || null : null,
    t: b.t || 0,
  };
}

/** Main domain -> open data domain message (13). */
function boardMessage(kind, payload, extra) {
  const { content, groupRef, shareTicket, groupid, board, dpr, showUnverified } = extra;
  const msg = {
    type: 'render',
    kind,
    dateKey: payload.dateKey,
    issueNo: payload.issueNo,
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
    roster: content.generals.map((g) => [g.monogram, g.faction]),
  };
  if (kind === 'group') {
    if (groupid) msg.groupid = groupid;
    else if (shareTicket) msg.shareTicket = shareTicket;
  }
  void groupRef;
  return msg;
}

/** Share card view model (shareCard contract). Daily cards carry no general names (D4). */
function cardVm(res, content) {
  const detail = res.lineupDetail || [];
  return {
    mode: res.mode === 'daily' ? 'daily' : 'free',
    issueNo: res.issueNo,
    record: res.record,
    bandLabel: res.band ? res.band.label : '',
    lineup: detail.map((e) => {
      const g = content.byId[e.generalId];
      const f = content.factionByKey[g.faction];
      const era = content.eraByKey[g.eras[0]];
      return {
        slotLabel: content.roleByKey[e.slot].label,
        name: res.mode === 'daily' ? '' : g.name,
        monogram: res.mode === 'daily' ? '' : g.monogram,
        faction: g.faction,
        factionLabel: f.label,
        sub: res.mode === 'daily' ? '' : f.label + ' · ' + era.label,
      };
    }),
    battles: (res.battles || []).map((b) => !!b.win),
  };
}

module.exports = { homeVm, draftVm, resultVm, challengeVm, boardVm, boardMessage, cardVm, rarityText, respinVm, lineupVm, moraleVm };
