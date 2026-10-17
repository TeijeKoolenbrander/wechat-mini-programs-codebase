/**
 * The pick screen, both modes (spec 4, 8.3): the server rolls 3 prompts from 3 categories (the bank never reaches the client),
 * the player picks one, rerolls up to 5 times (换一批, the server counts them) or types their own (自己出题, moderated before use).
 *   live   round 0 of a room: the roll arrives with getRoom; 30 s; no back button; at 0 the selected (or first) rolled prompt is sent
 *          (an unsent or blocked custom text never is, 4.2); a pick is `submitRoomStep` round 0
 *   chain  慢慢传: `rollPrompts` -> `createChain({rollId, promptId} | {customText})` -> the draw turn of 第 1 棒
 */

const text = require('../core/text');
const { CONFIG } = require('../core/config');
const V = require('./vm');

/** the server's rerollLeft as a safe count 0..rerollsPerPick (anything else is 0: the button stays greyed) */
const rerollsDone = (p) => CONFIG.roll.rerollsPerPick - p.rerollLeft;
const leftOf = (n) => (Number.isInteger(n) ? Math.max(0, Math.min(CONFIG.roll.rerollsPerPick, n)) : 0);

const CREATE_MS = 5000; // 8.3: the chain is created within 5 s, then the error state
const RETRY_MS = 1000;

