/**
 * The turn: one draw or describe screen, in both modes (spec 8.4, 8.5, 5.8, F-3, F-4). A turn is `c.turn`:
 *   live  (mode 'live')   keyed by room + round; the deadline is the round's `deadline` (server ms); a send is `submitRoomStep`
 *   chain (mode 'chain')  keyed by the claim; the deadline is claim start + timerSec; a send is `submitStep`
 *
 * FORCED SEND (5.8, AC 128-134): at 0 s by SERVER time every input is dead (the renderer returns only `draw:block` / `describe:block`), the
 * stroke in progress ends at its last kept point and is kept, the keyboard closes, an open 清空 / 离开 dialog and the report sheet close,
 * and the turn is sent AS IT IS with `auto: true` (an empty turn is sent with `empty: true` = a marker step, never checked). A failed
 * send is retried every second until `deadline + grace` (live) or until the claim is lost (慢慢传). A work that was blocked before time-up and
 * has not changed is NOT sent again as content (it would only add a strike): it goes as an empty marker.
 *
 * The canvas rect and the stored height `h` come from the renderer's pure geometry at turn open and never change during the turn (AC 126).
 * Pixels map to the grid through the exact paper rect the renderer returned: gx = (px - paper.x) / paper.scale.
 */

const strokesLib = require('../core/strokes');
const text = require('../core/text');
const { CONFIG } = require('../core/config');
const V = require('./vm');

const COACH_MS = 3000;
const SHAKE_MS = 300;
const TICK_MS = 700;
const PERSIST_GAP_MS = 1000;
const RETRY_MS = 1000;
const MANUAL_CODES = ['IMAGE_BLOCKED', 'TEXT_BLOCKED', 'TEXT_REJECTED', 'MODERATION_BUSY', 'INVALID_STROKES'];

