/**
 * In-memory stand-in for the cloud functions (spec 13.2), so the whole game runs before the backend and an
 * AppID exist, and so tests can play several players. It runs the SAME core/ rules the real functions run
 * (core/chain.js, players.js, strokes.js, text.js, raster.js) and follows the response shapes in
 * core/README.md. Simulated: claim locks and lazy expiry, 48 h expiry, text moderation (sync) and drawing
 * moderation (pending -> pass / review / risky via the mock rules of spec 6.6, timeouts -> one re-check ->
 * void), reveal, teaser, reports (hide at once, reopen), strikes and restrictions, daily allowances,
 * group membership, deletion, rewards, kill switches.
 *
 * NOT a security boundary. Identity is the third argument of call(); real mode never sends it.
 *
 *   const srv = createMockServer({ now })
 *   srv.call('claimStep', { chainId }, 'userB')  -> {ok,...} | {ok:false, code}
 *   srv.as('userB') -> { call(name, data) }
 *   srv.knobs  { moderationBusy, ugcBusy, mediaDelaySec }   srv.offline = true  -> every call NETWORK error
 *   srv.admin  { hideStep, removeChain, setUgc, restrict, upholdReport, clock helpers }  (test hooks)
 */

const C = require('../core/chain');
const Pl = require('../core/players');
const St = require('../core/strokes');
const Tx = require('../core/text');
const { rasterize } = require('../core/raster');
const { encodePng } = require('../core/png');
const { daily } = require('../core/daily');
const Pr = require('../core/prompts');
const { CONFIG } = require('../core/config');
const { hash32 } = require('../core/rng');
const { beijingDateKey } = require('../core/date');

const ME = 'mock-openid-me';

function err(code, msg, extra) {
  return Object.assign({ ok: false, code, message: msg || code }, extra || {});
}