module.exports = function install(X) {
  const { c, api, keyboard } = X;
  const pick = {};

  const secLeft = (p, tms) => (p.mode === 'live' ? Math.max(0, Math.ceil((p.deadline - (tms + c.offset)) / 1000)) : 0);
  const cats = (prompts) => (prompts.length === 3 && prompts.every((x) => /^[A-L]/.test(x.id)) ? prompts.map((x) => x.id[0]).join('') : undefined);

  function fresh(mode, roll) {
    const prompts = (roll.prompts || []).map((x) => ({ id: x.id, text: x.text }));
    return {
      mode, state: 'ready', rollId: roll.rollId, prompts, selectedId: prompts.length ? prompts[0].id : null, rerollLeft: leftOf(roll.rerollLeft),
      custom: { open: false, text: '', error: null, passed: false }, errorText: null, sending: false, forced: false, retryAt: 0, token: 0, openedAt: X.now(),
      rerolled: false, source: 'roll',
    };
  }

  // -------------------------------------------------------------------------------------------------------------- opening

  /** live round 0: the assignment's roll */
  pick.openLive = function openLive(resp) {
    const a = resp.assignment;
    const p = fresh('live', a.roll);
    p.roomId = resp.roomId;
    p.round = 0;
    p.deadline = resp.deadline;
    p.graceMs = (resp.graceSec || 0) * 1000;
    c.pick = p;
    X.track('prompt_roll', { mode: 'live', reroll: false, rerollNo: 0, cats: cats(p.prompts) });
    X.go('pick');
  };

  /** a newer getRoom answer while the live pick is open: the deadline, and the roll if it changed (a reroll that was answered elsewhere) */
  pick.syncLive = function syncLive(resp) {
    const p = c.pick;
    if (!p || p.mode !== 'live' || !resp.assignment || !resp.assignment.roll) return;
    p.deadline = resp.deadline;
    const roll = resp.assignment.roll;
    if (p.forced || secLeft(p, X.now()) <= 0) return; // time is up: the screen stays frozen with the cards it shows (spec 17 edge 26)
    if (roll.rollId !== p.rollId) {
      applyRoll(p, roll);
    } else if (leftOf(roll.rerollLeft) < p.rerollLeft) p.rerollLeft = leftOf(roll.rerollLeft);
    X.invalidate();
  };

  function applyRoll(p, roll) {
    p.rollId = roll.rollId;
    p.prompts = (roll.prompts || []).map((x) => ({ id: x.id, text: x.text }));
    p.rerollLeft = leftOf(roll.rerollLeft);
    if (!p.prompts.some((x) => x.id === p.selectedId)) p.selectedId = p.prompts.length ? p.prompts[0].id : null;
    p.custom = { open: false, text: '', error: null, passed: false };
    keyboard.close();
  }

  /** 慢慢传: roll, then show the pick. `from` = where 返回 goes */
  pick.openChain = async function openChain(from) {
    c.pick = { mode: 'chain', state: 'loading', rollId: '', prompts: [], selectedId: null, rerollLeft: 0, custom: { open: false, text: '', error: null, passed: false }, errorText: null, sending: false, forced: false, retryAt: 0, token: 0, openedAt: X.now(), rerolled: false, source: 'roll' };
    X.track('picker_view', { source: from === 'slow' ? 'slow' : 'home' });
    X.go('pick', X.screenForBack());
    return loadChainRoll();
  };

  async function loadChainRoll() {
    const p = c.pick;
    if (!p) return;
    p.state = 'loading';
    p.errorText = null;
    X.invalidate();
    const r = await api.rollPrompts({});
    if (c.pick !== p) return;
    if (r && r.ok) {
      X.noteServerTime(r);
      const f = fresh('chain', r);
      Object.assign(p, f, { token: p.token });
      X.track('prompt_roll', { mode: 'chain', reroll: false, rerollNo: 0, cats: cats(p.prompts) });
    } else {
      const code = r ? r.code : 'NETWORK';
      if (['RULES_REQUIRED'].includes(code)) {
        c.me.rulesVersion = 0;
        c.pick = null;
        X.goHome();
        return X.openRules('start');
      }
      p.state = X.isNet(r) ? 'offline' : 'error';
      p.errorText = X.isNet(r) ? '需联网才能开始' : X.codeText(code);
      X.track('error', { where: 'rollPrompts', code });
    }
    X.invalidate();
  }

  // ------------------------------------------------------------------------------------------------------------------ vm

  pick.vm = function vm(t) {
    const p = c.pick;
    const sec = secLeft(p, t);
    return V.pickVm(Object.assign({}, p, { secLeft: sec, warnSec: X.warnSec(), drawSec: c.features.timers.drawSec }), X.cm(t));
  };

  // ------------------------------------------------------------------------------------------------------------- keyboard

  function openCustomKeyboard() {
    const p = c.pick;
    if (!p || p.forced) return;
    keyboard.open({
      value: p.custom.text,
      maxLength: 40,
      placeholder: '输入你的题目',
      onInput: (v) => {
        if (c.pick !== p || p.forced) return;
        p.custom.text = text.inputFilter(v, 'prompt').text;
        p.custom.error = null;
        X.invalidate();
      },
      onConfirm: () => submit(false),
      onClose: X.invalidate,
    });
  }

  // ------------------------------------------------------------------------------------------------------------------ hits

  pick.hit = function hit(id) {
    const p = c.pick;
    if (!p) return undefined;
    if (id === 'pick:back') {
      if (p.mode === 'live') return undefined;
      keyboard.close();
      c.pick = null;
      return X.navBack('pick');
    }
    if (p.forced || p.sending || p.state === 'timeUp') return undefined;
    if (p.state === 'rerolling' && id !== 'pick:reroll') return undefined; // a reroll is in flight: further taps (also on 换一批) send nothing
    if (id.indexOf('pick:item:') === 0) {
      const pid = id.slice('pick:item:'.length);
      if (!p.prompts.some((x) => x.id === pid)) return undefined;
      p.selectedId = pid;
      p.custom.open = false;
      p.errorText = null;
      if (p.state === 'error') p.state = 'ready';
      keyboard.close();
      return X.invalidate();
    }
    if (id === 'pick:reroll') return reroll();
    if (id === 'pick:custom') {
      p.custom.open = true;
      p.custom.error = null;
      openCustomKeyboard();
      return X.invalidate();
    }
    if (id === 'pick:customInput') return openCustomKeyboard();
    if (id === 'pick:customCancel') {
      p.custom = { open: false, text: '', error: null, passed: false };
      keyboard.close();
      return X.invalidate();
    }
    if (id === 'pick:customOk' || id === 'pick:start') return submit(false);
    if (id === 'pick:retry') return p.state === 'loading' || !p.rollId ? loadChainRoll() : submit(false);
    return undefined;
  };

  /** 换一批 (spec 4.1, AC 164-168): up to 5 per pick, counted by the SERVER. At rerollLeft 0 the button is greyed out and has no hit id,
   *  so nothing reaches here; the guard below also makes a stray call a no-op (no request, no event, no toast, no state change). */
  async function reroll() {
    const p = c.pick;
    if (!p || p.rerolling || p.forced || p.state !== 'ready' || p.rerollLeft < 1) return;
    p.rerolling = true;
    p.state = 'rerolling';
    X.invalidate();
    const body = p.mode === 'live' ? { roomId: p.roomId, reroll: true, rollId: p.rollId } : { reroll: true, rollId: p.rollId };
    const r = await api.rollPrompts(body);
    p.rerolling = false;
    if (c.pick !== p) return;
    if (p.forced || p.state === 'timeUp') return; // time ran out mid-reroll: the screen stays frozen with the cards it shows (edge 26)
    if (p.state === 'rerolling') p.state = 'ready';
    if (r && r.ok) {
      X.noteServerTime(r);
      applyRoll(p, r);
      p.rerolled = true;
      p.source = 'reroll';
      p.errorText = null;
      X.track('prompt_roll', { mode: p.mode, reroll: true, rerollNo: rerollsDone(p), cats: cats(p.prompts) });
    } else {
      const code = r ? r.code : 'NETWORK';
      if (code === 'REROLL_LIMIT') {
        p.rerollLeft = 0; // the server's counter is spent: grey the button, the cards stay
        X.toast(X.codeText(code));
      } else if (code === 'BAD_REQUEST') {
        await reloadRoll(p); // a stale rollId: show the server's current set and count
      } else {
        if (code === 'ALREADY_SENT' || code === 'ROUND_OVER') p.rerollLeft = 0;
        X.toast(X.codeText(X.isNet(r) ? 'NETWORK' : code));
      }
    }
    X.invalidate();
  }

  /** the server's CURRENT roll (a plain rollPrompts call changes nothing) */
  async function reloadRoll(p) {
    const r = await api.rollPrompts(p.mode === 'live' ? { roomId: p.roomId } : {});
    if (c.pick !== p || p.forced) return;
    if (r && r.ok) applyRoll(p, r);
    else X.toast(X.codeText(X.isNet(r) ? 'NETWORK' : r ? r.code : 'NETWORK'));
  }

  // ----------------------------------------------------------------------------------------------------------------- send

  function promptTextOf(p, id) {
    const x = p.prompts.find((q) => q.id === id);
    return x ? x.text : '';
  }

  async function submit(forced) {
    const p = c.pick;
    if (!p || p.sending) return;
    if (!forced && p.rerolling) return; // the set is changing: the next tap picks from the new one
    const custom = !forced && p.custom.open;
    let customText = null;
    if (custom) {
      const v = text.validate(p.custom.text, 'prompt');
      if (!v.ok) {
        p.custom.error = X.codeText('TEXT_REJECTED'); // rejected locally: no API call, no strike (AC 34, 35)
        X.track('custom_prompt_result', { mode: p.mode, result: 'local' });
        return X.invalidate();
      }
      customText = v.text;
    } else if (!p.selectedId && !(forced && p.prompts.length)) return;
    const selected = p.selectedId || (p.prompts[0] && p.prompts[0].id);
    keyboard.close();
    p.sending = true;
    p.errorText = null;
    if (!forced) p.state = 'sending';
    const token = ++p.token;
    p.creatingAt = X.now();
    X.invalidate();
    if (p.mode === 'live') {
      const body = { roomId: p.roomId, round: 0, auto: !!forced, empty: false, clientMs: Math.max(0, X.now() - p.openedAt) };
      if (customText) body.customText = customText;
      else {
        body.rollId = p.rollId;
        body.promptId = selected;
      }
      const r = await api.submitRoomStep(body);
      if (c.pick !== p || p.token !== token) return;
      p.sending = false;
      return liveResult(p, r, customText, selected, forced);
    }
    const data = customText ? { customText } : { rollId: p.rollId, promptId: selected };
    Object.assign(data, X.groupData());
    const r = await api.createChain(data);
    if (c.pick !== p || p.token !== token) {
      // timed out (or left) while the server was working: a chain that was created after all is released, nobody is waiting for it
      if (r && r.ok) api.releaseClaim({ chainId: r.chainId, claimId: r.claim.claimId });
      return;
    }
    p.sending = false;
    return chainResult(p, r, customText, selected);
  }
  pick.submit = submit;

  function liveResult(p, r, customText, selected, forced) {
    if (r && r.ok) {
      X.noteServerTime(r);
      X.track('prompt_pick', { mode: 'live', source: forced ? 'auto' : customText ? 'custom' : p.source, promptId: customText ? undefined : selected, rerolled: p.rerolled, rerolls: rerollsDone(p), pickMs: Math.max(0, X.now() - p.openedAt) });
      if (customText) X.track('custom_prompt_result', { mode: 'live', result: 'pass' });
      const shown = customText || promptTextOf(p, selected);
      c.pick = null;
      return X.room.afterSend({ round: 0, mine: { text: shown }, resp: r });
    }
    const code = r ? r.code : 'NETWORK';
    X.track('step_result', { mode: 'live', kind: 'describe', step: 0, result: code === 'ROUND_OVER' ? 'roundOver' : 'error' });
    if (code === 'ALREADY_SENT' || code === 'ROUND_OVER') {
      c.pick = null;
      if (code === 'ROUND_OVER') X.toast(X.codeText('ROUND_OVER'));
      return X.room.afterSend({ round: 0, mine: { text: promptTextOf(p, selected) }, local: true });
    }
    if (['NOT_IN_ROOM', 'ROOM_NOT_FOUND', 'ROOM_CLOSED'].includes(code)) {
      c.pick = null;
      X.toast(X.codeText(code));
      return X.room.gone();
    }
    if (customText && (code === 'TEXT_BLOCKED' || code === 'TEXT_REJECTED')) {
      p.state = 'ready';
      p.custom.error = code === 'TEXT_BLOCKED' ? '这个题目不太合适，换一个吧' : X.codeText('TEXT_REJECTED');
      X.track('custom_prompt_result', { mode: 'live', result: code === 'TEXT_BLOCKED' ? 'risky' : 'local' });
      return X.invalidate();
    }
    if (code === 'MODERATION_BUSY') {
      p.state = 'error';
      p.errorText = '审核服务繁忙，请稍后再试，或先选一个现成的题目';
      if (customText) X.track('custom_prompt_result', { mode: 'live', result: 'busy' });
      return X.invalidate();
    }
    if (forced || p.forced) {
      p.retryAt = X.now() + RETRY_MS;
      return X.invalidate();
    }
    p.state = X.isNet(r) ? 'offline' : 'error';
    p.errorText = X.isNet(r) ? '需联网才能开始' : X.codeText(code);
    return X.invalidate();
  }

  function chainResult(p, r, customText, selected) {
    if (r && r.ok) {
      X.noteServerTime(r);
      X.track('prompt_pick', { mode: 'chain', source: customText ? 'custom' : p.source, promptId: customText ? undefined : selected, rerolled: p.rerolled, rerolls: rerollsDone(p), pickMs: Math.max(0, X.now() - p.openedAt) });
      if (customText) X.track('custom_prompt_result', { mode: 'chain', result: 'pass' });
      X.track('chain_create', { chainId: r.chainId, bound: c.group.status === 'ok' });
      c.pick = null;
      return X.turn.begin({
        mode: 'chain', kind: 'draw', chainId: r.chainId, claimId: r.claim.claimId, step: 1, source: { kind: 'prompt', text: r.claim.sourceText, canReport: false },
        deadline: r.claim.expiresAt - CONFIG.chain.claimTtlMs + r.claim.timerSec * 1000,
      });
    }
    const code = r ? r.code : 'NETWORK';
    p.state = 'ready';
    if (code === 'TEXT_BLOCKED') {
      p.custom.error = '这个题目不太合适，换一个吧';
      X.track('custom_prompt_result', { mode: 'chain', result: 'risky' });
    } else if (code === 'TEXT_REJECTED') {
      p.custom.error = X.codeText('TEXT_REJECTED');
      X.track('custom_prompt_result', { mode: 'chain', result: 'local' });
    } else if (code === 'MODERATION_BUSY') {
      p.state = 'error';
      p.errorText = '审核服务繁忙，请稍后再试，或先选一个现成的题目';
      X.track('custom_prompt_result', { mode: 'chain', result: 'busy' });
    } else if (X.isNet(r)) {
      p.state = 'offline';
      p.errorText = code === 'RATE_LIMITED' ? X.codeText(code) : '需联网才能开始';
    } else if (code === 'RULES_REQUIRED') {
      c.me.rulesVersion = 0;
      X.openRules('start');
    } else if (['START_LIMIT', 'RESTRICTED', 'UGC_PAUSED', 'UGC_BUSY', 'IN_ROOM', 'STEP_LIMIT'].includes(code)) {
      X.toast(X.codeText(code));
      X.track('error', { where: 'createChain', code });
      c.pick = null;
      return X.goHome();
    } else if (code === 'BAD_REQUEST') {
      // the roll is gone (spent, expired, a second device): roll again
      return loadChainRoll();
    } else {
      p.state = 'error';
      p.errorText = X.codeText(code);
      X.track('error', { where: 'createChain', code });
    }
    return X.invalidate();
  }

  // ------------------------------------------------------------------------------------------------------------------ clock

  pick.tick = function tick(tms) {
    const p = c.pick;
    if (!p) return;
    if (p.mode === 'live') {
      const sec = secLeft(p, tms);
      if (sec !== p.secLeft) {
        p.secLeft = sec;
        X.invalidate();
      }
      if (sec <= 0 && !p.forced) {
        // time is up: input stops, the selected (or first) rolled prompt is sent (an unsent custom text is dropped, 4.2)
        p.forced = true;
        p.state = 'timeUp';
        p.custom = { open: false, text: '', error: null, passed: false };
        keyboard.close();
        if (c.ui.dialog && c.ui.dialog.forTurn) c.ui.dialog = null;
        X.invalidate();
      }
      if (p.forced && !p.sending && (!p.retryAt || tms >= p.retryAt)) {
        if (p.graceMs && p.deadline + p.graceMs + 500 < tms + c.offset) {
          c.pick = null;
          X.toast('网络不好，这一棒没有交上');
          return X.room.afterSend({ round: 0, mine: { text: promptTextOf(p, p.selectedId || (p.prompts[0] && p.prompts[0].id)) }, local: true });
        }
        p.retryAt = 0;
        submit(true);
      }
    } else if (p.sending && tms - p.creatingAt > CREATE_MS) {
      p.token++; // the pending answer is stale now
      p.sending = false;
      p.state = 'offline';
      p.errorText = '没连上，请重试';
      X.invalidate();
    }
  };

  return pick;
};