module.exports = function install(X) {
  const { c, S, store, api, keyboard, audio } = X;
  const turn = {};

  const secLeft = (t, tms) => Math.max(0, Math.ceil((t.deadline - (tms + c.offset)) / 1000));
  const live = (t) => t.mode === 'live';

  // ---------------------------------------------------------------------------------------------------------------- open

  function savedFor(o) {
    const s = S.turn;
    if (!s || s.mode !== o.mode || s.kind !== o.kind) return null;
    if (o.mode === 'live') return s.roomId === o.roomId && s.round === o.round ? s : null;
    return s.chainId === o.chainId && s.step === o.step ? s : null;
  }

  /**
   * A turn opens. o = { mode, kind, roomId?, round?, rounds?, chainNo?, chainId?, claimId?, step?, source (a server Source),
   *   deadline (server ms), graceSec? }
   */
  turn.begin = function begin(o) {
    const kind = o.kind;
    const source = V.sourceVm(o.source, kind);
    const unlocked = X.paletteUnlocked();
    const saved = savedFor(o);
    const t = {
      mode: o.mode, kind, roomId: o.roomId, round: o.round, rounds: o.rounds, chainNo: o.chainNo, chainId: o.chainId, claimId: o.claimId, step: o.step,
      source, rawKind: o.source && o.source.kind, reportRef: (o.source && o.source.reportRef) || null, canReport: !!(o.source && o.source.canReport && (o.mode === 'chain' || (o.source.reportRef))),
      deadline: o.deadline, graceMs: (o.graceSec || 0) * 1000, startedLocal: X.now(),
      status: kind === 'draw' ? 'drawing' : 'typing', statusText: null, errorText: null,
      colorIdx: saved ? saved.colorIdx : 0, sizeIdx: saved ? saved.sizeIdx : 1,
      rec: null, gridH: CONFIG.strokes.grid, canvas: null, sourceLines: 1, palette: V.paletteVm(unlocked), unlocked,
      text: saved && kind === 'describe' ? saved.text : '', kbOpen: false,
      secLeft: 0, forced: false, sending: false, done: false, retryAt: 0, lastPersist: 0, shakeUntil: 0, tickUntil: 0, tickDone: false, coachUntil: 0,
      blockedRev: undefined, blockedText: undefined, undoCountSent: 0,
    };
    if (t.colorIdx >= strokesLib.BASE_COLORS && !unlocked) t.colorIdx = 0;
    if (kind === 'draw') {
      const g = X.geometry.draw(source, unlocked);
      t.canvas = { x: g.x, y: g.y, w: g.w, h: g.h };
      t.gridH = g.gridH;
      t.sourceLines = g.sourceLines;
      t.rec = strokesLib.createRecorder({ h: t.gridH });
      if (saved && saved.strokes) t.rec.load(saved.strokes);
      if (!S.coachSeen && !saved) t.coachUntil = X.now() + COACH_MS; // first ever draw turn: a 3 s line
    }
    t.secLeft = secLeft(t, X.now());
    c.turn = t;
    c.pick = null;
    turn.persist(true);
    X.track('step_view', { mode: t.mode, chainId: t.chainId, step: t.step || t.round, kind, sourceKind: sourceKindOf(source) });
    X.go(kind === 'draw' ? 'draw' : 'describe');
    if (kind === 'describe') openKeyboard(t);
    return t;
  };

  const sourceKindOf = (s) => (s.kind === 'paused' ? 'hidden' : s.kind);

  turn.active = () => !!c.turn && (c.screen === 'draw' || c.screen === 'describe');

  turn.clear = function clear() {
    if (c.ui.dialog && c.ui.dialog.forTurn) c.ui.dialog = null; // a 清空 / 离开 confirm belongs to the turn
    c.turn = null;
    S.turn = null;
    store.save();
    keyboard.close();
  };

  turn.persist = function persist(force) {
    const t = c.turn;
    if (!t || t.done) return;
    const n = X.now();
    if (!force && n - t.lastPersist < PERSIST_GAP_MS) return;
    t.lastPersist = n;
    const base = {
      mode: t.mode, kind: t.kind, gridH: t.gridH, colorIdx: t.colorIdx, sizeIdx: t.sizeIdx, undoCount: t.rec ? t.rec.undoCount : 0, startedAt: t.startedLocal, savedAt: n,
      strokes: t.rec && t.rec.strokeCount ? t.rec.drawing() : null, text: t.kind === 'describe' ? t.text : '',
    };
    S.turn = live(t) ? Object.assign(base, { roomId: t.roomId, round: t.round }) : Object.assign(base, { chainId: t.chainId, claimId: t.claimId, step: t.step });
    store.save();
  };

  /** the server sent a new source for the same turn (the player reported theirs: it is `hidden` now) */
  turn.updateSource = function updateSource(rawSource) {
    const t = c.turn;
    if (!t || !rawSource) return;
    const next = V.sourceVm(rawSource, t.kind);
    if (JSON.stringify(next) === JSON.stringify(t.source)) return;
    t.source = next;
    t.reportRef = rawSource.reportRef || null;
    t.canReport = !!(rawSource.canReport && (t.mode === 'chain' || t.reportRef));
    X.invalidate();
  };

  // ------------------------------------------------------------------------------------------------------------ keyboard

  function openKeyboard(t) {
    if (t.kind !== 'describe' || t.forced) return;
    t.kbOpen = true;
    keyboard.open({
      value: t.text,
      maxLength: 40,
      placeholder: '你觉得这画的是什么？',
      onInput: (v) => {
        if (c.turn !== t || t.sending || t.forced) return;
        const f = text.inputFilter(v, 'describe');
        t.text = f.text;
        if (f.dropped) t.shakeUntil = X.now() + SHAKE_MS;
        if (t.status === 'blocked' || t.status === 'busy' || t.status === 'error') {
          t.status = 'typing';
          t.errorText = null;
        }
        turn.persist(false);
        X.invalidate();
      },
      onConfirm: () => send(t, false),
      onClose: () => {
        t.kbOpen = false;
        X.invalidate();
      },
    });
  }

  // --------------------------------------------------------------------------------------------------------------- drawing

  const drawingOpen = () => c.screen === 'draw' && c.turn && !c.turn.forced && !c.turn.sending && ['drawing', 'blocked', 'error'].includes(c.turn.status) && !c.ui.dialog && !c.report && !c.rules.open;

  function toGrid(px, py) {
    const p = c.paper || (c.turn && c.turn.canvas && { x: c.turn.canvas.x, y: c.turn.canvas.y, scale: c.turn.canvas.w / CONFIG.strokes.grid });
    return { gx: (px - p.x) / p.scale, gy: (py - p.y) / p.scale };
  }

  /** a touch started inside draw:canvas */
  turn.strokeBegin = function strokeBegin(px, py) {
    if (!drawingOpen()) return false;
    const t = c.turn;
    if (t.rec.blocked) return false; // 4,000 points / 200 strokes / the ink budget: new strokes are blocked (AC 26)
    const g = toGrid(px, py);
    const ok = t.rec.begin(g.gx, g.gy, t.colorIdx, t.sizeIdx);
    if (ok) {
      if (t.coachUntil) dismissCoach();
      X.invalidate();
    }
    return ok;
  };
  turn.strokeMove = function strokeMove(px, py) {
    const t = c.turn;
    if (!t || !t.rec || c.screen !== 'draw' || t.forced || !t.rec.drawingNow) return false;
    const g = toGrid(px, py);
    const kept = t.rec.move(g.gx, g.gy);
    if (kept) X.invalidate();
    return kept;
  };
  turn.strokeEnd = function strokeEnd() {
    const t = c.turn;
    if (!t || !t.rec) return;
    t.rec.end();
    turn.persist(false);
    X.invalidate();
  };

  function dismissCoach() {
    const t = c.turn;
    if (!t) return;
    t.coachUntil = 0;
    if (!S.coachSeen) {
      S.coachSeen = true;
      store.save();
    }
    X.invalidate();
  }

  // ----------------------------------------------------------------------------------------------------------------- leave

  const confirmLeave = () => {
    const t = c.turn;
    const isLive = live(t);
    X.dialog(
      isLive
        ? { text: '离开后你的回合会自动跳过，确定离开？', confirmLabel: '离开', cancelLabel: '继续玩', danger: true, onConfirm: () => X.room.leave() }
        : { title: '放弃这一棒？', text: t.kind === 'draw' ? '群友可以接着画' : '群友可以接着猜', confirmLabel: '放弃', cancelLabel: t.kind === 'draw' ? '继续画' : '继续写', danger: true, onConfirm: quitChain },
      true
    );
  };

  function quitChain() {
    const t = c.turn;
    if (!t) return;
    X.track('step_release', { chainId: t.chainId, step: t.step, reason: 'quit' });
    api.releaseClaim({ chainId: t.chainId, claimId: t.claimId });
    turn.clear();
    X.chain.afterTurnLeft(t);
  }

  // ----------------------------------------------------------------------------------------------------------------- hits

  turn.drawHit = function drawHit(id) {
    const t = c.turn;
    if (!t) return undefined;
    if (id === 'coach:next' || id === 'coach:block') return dismissCoach();
    if (t.forced || t.sending) return undefined;
    if (id === 'draw:back') return confirmLeave();
    if (id.indexOf('draw:color:') === 0) {
      const i = parseInt(id.slice('draw:color:'.length), 10);
      if (!(i >= 0 && i < strokesLib.COLORS.length) || t.rec.drawingNow) return undefined;
      if (i >= strokesLib.BASE_COLORS && !t.unlocked) return undefined; // locked swatches are not tappable (AC 22)
      t.colorIdx = i;
      turn.persist(false);
      return X.invalidate();
    }
    if (id === 'draw:size') {
      if (t.rec.drawingNow) return undefined;
      t.sizeIdx = (t.sizeIdx + 1) % strokesLib.SIZES.length;
      return X.invalidate();
    }
    if (id === 'draw:undo') {
      if (t.rec.undo()) {
        turn.persist(true);
        X.invalidate();
      }
      return undefined;
    }
    if (id === 'draw:clear') {
      if (!t.rec.strokeCount) return undefined;
      X.dialog(
        {
          text: '清空画布？', confirmLabel: '清空', cancelLabel: '取消', danger: true,
          onConfirm: () => {
            t.rec.clear();
            turn.persist(true);
          },
        },
        true
      );
      return undefined;
    }
    if (id === 'draw:submit' || id === 'draw:retry') return send(t, false);
    if (id === 'draw:report') return reportSource(t);
    return undefined;
  };

  turn.describeHit = function describeHit(id) {
    const t = c.turn;
    if (!t) return undefined;
    if (t.forced || t.sending) return undefined;
    if (id === 'describe:back') return confirmLeave();
    if (id === 'describe:input') return openKeyboard(t);
    if (id === 'describe:submit' || id === 'describe:retry') return send(t, false);
    if (id === 'describe:report') return reportSource(t);
    return undefined;
  };

  function reportSource(t) {
    if (!t.canReport) return undefined;
    // live: the server-issued opaque reference names the source (TD-140); 慢慢传: the chain id and step as before
    if (live(t)) return t.reportRef ? X.openReport({ roomId: t.roomId, reportRef: t.reportRef, step: t.round - 1 }) : undefined;
    return X.openReport({ chainId: t.chainId, step: t.step - 1 });
  }

  // --------------------------------------------------------------------------------------------------------------- vms

  turn.drawVm = function drawVm(t) {
    const tn = c.turn;
    const rec = tn.rec;
    const canEdit = tn.status !== 'sending' && tn.status !== 'timeUp';
    return V.drawVm(
      {
        mode: tn.mode, roomId: tn.roomId, round: tn.round, rounds: tn.rounds, chainId: tn.chainId, claimId: tn.claimId, step: tn.step,
        source: tn.source, sourceLines: tn.sourceLines, canReport: tn.canReport, secLeft: tn.secLeft, warnSec: X.warnSec(), canvas: tn.canvas, gridH: tn.gridH,
        palette: tn.palette, colorIdx: tn.colorIdx, sizeIdx: tn.sizeIdx, strokes: rec.strokes, drawingNow: rec.drawingNow, strokesRev: rec.rev, pointsUsed: rec.pointsUsed,
        limited: rec.pointsUsed >= CONFIG.strokes.maxPoints || rec.blocked, pathFull: rec.pathFull && rec.pointsUsed < CONFIG.strokes.maxPoints,
        canUndo: rec.canUndo && canEdit, canSubmit: rec.canSubmit && canEdit, status: tn.status, statusText: tn.statusText, coach: tn.coachUntil > t && !tn.forced,
      },
      X.cm(t)
    );
  };

  turn.describeVm = function describeVm(t) {
    const tn = c.turn;
    return V.describeVm(
      {
        mode: tn.mode, roomId: tn.roomId, round: tn.round, rounds: tn.rounds, chainId: tn.chainId, claimId: tn.claimId, step: tn.step,
        source: tn.source, canReport: tn.canReport, secLeft: tn.secLeft, warnSec: X.warnSec(), text: tn.text,
        canSubmit: text.validCharCount(tn.text) >= CONFIG.text.describeMin && ['typing', 'blocked', 'busy', 'error'].includes(tn.status),
        keyboardH: tn.kbOpen ? keyboard.height : 0, status: tn.status, errorText: tn.errorText, caret: tn.kbOpen && Math.floor(t / 500) % 2 === 0 && !tn.sending && !tn.forced, shake: tn.shakeUntil > t,
      },
      X.cm(t)
    );
  };

  // -------------------------------------------------------------------------------------------------------------- the clock

  function lockInput(t) {
    t.forced = true;
    if (t.rec && t.rec.drawingNow) t.rec.end(); // the stroke in progress ends at its last kept point and is kept
    t.kbOpen = false;
    keyboard.close();
    if (c.ui.dialog && c.ui.dialog.forTurn) c.ui.dialog = null; // an open 清空 / 离开 confirm closes
    if (c.report) c.report = null;
    if (!t.sending) {
      t.status = 'timeUp';
      t.statusText = null;
      t.errorText = null;
    }
    X.invalidate();
  }

  turn.tick = function tick(tms) {
    const t = c.turn;
    if (!t || !(c.screen === 'draw' || c.screen === 'describe') || t.done) return;
    const sec = secLeft(t, tms);
    if (sec !== t.secLeft) {
      t.secLeft = sec;
      X.invalidate();
    }
    if (!t.tickDone && sec <= X.warnSec() && sec > 0 && !t.forced) {
      t.tickDone = true;
      t.tickUntil = tms + TICK_MS;
      audio.play('tick'); // one soft tick at 10 s (muted if sound is off)
      X.invalidate();
    }
    if (t.coachUntil && t.coachUntil <= tms) dismissCoach();
    if (sec <= 0 && !t.forced) lockInput(t);
    if (t.forced && !t.sending && (!t.retryAt || tms >= t.retryAt)) {
      if (live(t) && t.graceMs && t.deadline + t.graceMs + 500 < tms + c.offset) return giveUpLive(t);
      send(t, true);
    }
    if (t.kind === 'describe' && t.kbOpen && Math.floor(tms / 500) !== c.lastCaretBeat) {
      c.lastCaretBeat = Math.floor(tms / 500);
      X.invalidate();
    }
    if (t.shakeUntil && tms >= t.shakeUntil) {
      t.shakeUntil = 0;
      X.invalidate();
    }
  };

  /** live: the retry window (deadline + grace) is over and nothing got through: the server's empty marker stands (5.8 item 3) */
  function giveUpLive(t) {
    t.done = true;
    turn.clear();
    X.toast('网络不好，这一棒没有交上');
    X.room.afterSend({ round: t.round, mine: { marker: t.kind === 'draw' ? 'emptyDraw' : 'emptyText' }, local: true });
  }

  // -------------------------------------------------------------------------------------------------------------- sending

  function payloadOf(t, auto) {
    const p = { empty: false };
    if (t.kind === 'draw') {
      const n = t.rec.strokeCount;
      const unchangedBlock = t.blockedRev !== undefined && t.blockedRev === t.rec.rev;
      if (auto && (n < 1 || unchangedBlock || t.invalid)) p.empty = true;
      else if (n < 1) return null;
      else {
        const strokes = t.rec.drawing();
        const v = strokesLib.validate(strokes);
        if (!v.ok) {
          if (auto) p.empty = true;
          else return { error: 'INVALID_STROKES' };
        } else {
          p.strokes = strokes;
          p.stats = v;
        }
      }
    } else {
      const raw = (t.text || '').trim();
      const valid = text.validCharCount(raw) >= CONFIG.text.describeMin;
      const unchangedBlock = t.blockedText !== undefined && t.blockedText === t.text;
      if (auto) {
        if (!valid || unchangedBlock) p.empty = true;
        else p.text = raw;
      } else {
        const v = text.validate(raw, 'describe');
        if (!v.ok) return { error: 'TEXT_REJECTED' };
        p.text = v.text;
      }
    }
    return p;
  }

  function send(t, auto) {
    if (c.turn !== t || t.sending || t.done) return undefined;
    if (t.rec && t.rec.drawingNow) t.rec.end();
    const p = payloadOf(t, auto || t.forced);
    if (!p) return undefined;
    if (p.error) {
      t.status = 'blocked';
      t.errorText = p.error === 'TEXT_REJECTED' ? X.codeText('TEXT_REJECTED') : X.codeText(p.error);
      t.statusText = t.kind === 'draw' ? t.errorText : null;
      return X.invalidate();
    }
    const isAuto = !!(auto || t.forced);
    t.sending = true;
    t.retryAt = 0;
    if (!t.forced) {
      t.status = 'sending';
      t.statusText = null;
      t.errorText = null;
    }
    X.invalidate();
    const ms = Math.max(0, X.now() - t.startedLocal);
    if (t.kind === 'draw') {
      X.track('step_submit', {
        mode: t.mode, chainId: t.chainId, step: t.step || t.round, kind: 'draw', durationMs: ms, auto: isAuto, empty: p.empty, canvasH: t.gridH,
        strokes: p.stats ? p.stats.strokes : 0, points: p.stats ? p.stats.points : 0, undoCount: t.rec.undoCount,
        colorsUsed: p.strokes ? strokesLib.colorsUsed(p.strokes) : undefined, palette: p.strokes ? strokesLib.usesPaletteColor(p.strokes) : false,
      });
    } else X.track('step_submit', { mode: t.mode, chainId: t.chainId, step: t.step || t.round, kind: 'describe', durationMs: ms, auto: isAuto, empty: p.empty, chars: p.text ? text.count(p.text) : 0 });
    let call;
    if (live(t)) {
      const body = { roomId: t.roomId, round: t.round, auto: isAuto, empty: p.empty, clientMs: ms };
      if (p.strokes) body.strokes = p.strokes;
      if (p.text) body.text = p.text;
      call = api.submitRoomStep(body);
    } else {
      const body = { chainId: t.chainId, claimId: t.claimId, auto: isAuto, empty: p.empty, clientMs: ms, undoCount: t.rec ? t.rec.undoCount : 0 };
      if (p.strokes) body.strokes = p.strokes;
      if (p.text) body.text = p.text;
      call = api.submitStep(body);
    }
    return call.then((r) => {
      if (c.turn !== t) return;
      t.sending = false;
      handle(t, r, p, isAuto);
    });
  }
  turn.send = send;

  function handle(t, r, p, auto) {
    X.noteServerTime(r);
    const forced = t.forced;
    if (r && r.ok) {
      t.done = true;
      turn.clear();
      return live(t) ? afterLive(t, r, p) : X.chain.afterSubmit(t, r, p);
    }
    const code = r ? r.code : 'NETWORK';
    X.track('step_result', { mode: t.mode, chainId: t.chainId, step: t.step || t.round, kind: t.kind, result: resultOf(code) });
    if (live(t)) {
      if (code === 'ALREADY_SENT') {
        t.done = true;
        turn.clear();
        return afterLive(t, { ok: true, state: 'sent' }, p);
      }
      if (code === 'ROUND_OVER') {
        t.done = true;
        turn.clear();
        X.toast(X.codeText('ROUND_OVER'));
        return X.room.afterSend({ round: t.round, mine: contentOf(t, p), local: true });
      }
      if (['NOT_IN_ROOM', 'ROOM_NOT_FOUND', 'ROOM_CLOSED'].includes(code)) {
        t.done = true;
        turn.clear();
        X.toast(X.codeText(code));
        return X.room.gone();
      }
    } else if (code === 'CLAIM_LOST' || code === 'CHAIN_CLOSED') {
      t.done = true;
      turn.clear();
      return X.chain.turnLost(t, code);
    } else if (r && r.reopened) {
      // 慢慢传, a forced send that did not pass: the 棒 reopened for anyone eligible (5.8)
      t.done = true;
      turn.clear();
      return X.chain.afterBlocked(t, p, code);
    }
    if (MANUAL_CODES.includes(code)) {
      if (forced) {
        // the work is refused at time-up: send it again as an empty marker (the server would only add another strike)
        if (t.kind === 'draw') t.blockedRev = t.rec.rev;
        else t.blockedText = t.text;
        if (code === 'INVALID_STROKES') t.invalid = true;
        t.retryAt = X.now() + (code === 'MODERATION_BUSY' ? RETRY_MS : 0);
        if (code === 'MODERATION_BUSY') t.retryAt = X.now() + RETRY_MS;
        else t.retryAt = 0;
        return X.invalidate();
      }
      if (code === 'IMAGE_BLOCKED' || code === 'TEXT_BLOCKED' || code === 'TEXT_REJECTED') {
        t.status = 'blocked';
        if (t.kind === 'draw') t.blockedRev = t.rec.rev;
        else t.blockedText = t.text;
        t.errorText = X.codeText(code);
        t.statusText = t.kind === 'draw' ? '这幅画没通过审核，改一改再交' : null;
      } else if (code === 'MODERATION_BUSY') {
        t.status = t.kind === 'describe' ? 'busy' : 'error';
        t.errorText = X.codeText(code);
        t.statusText = t.kind === 'draw' ? t.errorText : null;
      } else {
        t.status = 'blocked';
        t.errorText = X.codeText(code);
        t.statusText = t.kind === 'draw' ? t.errorText : null;
      }
      return X.invalidate();
    }
    // network, rate limit, internal, policy answers
    if (forced) {
      t.retryAt = X.now() + RETRY_MS; // every second until deadline + grace (live) or claim loss (慢慢传)
      return X.invalidate();
    }
    t.status = 'error';
    t.errorText = code === 'RATE_LIMITED' ? X.codeText(code) : X.isNet(r) || code === 'INTERNAL' ? '没传出去' : X.codeText(code);
    t.statusText = t.errorText;
    X.track('error', { where: live(t) ? 'submitRoomStep' : 'submitStep', code });
    return X.invalidate();
  }

  const resultOf = (code) =>
    ({ TEXT_BLOCKED: 'blocked', IMAGE_BLOCKED: 'blocked', MODERATION_BUSY: 'busy', TEXT_REJECTED: 'rejected', ROUND_OVER: 'roundOver', CLAIM_LOST: 'claimLost' }[code] || 'error');

  /** what the player sent, in the vm `mine` shape */
  function contentOf(t, p) {
    if (p.empty) return { marker: t.kind === 'draw' ? 'emptyDraw' : 'emptyText' };
    if (t.kind === 'draw') return { strokes: p.strokes };
    return { text: p.text };
  }
  turn.contentOf = contentOf;

  function afterLive(t, r, p) {
    X.track('step_result', { mode: 'live', step: t.round, kind: t.kind, result: r.state === 'marker' ? 'marker' : 'passed' });
    const mine = r.state === 'marker' ? { marker: r.marker || (t.kind === 'draw' ? 'emptyDraw' : 'emptyText') } : contentOf(t, p);
    X.room.afterSend({ round: t.round, mine, resp: r });
  }

  return turn;
};