function createMockServer(opts) {
  opts = opts || {};
  const now = opts.now || (() => Date.now());
  let counter = 0;
  const db = {
    chains: {},
    steps: {}, // `${chainId}_${n}_${attempt}`
    players: {},
    groups: {}, // groupRef -> openGId
    members: {}, // `${openGId}_${openid}` -> { lastSeen }
    groupStats: {},
    reports: {},
    reactions: {},
    subGrants: {},
    daily: {}, // dateKey -> { started, revealed, byPrompt }
    modLog: [],
    traces: {},
    events: [],
    audit: [],
    submits: {}, // claimId -> response (idempotent submit)
    ugc: { createEnabled: true, viewEnabled: true },
  };
  const knobs = { moderationBusy: false, ugcBusy: false, mediaDelaySec: CONFIG.moderation.mockMediaDelaySec, rasterize: opts.rasterize !== false };
  const srv = { db, knobs, offline: false, calls: [] };

  const nextId = (p) => {
    counter++;
    const h = hash32(p + ':' + counter + ':' + now()).toString(32).padStart(7, '0');
    return (p + h + counter.toString(32).padStart(4, '0')).slice(0, 10);
  };

  function player(openid) {
    if (!db.players[openid]) db.players[openid] = Object.assign(Pl.freshPlayer(), { seen: {} });
    const p = db.players[openid];
    p.lastActiveAt = now();
    return p;
  }
  const dateKey = () => beijingDateKey(now());
  const dayStats = () => (db.daily[dateKey()] = db.daily[dateKey()] || { started: 0, revealed: 0, byPrompt: {} });

  // ---------------------------------------------------------------- shared checks

  function gateAction(openid, needCreate, finishing) {
    const p = player(openid);
    if (!(p.rulesVersion >= CONFIG.rulesVersion)) return err('RULES_REQUIRED', '请先同意接龙公约');
    const r = Pl.restrictionOf(p, now());
    if (r && !finishing) return err('RESTRICTED', '你暂时不能参与接龙', { until: r.until, permanent: r.permanent });
    if (needCreate && !db.ugc.createEnabled) return err('UGC_PAUSED', '接龙维护中');
    return null;
  }

  function groupOfRef(ref) {
    return ref && db.groups[ref] ? db.groups[ref] : null;
  }

  function memberFresh(openGId, openid) {
    const m = db.members[openGId + '_' + openid];
    return !!(m && now() - m.lastSeen < CONFIG.groupMemberFreshMs);
  }

  /** the canClaim ctx for a caller */
  function viewerCtx(openid, chain, groupRef) {
    const p = player(openid);
    const day = Pl.dayOf(p, dateKey());
    const gid = groupOfRef(groupRef);
    const r = Pl.restrictionOf(p, now());
    return {
      openid,
      now: now(),
      rulesVersion: p.rulesVersion,
      restrictedUntil: r && r.until,
      permanent: !!(r && r.permanent),
      ugc: { createEnabled: db.ugc.createEnabled },
      isMember: !!(chain && chain.openGId && memberFresh(chain.openGId, openid)),
      hasGroupContext: !!(gid && memberFresh(gid, openid)),
      groupId: gid && memberFresh(gid, openid) ? gid : null,
      stepsToday: day.steps,
      claimsOnChainToday: (chain && day.claims[chain._id]) || 0,
    };
  }

  function stepDoc(chain, n) {
    const id = chain.stepIds[n];
    return id ? db.steps[id] : null;
  }

  function visible(step) {
    return !!step && step.state === 'passed';
  }

  function hasAttempt(chainId, n) {
    let k = 0;
    while (db.steps[chainId + '_' + n + '_' + (k + 1)]) k++;
    return k;
  }

  // ---------------------------------------------------------------- moderation

  function mockText(text) {
    const m = CONFIG.moderation.mockText;
    if (text.indexOf(m.busy) >= 0) return 'busy';
    if (text.indexOf(m.risky) >= 0) return 'risky';
    if (text.indexOf(m.review) >= 0) return 'review';
    return 'pass';
  }

  function strike(openid, stepId, src) {
    const out = Pl.addStrike(player(openid), { stepId, src }, now());
    return out;
  }

  /** Same code path for mock and (later) real pushes: wxa_media_check -> verdict for a step. */
  function applyVerdict(stepId, suggest, source) {
    const step = db.steps[stepId];
    if (!step) return { ok: false, code: 'UNKNOWN' };
    db.modLog.push({ stepId, author: step.author, kind: step.text ? 'text' : 'image', suggest, source: source || 'mock', ts: now() });
    const chain = db.chains[step.chainId];
    if (step.state !== 'pending') {
      if (suggest === 'risky') strike(step.author, stepId, 'verdict'); // a late risky still counts
      return { ok: true, ignored: true };
    }
    step.mod.verdictAt = now();
    step.mod.suggest = suggest;
    if (suggest === 'pass') {
      step.state = 'passed';
      const r = C.passStep(chain, { step: step.n, author: step.author, stepId, now: now() });
      afterPass(chain, step, r);
    } else {
      step.state = 'blocked';
      if (suggest === 'risky') strike(step.author, stepId, 'verdict');
      if (chain.pending && chain.pending.stepId === stepId) C.dropPending(chain, now());
    }
    return { ok: true };
  }

  function voidStep(step) {
    const chain = db.chains[step.chainId];
    step.state = 'void';
    if (chain.pending && chain.pending.stepId === step._id) C.dropPending(chain, now());
    // not counted against the author's allowances (spec 6.3)
    const p = player(step.author);
    if (p.day && p.day.dateKey === step.dateKey) {
      p.day.steps = Math.max(0, p.day.steps - 1);
      if (step.n === 1) p.day.starts = Math.max(0, p.day.starts - 1);
    }
  }

  function sweep() {
    const t = now();
    for (const id of Object.keys(db.steps)) {
      const s = db.steps[id];
      if (s.state !== 'pending') continue;
      const tr = s.mod.trace;
      if (tr && !s.mod.noVerdict && t >= tr.readyAt) {
        applyVerdict(id, tr.suggest, 'mock');
        continue;
      }
      const age = t - s.mod.submittedAt;
      if (s.mod.retries === 0 && age >= CONFIG.moderation.recheckAfterMs) {
        s.mod.retries = 1;
        s.mod.trace = s.mod.noVerdict ? null : s.mod.trace;
      } else if (s.mod.retries >= 1 && age >= CONFIG.moderation.voidAfterMs) {
        voidStep(s);
      }
    }
    for (const id of Object.keys(db.chains)) {
      const ch = db.chains[id];
      const r = C.sweep(ch, t);
      if (r.event === 'revealed') onRevealed(ch);
    }
  }

  function onRevealed(chain) {
    dayStats().revealed++;
    const gs = chain.openGId && db.groupStats[chain.openGId];
    if (gs) gs.revealed++;
  }

  function afterPass(chain, step, r) {
    const p = player(step.author);
    const day = Pl.dayOf(p, dateKey());
    Pl.touchStreak(p, dateKey());
    void day;
    const gs = chain.openGId && db.groupStats[chain.openGId];
    if (gs) {
      gs.lastActivityAt = now();
      if (step.strokes) gs.drawings++;
    }
    if (r && r.revealed) onRevealed(chain);
  }

  // ---------------------------------------------------------------- functions

  const fn = {
    getHome(d, openid) {
      const p = player(openid);
      const day = Pl.dayOf(p, dateKey());
      const unseen = Object.keys(db.chains).filter((id) => {
        const c = db.chains[id];
        return c.state === 'revealed' && C.isParticipant(c, openid) && !p.seen[id];
      }).length;
      const revealedMine = Object.keys(db.chains).filter((id) => db.chains[id].state === 'revealed' && C.isParticipant(db.chains[id], openid)).length;
      const r = Pl.restrictionOf(p, now());
      const dd = db.daily[dateKey()] || { byPrompt: {} };
      const warn = p.warnPending;
      return {
        ok: true,
        dateKey: dateKey(),
        serverNow: now(),
        daily: { prompts: daily(dateKey()), counts: dd.byPrompt },
        me: {
          rulesVersion: p.rulesVersion,
          restriction: r ? { until: r.until, permanent: r.permanent } : null,
          warnPending: warn,
          startsLeft: Pl.startsLeft(day),
          adStartsLeft: Pl.adStartsLeft(day),
          paletteToday: day.palette > 0,
          streak: Pl.streakDays(p, dateKey()),
          unseenReveals: unseen,
          lifetimeReveals: revealedMine,
        },
        features: { subscribe: null, updatableCard: true, banner: { enabled: false, adUnitId: null }, interstitial: { enabled: true, minLifetimeReveals: 3, minGapSec: 180, maxPerDay: 3 } },
        ugc: { createEnabled: db.ugc.createEnabled, viewEnabled: db.ugc.viewEnabled },
      };
    },

    agreeRules(d, openid) {
      const p = player(openid);
      p.rulesVersion = Math.max(p.rulesVersion, +d.version || 0);
      p.warnPending = false;
      return { ok: true };
    },

    ackWarning(d, openid) {
      player(openid).warnPending = false;
      return { ok: true };
    },

    joinGroup(d, openid) {
      const g = d && d.groupData;
      const data = g && g.mockData ? g.mockData : g;
      if (!data || !data.opengid) return err(data && data.code ? data.code : 40097);
      if (data.chat_type !== undefined && data.chat_type !== 3 && data.chat_type !== 4) return err('NOT_GROUP');
      const ref = 'gr' + hash32('pepper:' + data.opengid).toString(16).padStart(8, '0');
      db.groups[ref] = data.opengid;
      db.members[data.opengid + '_' + openid] = { lastSeen: now(), firstSeen: (db.members[data.opengid + '_' + openid] || {}).firstSeen || now() };
      db.groupStats[data.opengid] = db.groupStats[data.opengid] || { started: 0, revealed: 0, drawings: 0, lastActivityAt: now() };
      return { ok: true, groupRef: ref };
    },

    createChain(d, openid) {
      const bad = gateAction(openid, true);
      if (bad) return bad;
      if (knobs.ugcBusy) return err('UGC_BUSY', '今天接龙太热闹了，明天再开新的吧');
      const p = player(openid);
      const day = Pl.dayOf(p, dateKey());
      if (Pl.startsLeft(day) <= 0) return err('START_LIMIT', '今天的接龙已开完');
      let promptText;
      let promptId = null;
      let custom = false;
      if (d.customText !== undefined && d.customText !== null && d.customText !== '') {
        const chk = Tx.check(d.customText, 'prompt');
        if (!chk.ok) return err('TEXT_REJECTED', chk.message);
        const v = knobs.moderationBusy ? 'busy' : mockText(chk.text);
        if (v === 'busy') return err('MODERATION_BUSY', '审核服务繁忙');
        if (v !== 'pass') {
          if (v === 'risky') strike(openid, null, 'verdict');
          db.modLog.push({ author: openid, kind: 'text', textCopy: chk.text, suggest: v, source: 'mock', ts: now() });
          return err('TEXT_BLOCKED', '这个题目不太合适，换一个吧');
        }
        promptText = chk.text;
        custom = true;
      } else {
        const pr = Pr.byId(d.promptId);
        if (!pr) return err('BAD_PROMPT');
        promptText = pr.text;
        promptId = pr.id;
      }
      const gid = groupOfRef(d.groupRef);
      const bound = !!(gid && memberFresh(gid, openid));
      const id = nextId('c');
      const claimId = nextId('k');
      const chain = C.newChain({ id, starter: openid, promptId, promptText, custom, openGId: bound ? gid : null, claimId, now: now(), dateKey: dateKey() });
      db.chains[id] = chain;
      return { ok: true, chainId: id, bound, claim: { claimId, step: 1, kind: 'draw', expiresAt: chain.claim.expiresAt, sourceText: promptText } };
    },

    getChain(d, openid) {
      const chain = db.chains[d.chainId];
      if (!chain) return { ok: true, state: 'notFound' };
      const v = viewerCtx(openid, chain, d.groupRef);
      const es = C.entryState(chain, v);
      const can = C.canRevealNow(chain, openid, now());
      return {
        ok: true,
        state: es.state,
        code: es.code,
        until: es.until,
        passed: chain.passed,
        length: chain.length,
        nextStep: chain.passed < chain.length ? chain.nextStep : null,
        nextKind: chain.passed < chain.length ? C.kindOfStep(chain.nextStep) : null,
        isParticipant: C.isParticipant(chain, openid),
        isStarter: chain.starter === openid,
        canRevealNow: can.ok,
        canSameAgain: !!chain.promptId && !chain.custom && (chain.state === 'revealed' || (chain.state === 'expired' && chain.starter === openid)),
        expiresAt: chain.expiresAt,
        claimEtaMs: chain.claim && C.claimActive(chain, now()) ? chain.claim.expiresAt - now() : null,
        serverNow: now(),
        activityId: 'mock-activity-' + chain._id,
      };
    },

    claimStep(d, openid) {
      const bad = gateAction(openid, true);
      if (bad) return bad;
      const chain = db.chains[d.chainId];
      if (!chain) return err('CHAIN_NOT_FOUND');
      const ctx = Object.assign(viewerCtx(openid, chain, d.groupRef), { claimId: nextId('k') });
      const r = C.claim(chain, ctx);
      if (!r.ok) return err(r.code, r.code, { until: r.until });
      const p = player(openid);
      const day = Pl.dayOf(p, dateKey());
      if (!r.resumed) day.claims[chain._id] = (day.claims[chain._id] || 0) + 1;
      if (r.bound) db.groupStats[chain.openGId] = db.groupStats[chain.openGId] || { started: 0, revealed: 0, drawings: 0, lastActivityAt: now() };
      const step = r.step;
      let prev;
      if (!db.ugc.viewEnabled) prev = { kind: 'paused' };
      else if (step === 1) prev = { kind: 'text', text: chain.promptText };
      else {
        const sd = stepDoc(chain, step - 1);
        if (!visible(sd)) prev = { kind: 'paused' };
        else prev = sd.strokes ? { kind: 'draw', strokes: sd.strokes } : { kind: 'text', text: sd.text };
      }
      return { ok: true, claimId: r.claim.claimId, step, kind: r.kind, expiresAt: r.claim.expiresAt, serverNow: now(), resumed: !!r.resumed, canReport: step > 1, prev };
    },

    releaseClaim(d, openid) {
      const chain = db.chains[d.chainId];
      if (!chain) return err('CHAIN_NOT_FOUND');
      const r = C.release(chain, openid, d.claimId, now());
      return r.ok ? { ok: true } : err(r.code);
    },

    submitStep(d, openid) {
      if (d.claimId && db.submits[d.claimId]) return db.submits[d.claimId];
      const out = submitStepInner(d, openid);
      if (out.ok && d.claimId) db.submits[d.claimId] = out;
      return out;
    },

    getReveal(d, openid) {
      const chain = db.chains[d.chainId];
      if (!chain) return err('CHAIN_NOT_FOUND');
      if (chain.state === 'removed') return err('CHAIN_REMOVED');
      if (chain.state !== 'revealed') return err('NOT_REVEALED');
      if (!C.isParticipant(chain, openid)) return err('NOT_PARTICIPANT', 'NOT_PARTICIPANT', { teaser: teaserOf(chain) });
      const steps = [];
      for (let n = 1; n <= chain.length; n++) {
        const sd = stepDoc(chain, n);
        if (!sd && !chain.authors[n]) continue;
        const k = C.kindOfStep(n);
        let placeholder = null;
        if (!db.ugc.viewEnabled) placeholder = 'paused';
        else if (sd && sd.state === 'hidden') placeholder = 'reported';
        else if (sd && sd.state === 'deleted') placeholder = 'deleted';
        const row = { n, kind: k, mine: !!sd && sd.author === openid, placeholder, laughs: sd ? sd.laughs : 0, myLaugh: !!db.reactions[(sd ? sd._id : '') + '_' + openid] };
        if (!placeholder && sd) {
          if (sd.strokes) row.strokes = sd.strokes;
          else row.text = sd.text;
        }
        steps.push(row);
      }
      player(openid).seen[chain._id] = true;
      const dd = db.daily[chain.dateKey];
      const count = chain.promptId && dd ? dd.byPrompt[chain.promptId] || 0 : 0;
      return {
        ok: true,
        chainId: chain._id,
        promptText: db.ugc.viewEnabled ? chain.promptText : '',
        promptId: chain.promptId && !chain.custom ? chain.promptId : null,
        custom: chain.custom,
        passed: chain.passed,
        early: chain.revealReason !== 'complete',
        participantCount: chain.participants.length,
        durationMs: chain.revealedAt - chain.createdAt,
        steps,
        nationalCount: count >= CONFIG.daily.nationalCountMin ? count : null,
      };
    },

    revealNow(d, openid) {
      const chain = db.chains[d.chainId];
      if (!chain) return err('CHAIN_NOT_FOUND');
      const r = C.revealNow(chain, openid, now());
      if (!r.ok) return err(r.code);
      onRevealed(chain);
      return { ok: true };
    },

    laugh(d, openid) {
      const chain = db.chains[d.chainId];
      if (!chain || chain.state !== 'revealed') return err('CHAIN_CLOSED');
      if (!C.isParticipant(chain, openid)) return err('NOT_PARTICIPANT');
      const sd = stepDoc(chain, d.step);
      if (!visible(sd)) return err('CHAIN_CLOSED');
      const key = sd._id + '_' + openid;
      if (db.reactions[key]) {
        delete db.reactions[key];
        sd.laughs--;
      } else {
        db.reactions[key] = true;
        sd.laughs++;
      }
      return { ok: true, laughs: sd.laughs, mine: !!db.reactions[key] };
    },

    report(d, openid) {
      const p = player(openid);
      const day = Pl.dayOf(p, dateKey());
      if (CONFIG.report.reasons.indexOf(d.reason) < 0) return err('BAD_REASON');
      const chain = db.chains[d.chainId];
      if (!chain) return err('CHAIN_NOT_FOUND');
      const holder = chain.claim && chain.claim.openid === openid;
      const canSee = C.isParticipant(chain, openid) && chain.state === 'revealed';
      if (d.step === 0) {
        // teaser texts: anyone who can see the teaser; hides the whole chain
        const key = openid + '_' + chain._id + '_0';
        if (db.reports[key]) return err('DUP_REPORT');
        if (day.reports >= CONFIG.allowances.reportsPerDay) return err('REPORT_LIMIT');
        day.reports++;
        db.reports[key] = { reporter: openid, chainId: chain._id, step: 0, reason: d.reason, state: 'open', createdAt: now() };
        chain.state = 'removed';
        chain.hiddenBy = 'report';
        chain.claim = null;
        return { ok: true, hidden: true, reopened: false };
      }
      const sd = stepDoc(chain, d.step);
      if (sd && sd.author === openid) return err('OWN_STEP');
      if (!sd || (!canSee && !(holder && chain.claim.step === d.step + 1))) return err('NOT_PARTICIPANT');
      const key = openid + '_' + sd._id;
      if (db.reports[key]) return err('DUP_REPORT');
      if (day.reports >= CONFIG.allowances.reportsPerDay) return err('REPORT_LIMIT');
      day.reports++;
      db.reports[key] = { reporter: openid, stepId: sd._id, chainId: chain._id, reason: d.reason, state: 'open', createdAt: now() };
      sd.state = 'hidden';
      sd.hiddenReason = 'report';
      const re = C.reopenStep(chain, d.step, now());
      return { ok: true, hidden: true, reopened: re.reopened };
    },

    getMyChains(d, openid) {
      const mineSteps = Object.keys(db.steps)
        .map((k) => db.steps[k])
        .filter((s) => s.author === openid);
      const ids = {};
      mineSteps.forEach((s) => (ids[s.chainId] = true));
      Object.keys(db.chains).forEach((id) => {
        if (db.chains[id].starter === openid && db.chains[id].state !== 'abandoned') ids[id] = true;
      });
      const p = player(openid);
      let items = Object.keys(ids)
        .filter((id) => !d.chainId || id === d.chainId)
        .map((id) => {
          const ch = db.chains[id];
          const mine = mineSteps.filter((s) => s.chainId === id);
          const latestByN = {};
          mine.forEach((s) => {
            if (!latestByN[s.n] || latestByN[s.n].attempt < s.attempt) latestByN[s.n] = s;
          });
          const rows = Object.keys(latestByN).map((n) => latestByN[n]).sort((a, b) => a.n - b.n);
          let status = 'open';
          if (ch.state === 'revealed') status = 'revealed';
          else if (ch.state === 'expired') status = 'expired';
          else if (ch.state === 'removed') status = 'removed';
          else if (ch.state === 'pending' && ch.pending.author === openid) status = 'pending';
          else {
            const last = rows[rows.length - 1];
            if (last && last.state === 'blocked' && last.n >= ch.nextStep) status = 'blocked';
          }
          const blocked = rows.filter((s) => s.state === 'blocked' && s.n >= ch.nextStep)[0];
          const item = {
            chainId: id,
            status,
            passed: ch.passed,
            mySteps: rows.filter((s) => s.state === 'passed' || s.state === 'pending').map((s) => s.n),
            blockedStep: blocked ? blocked.n : null,
            promptText: ch.state === 'revealed' || ch.starter === openid ? ch.promptText : undefined,
            promptId: (ch.state === 'revealed' || ch.starter === openid) && ch.promptId && !ch.custom ? ch.promptId : undefined,
            at: ch.lastActivityAt,
            unseen: ch.state === 'revealed' && C.isParticipant(ch, openid) && !p.seen[id],
          };
          if (d.chainId) {
            item.mine = rows.map((s) => ({
              n: s.n,
              kind: s.strokes || s.n % 2 === 1 ? 'draw' : 'describe',
              strokes: s.state === 'deleted' ? undefined : s.strokes,
              text: s.state === 'deleted' ? undefined : s.text,
              modState: s.state === 'void' ? 'void' : s.state,
              canDelete: s.state === 'passed' || s.state === 'hidden',
            }));
          }
          return item;
        })
        .sort((a, b) => b.at - a.at);
      const start = d.cursor ? +d.cursor : 0;
      const page = items.slice(start, start + 20);
      return { ok: true, items: page, cursor: start + 20 < items.length ? String(start + 20) : null };
    },

    getGroupChains(d, openid) {
      const gid = groupOfRef(d.groupRef);
      if (!gid || !memberFresh(gid, openid)) return err('NOT_MEMBER');
      const gs = db.groupStats[gid] || { started: 0, revealed: 0, drawings: 0 };
      const waiting = [];
      const inProgress = [];
      const revealed = [];
      Object.keys(db.chains)
        .map((id) => db.chains[id])
        .filter((c) => c.openGId === gid)
        .sort((a, b) => b.lastActivityAt - a.lastActivityAt)
        .forEach((c) => {
          if (c.state === 'revealed') {
            if (revealed.length < 20) revealed.push({ chainId: c._id, promptText: c.promptText, finalText: finalTextOf(c), participant: C.isParticipant(c, openid) });
            return;
          }
          if (c.state !== 'open' && c.state !== 'pending' && c.state !== 'starting') return;
          if (c.state === 'starting') return;
          const es = C.entryState(c, viewerCtx(openid, c, d.groupRef));
          const base = { chainId: c._id, nextStep: c.nextStep, nextKind: C.kindOfStep(c.nextStep), passed: c.passed };
          if (es.state === 'claimable') waiting.push(base);
          else if (es.state === 'pending' || es.state === 'taken' || es.state === 'prevMine' || es.state === 'capReached') inProgress.push(Object.assign(base, { why: es.state }));
        });
      return { ok: true, stats: { started: gs.started, revealed: gs.revealed, drawings: gs.drawings }, waiting, inProgress, revealed };
    },

    deleteMyStep(d, openid) {
      let count = 0;
      const del = (s) => {
        const ch = db.chains[s.chainId];
        const wasPassed = s.state === 'passed';
        s.state = 'deleted';
        delete s.strokes;
        delete s.text;
        if (wasPassed) C.reopenStep(ch, s.n, now());
        count++;
      };
      if (d.all) {
        Object.keys(db.steps).forEach((k) => {
          const s = db.steps[k];
          if (s.author === openid && (s.state === 'passed' || s.state === 'hidden')) del(s);
        });
        return { ok: true, count };
      }
      const chain = db.chains[d.chainId];
      if (!chain) return err('CHAIN_NOT_FOUND');
      const s = stepDoc(chain, d.step) || Object.keys(db.steps).map((k) => db.steps[k]).filter((x) => x.chainId === d.chainId && x.n === d.step && x.author === openid && x.state === 'hidden')[0];
      if (!s || s.author !== openid) return err('OWN_STEP');
      del(s);
      return { ok: true, count };
    },

    subscribeReveal(d, openid) {
      const chain = db.chains[d.chainId];
      if (!chain || !C.isParticipant(chain, openid)) return err('NOT_PARTICIPANT');
      db.subGrants[d.chainId + '_' + openid] = { grantedAt: now(), used: false };
      return { ok: true };
    },

    grantReward(d, openid) {
      const p = player(openid);
      const day = Pl.dayOf(p, dateKey());
      if (d.kind === 'start') {
        if (Pl.adStartsLeft(day) <= 0) return err('REWARD_LIMIT');
        day.adStarts++;
      } else if (d.kind === 'palette') {
        if (day.palette >= CONFIG.allowances.paletteAdPerDay) return err('REWARD_LIMIT');
        day.palette++;
      } else return err('BAD_KIND');
      return { ok: true, startsLeft: Pl.startsLeft(day), adStartsLeft: Pl.adStartsLeft(day), paletteToday: day.palette > 0 };
    },

    track(d, openid) {
      (d.events || []).forEach((e) => db.events.push(Object.assign({ openid }, e)));
      return { ok: true };
    },
  };

  function finalTextOf(chain) {
    for (let n = chain.length; n >= 1; n--) {
      const sd = stepDoc(chain, n);
      if (sd && sd.state === 'passed' && sd.text) return sd.text;
    }
    return null;
  }

  function teaserOf(chain) {
    return { promptId: chain.promptId && !chain.custom ? chain.promptId : null, promptText: chain.promptText, finalText: finalTextOf(chain), passed: chain.passed, canSameAgain: !!chain.promptId && !chain.custom };
  }

  function submitStepInner(d, openid) {
    const chain = db.chains[d.chainId];
    if (!chain) return err('CHAIN_NOT_FOUND');
    // a restriction that arrives mid-turn applies to the next action; the current claim may finish (edge 19)
    const bad = gateAction(openid, true, !!(chain.claim && chain.claim.openid === openid));
    if (bad) return bad;
    const hasText = typeof d.text === 'string';
    const hasStrokes = d.strokes !== undefined && d.strokes !== null;
    if (hasText === hasStrokes) return err('BAD_KIND');
    const kind = hasStrokes ? 'draw' : 'describe';
    const chk = C.checkSubmit(chain, { openid, claimId: d.claimId, kind, now: now() });
    if (!chk.ok) return err(chk.code, chk.code === 'CLAIM_LOST' ? '超时了，这一棒已被群友接走' : chk.code);
    const p = player(openid);
    const day = Pl.dayOf(p, dateKey());
    if (day.steps >= CONFIG.allowances.stepsPerDay) return err('STEP_LIMIT', '今天接得够多啦，明天再来');
    const n = chk.step;
    const attempt = hasAttempt(chain._id, n) + 1;
    const id = chain._id + '_' + n + '_' + attempt;
    if (kind === 'describe') {
      const tc = Tx.check(d.text, 'desc');
      if (!tc.ok) return err('TEXT_REJECTED', tc.message);
      const v = knobs.moderationBusy ? 'busy' : mockText(tc.text);
      if (v === 'busy') return err('MODERATION_BUSY', '审核服务繁忙，请稍后再试');
      if (v !== 'pass') {
        if (v === 'risky') strike(openid, id, 'verdict');
        db.modLog.push({ stepId: id, author: openid, kind: 'text', textCopy: tc.text, suggest: v, source: 'mock', ts: now() });
        db.steps[id] = { _id: id, chainId: chain._id, n, attempt, author: openid, state: 'blocked', text: tc.text, laughs: 0, createdAt: now(), dateKey: dateKey(), mod: { kind: 'text', suggest: v } };
        return err('TEXT_BLOCKED', '这句话没通过审核，换个说法吧');
      }
      db.steps[id] = { _id: id, chainId: chain._id, n, attempt, author: openid, state: 'passed', text: tc.text, laughs: 0, createdAt: now(), dateKey: dateKey(), mod: { kind: 'text', suggest: 'pass' } };
      day.steps++;
      const r = C.passStep(chain, { step: n, author: openid, stepId: id, now: now() });
      afterPass(chain, db.steps[id], r);
      return { ok: true, state: 'passed', step: n, chainState: chain.state, revealed: !!r.revealed };
    }
    // drawing
    const sv = St.validate(d.strokes);
    if (!sv.ok) return err('INVALID_STROKES', sv.reason);
    if (knobs.moderationBusy) return err('MODERATION_BUSY', '审核服务繁忙，请稍后再试');
    let pngBytes = 0;
    if (knobs.rasterize) pngBytes = encodePng(rasterize(d.strokes)).length; // exercises the server path (stored blocks here; zlib in the real function)
    const m = CONFIG.moderation.mockStrokeCounts;
    const count = d.strokes.s.length;
    const suggest = count === m.risky ? 'risky' : count === m.review ? 'review' : 'pass';
    const noVerdict = count === m.noVerdict;
    const traceId = 'mock-trace-' + id;
    db.steps[id] = {
      _id: id,
      chainId: chain._id,
      n,
      attempt,
      author: openid,
      state: 'pending',
      strokes: d.strokes,
      laughs: 0,
      createdAt: now(),
      dateKey: dateKey(),
      pngBytes,
      mod: { kind: 'image', submittedAt: now(), retries: 0, noVerdict, trace: noVerdict ? null : { id: traceId, suggest, readyAt: now() + knobs.mediaDelaySec * 1000 } },
    };
    db.traces[traceId] = id;
    C.markPending(chain, { step: n, author: openid, stepId: id, now: now() });
    day.steps++;
    if (n === 1) {
      day.starts++;
      dayStats().started++;
      if (chain.promptId) dayStats().byPrompt[chain.promptId] = (dayStats().byPrompt[chain.promptId] || 0) + 1;
      if (chain.openGId && db.groupStats[chain.openGId]) db.groupStats[chain.openGId].started++;
    }
    return { ok: true, state: 'pending', step: n, chainState: chain.state, revealed: false };
  }

  // ---------------------------------------------------------------- dispatch + test hooks

  srv.call = function (name, data, openid) {
    srv.calls.push(name);
    if (srv.offline) return { ok: false, code: 'NETWORK', message: 'offline' };
    if (!fn[name]) return err('UNKNOWN_FUNCTION');
    sweep();
    try {
      return JSON.parse(JSON.stringify(fn[name](data || {}, openid || ME)));
    } catch (e) {
      return err('INTERNAL', String(e && e.message));
    }
  };

  srv.as = (openid) => ({ openid, call: (name, data) => srv.call(name, data, openid) });
  srv.names = Object.keys(fn);
  srv.sweep = sweep;

  srv.admin = {
    /** finish the pending drawing verdict immediately (what the real push would do) */
    verdict(stepId, suggest) {
      return applyVerdict(stepId, suggest, 'test');
    },
    hideStep(chainId, n) {
      const ch = db.chains[chainId];
      const sd = stepDoc(ch, n);
      sd.state = 'hidden';
      sd.hiddenReason = 'admin';
      return C.reopenStep(ch, n, now());
    },
    removeChain(chainId) {
      C.remove(db.chains[chainId], now());
    },
    setUgc(o) {
      Object.assign(db.ugc, o);
    },
    restrict(openid, ms) {
      player(openid).restrictedUntil = now() + ms;
    },
    strike(openid, src) {
      return strike(openid, null, src || 'report');
    },
    player,
    stepOf: (chainId, n, attempt) => db.steps[chainId + '_' + n + '_' + (attempt || 1)],
  };
  return srv;
}

module.exports = { createMockServer, ME };
