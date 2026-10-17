/**
 * 出题 / 猜 / 揭晓 (spec 2.2, 6.5-6.7, 6.12, 7.2-7.4, PD-7..9, PD-31..40, AC 26-35, 62-63, 83-100).
 *
 * Create: three spectra from the shipped library (one free 换一组, then rewarded 换一批 <= 3), the server draws the
 * hidden target (host only, never logged or shared). The clue step has two tabs (D-2): 自己写 (default every time: a typed clue
 * of up to 12 Chinese characters, checked locally by core/clue.js, then by the server and WeChat's game text check, fail
 * closed) and 选一个提示词 (the 6 presets). 我在群里说 no longer exists; old `chat` rounds still display. The typed draft
 * lives in memory only: never in storage, events, share models or open data messages (spec 10, AC 95, 96). Share carries
 * `r=<roundId>` only. Guess: the spectrum, the clue line (typed clue in 「」 with 举报) and the count; never other guesses or
 * the target before the reveal (the server enforces it, AC 30). Reveal: target, guesses, 本题默契值, the name list drawn by
 * the open data domain. No ad exists in this flow except the rewarded 换一批 (PD-28, AC 55).
 */

const R = require('../../core/rounds');
const { sub } = require('../../core/rng');
const { randomSeed } = require('../../core/rng');
const { checkClue } = require('../../core/clue');
const VM = require('../vm');
const CU = require('../clue-ui');
const build = require('../build-config');

module.exports = function install(K) {
  const { st, store, api, ruler, ads, content, share, privacy, odc } = K;
  const keyboard = K.keyboard;

  // ---- create ------------------------------------------------------------------------------------------------------------------

  function rngFor(c, name) {
    c.n += 1;
    return sub(c.seed, name + ':' + c.n);
  }

  function offerSpectra(c) {
    const list = R.offerSpectra(content, rngFor(c, 'spectra'), c.seenSpectra, 3);
    list.forEach((s) => c.seenSpectra.add(s.id));
    c.spectra = list;
  }

  function offerClues(c) {
    const list = R.offerClues(content, c.spectrumId, rngFor(c, 'clues'), c.seenClues, 6);
    list.forEach((o) => c.seenClues.add(o.itemId));
    c.clueOptions = list;
    c.clueItemId = null;
  }

  const labelsOf = (c) => ({ leftLabel: c.left, rightLabel: c.right });
  const cachedAgreed = () => store.state.rulesAgreedVersion >= CU.RULES_VERSION;

  /** Local rule check of the draft (core/clue.js). null when the draft is empty or passes, else {reason, text}. */
  function localHint(c) {
    if (!c.text) return null;
    const r = checkClue(c.text, labelsOf(c));
    if (r.ok || r.reason === 'empty') return null;
    const reason = CU.reasonName(r.reason);
    return { reason, text: r.hint || CU.hintFor(reason, c.left, c.right) || '换个说法吧' };
  }

  /** The typed-tab state fields every tab-1 decision reads. */
  const textUsable = (c) => !!(c.ugc && c.ugc.createEnabled && !c.ugc.restriction);

  K.startCreate = function startCreate() {
    ruler.reset();
    st.play = null;
    const c = {
      step: 'pickSpectrum',
      spectra: [],
      seenSpectra: new Set(),
      seenClues: new Set(),
      freeSwapLeft: 1,
      adSwapLeft: 3,
      roundId: null,
      target: null, // host-only: kept in memory for the band, never logged, shared or sent anywhere
      targetBand: null,
      // clue step (D-2)
      tab: 'text',
      tabs: ['text', 'preset'],
      ugc: { createEnabled: true, rulesAgreed: cachedAgreed(), restriction: null, warnPending: false },
      text: '', // the author's draft: memory only
      hint: null, // local rule hint, 150 ms after the last keystroke
      serverHint: null, // TEXT_REJECTED / TEXT_BLOCKED
      busyBox: false,
      sending: false,
      kbOpen: false,
      shareConfirm: false, // E13 fallback: the check passed, the second tap shares
      passed: false,
      sheet: null, // null | 'rules' | 'rulesReadOnly' | 'warn'
      afterRules: null, // 'keyboard' | 'send'
      agreeing: false,
      tabSwitches: 0,
      hintTimer: null,
      clueOptions: [],
      clueItemId: null,
      clueSwapLeft: 1,
      spectrumId: null,
      left: '',
      right: '',
      presetSwaps: 0,
      swapsFree: 0,
      swapsAd: 0,
      seed: randomSeed(),
      n: 0,
      sharing: false,
    };
    offerSpectra(c);
    st.create = c;
    st.adState.swap = 'idle';
    K.go('create');
  };

  K.closeKeyboard = function closeKeyboard() {
    keyboard.close();
    if (st.create) st.create.kbOpen = false;
  };

  /** Leaving the create screen (K.go): the keyboard closes and the draft is wiped from memory. */
  K.leaveCreate = function leaveCreate() {
    const c = st.create;
    keyboard.close();
    if (!c) return;
    c.kbOpen = false;
    c.text = '';
    c.hint = null;
    c.serverHint = null;
    c.busyBox = false;
    c.sheet = null;
    if (c.hintTimer) clearTimeout(c.hintTimer);
    c.hintTimer = null;
  };

  /** App hidden or shown again: the keyboard is closed, the draft stays in the box (spec 6.5). */
  K.onAppVisibility = function onAppVisibility() {
    if (st.create && st.create.kbOpen) K.closeKeyboard();
    else keyboard.close();
  };

  K.on('create:back', () => K.goHome());

  K.on('create:swapFree', () => {
    const c = st.create;
    if (!c || c.step !== 'pickSpectrum' || c.freeSwapLeft < 1) return;
    c.freeSwapLeft -= 1;
    c.swapsFree += 1;
    offerSpectra(c);
  });

  K.on('create:swapAd', async () => {
    const c = st.create;
    if (!c || c.step !== 'pickSpectrum' || c.freeSwapLeft > 0 || c.adSwapLeft < 1) return;
    if (st.adState.swap === 'loading') return;
    st.adState.swap = 'loading';
    K.invalidate();
    const out = await ads.rewarded('swap');
    if (st.create !== c) return;
    if (!out.granted) {
      st.adState.swap = out.reason === 'noFillBlocked' ? 'error' : 'idle';
      if (out.toast) K.toast(out.toast);
      K.invalidate();
      return;
    }
    if (out.toast) K.toast(out.toast);
    st.adState.swap = 'idle';
    c.adSwapLeft -= 1;
    c.swapsAd += 1;
    offerSpectra(c);
    K.invalidate();
  });

  /** The clue step opens: tab 1 (自己写) with an empty draft, every time (AC 83); the exceptions are restriction and the pause. */
  function openClueStep(c, src) {
    const u = CU.ugcOf(src, cachedAgreed());
    c.ugc = u;
    c.tabs = u.createEnabled ? ['text', 'preset'] : ['preset'];
    c.text = '';
    c.hint = null;
    c.serverHint = null;
    c.busyBox = false;
    c.sending = false;
    c.kbOpen = false;
    c.shareConfirm = false;
    c.passed = false;
    c.sheet = null;
    c.afterRules = null;
    c.tabSwitches = 0;
    c.tab = u.createEnabled && !u.restriction ? 'text' : 'preset';
    if (c.tab === 'preset' && u.createEnabled) K.track('clue_tab', { tab: 'preset', via: 'auto' }); // restriction
    if (u.warnPending && u.createEnabled) c.sheet = 'warn';
    // the server value is authoritative: keep the device cache in step (never ahead of the server)
    const v = u.rulesAgreed ? CU.RULES_VERSION : null;
    if (store.state.rulesAgreedVersion !== v) {
      store.state.rulesAgreedVersion = v;
      store.save();
    }
  }

  async function pickSpectrum(id) {
    const c = st.create;
    const sp = content.spectrumById[id];
    if (!c || !sp || c.step === 'creating') return;
    c.step = 'creating';
    c.spectrumId = id;
    c.left = sp.left;
    c.right = sp.right;
    K.invalidate();
    const tok = st.nav;
    const r = await api.createRound({ spectrumId: id });
    if (!K.live(tok) || st.create !== c) return;
    if (r.ok) {
      c.roundId = r.roundId;
      c.target = r.target;
      c.targetBand = { from: Math.max(0, r.target - 2), to: Math.min(100, r.target + 2) };
      c.seenClues = new Set();
      offerClues(c);
      c.clueSwapLeft = 1;
      c.presetSwaps = 0;
      c.sharing = false;
      let src = r;
      if (!r.ugc && !r.me) {
        // the answer carries no ugc block: read the host's state from getRound's `me` (contract brief); a failure keeps the defaults
        const g = await api.getRound({ roundId: r.roundId });
        if (!K.live(tok) || st.create !== c) return;
        if (g && g.ok) src = g;
      }
      openClueStep(c, src);
      c.step = 'pickClue';
      K.track('round_create', { roundId: r.roundId, spectrumId: id, swapsFree: c.swapsFree, swapsAd: c.swapsAd });
    } else if (r.code === 'RATE_LIMITED' && r.scope !== 'minute') {
      c.step = 'rateLimited';
    } else {
      K.track('error', { where: 'createRound', code: r.code || 'unknown' });
      c.step = 'error';
    }
    K.invalidate();
  }
  K.onPrefix('create:spectrum:', (id) => pickSpectrum(id));

  K.on('create:retry', () => {
    const c = st.create;
    if (!c) return;
    if (c.spectrumId) pickSpectrum(c.spectrumId);
    else c.step = 'pickSpectrum';
  });

  // ---- the clue step: tabs ----------------------------------------------------------------------------------------------------------

  function setTab(c, tab, via) {
    if (!c || c.step !== 'pickClue' || c.sending || c.sharing || c.tab === tab || c.tabs.indexOf(tab) < 0) return;
    K.closeKeyboard();
    c.tab = tab;
    c.tabSwitches += 1;
    K.track('clue_tab', { tab, via });
  }
  K.on('create:tab:text', () => setTab(st.create, 'text', 'tap'));
  K.on('create:tab:preset', () => setTab(st.create, 'preset', 'tap'));
  K.on('create:toPreset', () => setTab(st.create, 'preset', 'link'));

  K.onPrefix('create:clue:', (itemId) => {
    const c = st.create;
    if (c && c.step === 'pickClue' && c.tab === 'preset' && c.clueOptions.some((o) => o.itemId === itemId)) c.clueItemId = itemId;
  });
  K.on('create:clueSwap', () => {
    const c = st.create;
    if (!c || c.step !== 'pickClue' || c.clueSwapLeft < 1) return;
    c.clueSwapLeft -= 1;
    c.presetSwaps += 1;
    offerClues(c);
  });

  // ---- the clue step: typing ----------------------------------------------------------------------------------------------------------

  function openRules(c, after) {
    c.sheet = 'rules';
    c.afterRules = after;
    K.closeKeyboard();
    K.track('rules_view', { source: 'input' });
  }

  function openKeyboard(c) {
    const how = keyboard.open({
      value: c.text,
      maxLength: CU.CLUE_MAX,
      placeholder: '写个东西或场景，让大家猜位置',
      onInput: (v) => onInput(c, v),
      onConfirm: () => K.closeKeyboard(), // the confirm key only closes the keyboard: sending stays a deliberate tap (spec 6.5)
      onClose: () => {
        c.kbOpen = false;
        K.invalidate();
      },
    });
    if (how === 'unavailable') {
      c.kbOpen = false;
      K.toast(CU.COPY.noKeyboard);
      setTab(c, 'preset', 'auto');
      return;
    }
    c.kbOpen = how === 'keyboard';
  }

  function onInput(c, v) {
    if (st.create !== c || c.sending || c.step !== 'pickClue') return;
    const f = CU.inputFilter(v);
    if (f.changed) keyboard.update(f.text);
    c.text = f.text;
    c.serverHint = null;
    c.busyBox = false;
    c.shareConfirm = false;
    c.passed = false;
    if (c.hintTimer) clearTimeout(c.hintTimer);
    c.hintTimer = null;
    if (!c.text) c.hint = null;
    else {
      // the rule hint is checked 150 ms after the last keystroke (spec 6.5)
      c.hintTimer = setTimeout(() => {
        c.hintTimer = null;
        if (st.create !== c) return;
        c.hint = localHint(c);
        K.invalidate();
      }, CU.DEBOUNCE_MS);
    }
    K.invalidate();
  }

  K.on('create:input', () => {
    const c = st.create;
    if (!c || c.step !== 'pickClue' || c.tab !== 'text' || c.sending || c.sharing || c.sheet || !textUsable(c)) return;
    // the first tap without an agreement shows the 发言规则 sheet before the keyboard (no pre-ticked box)
    if (!c.ugc.rulesAgreed) return openRules(c, 'keyboard');
    openKeyboard(c);
  });
  K.on('create:block', () => K.closeKeyboard()); // a tap outside the input row closes the keyboard, the text stays

  // ---- the clue step: sheets ------------------------------------------------------------------------------------------------------------------

  K.on('rules:agree', async () => {
    const c = st.create;
    if (!c || c.sheet !== 'rules' || c.agreeing) return;
    c.agreeing = true;
    K.invalidate();
    const r = await api.agreeRules({ rulesVersion: CU.RULES_VERSION });
    c.agreeing = false;
    if (st.create !== c || c.sheet !== 'rules') return;
    if (!r.ok) {
      K.track('error', { where: 'agreeRules', code: r.code || 'unknown' });
      K.toast(K.copy(r.code || 'NETWORK'));
      K.invalidate();
      return;
    }
    c.ugc.rulesAgreed = true;
    store.state.rulesAgreedVersion = CU.RULES_VERSION;
    store.save();
    K.track('rules_agree', { source: 'input' });
    const after = c.afterRules;
    c.sheet = null;
    c.afterRules = null;
    if (after === 'send') await sendClue(c);
    else if (c.tab === 'text') openKeyboard(c);
    K.invalidate();
  });
  K.on('rules:decline', () => {
    const c = st.create;
    if (!c || c.sheet !== 'rules') return;
    c.sheet = null;
    c.afterRules = null;
    setTab(c, 'preset', 'auto'); // 先用提示词: nothing is stored
  });
  K.on('rules:privacy', () => {
    if (K.wx.openPrivacyContract) K.wx.openPrivacyContract({ success() {}, fail() {} });
  });
  K.on('rules:ok', () => {
    const c = st.create;
    if (st.screen === 'create' && c && c.sheet === 'rulesReadOnly') c.sheet = null;
    else if (st.sheet === 'rules') st.sheet = 'settings';
  });
  K.on('warn:ok', () => {
    const c = st.create;
    if (c && c.sheet === 'warn') c.sheet = null;
  });
  K.on('warn:rules', () => {
    const c = st.create;
    if (!c || c.sheet !== 'warn') return;
    c.sheet = 'rulesReadOnly';
    K.track('rules_view', { source: 'input' });
  });
  /** sheet:close on the create screen: the scrim and the X dismiss without choosing anything */
  K.closeCreateSheet = function closeCreateSheet() {
    const c = st.create;
    if (!c || !c.sheet) return false;
    c.sheet = null;
    c.afterRules = null;
    return true;
  };

  // ---- the clue step: sending ------------------------------------------------------------------------------------------------------------------

  K.on('create:share', () => sendClue(st.create));
  K.on('create:busyRetry', () => sendClue(st.create));
  K.on('create:busyPreset', () => {
    const c = st.create;
    if (!c) return;
    c.busyBox = false;
    setTab(c, 'preset', 'auto');
  });

  function sendClue(c) {
    if (!c || c.step !== 'pickClue' || c.sending || c.sharing || c.sheet) return Promise.resolve();
    return c.tab === 'preset' ? sendPreset(c) : sendText(c);
  }

  /** Result codes of a clue_result event; `reason` only from the spec's list. */
  function trackResult(result, reason) {
    const p = { result };
    if (reason && CU.EVENT_REASONS.indexOf(reason) >= 0) p.reason = reason;
    K.track('clue_result', p);
  }

  async function sendText(c) {
    K.closeKeyboard();
    if (c.shareConfirm && c.passed) return shareNow(c); // E13 fallback: the second tap
    if (!textUsable(c)) return undefined;
    // local rules first: a known-bad clue costs no API call and no strike
    const loc = checkClue(c.text, labelsOf(c));
    if (!loc.ok) {
      if (loc.reason === 'empty') return undefined;
      const reason = CU.reasonName(loc.reason);
      c.hint = { reason, text: loc.hint || CU.hintFor(reason, c.left, c.right) || '换个说法吧' };
      trackResult('rejected', reason);
      K.invalidate();
      return undefined;
    }
    if (c.hintTimer) clearTimeout(c.hintTimer);
    c.hintTimer = null;
    c.hint = null;
    c.serverHint = null;
    c.busyBox = false;
    c.sending = true; // 发到群里 shows 检查中… and is inert (double tap -> one setClue)
    K.invalidate();
    const r = await api.setClue({ roundId: c.roundId, clueMode: 'text', clueText: loc.text });
    if (st.create !== c) return undefined;
    c.sending = false;
    if (!r.ok) {
      textError(c, r);
      K.invalidate();
      return undefined;
    }
    c.passed = true;
    trackResult('pass');
    K.track('round_clue', { roundId: c.roundId, clueMode: 'text', presetSwaps: c.presetSwaps, chars: CU.codePoints(loc.text), tabSwitches: c.tabSwitches });
    // [SPIKE E13] the share sheet opens after an async wait; a platform that refuses it gets the second-tap button
    if (build.shareSecondTap) {
      c.shareConfirm = true;
      K.invalidate();
      return undefined;
    }
    return shareNow(c);
  }

  function textError(c, r) {
    const code = r.code;
    if (code === 'TEXT_REJECTED') {
      const reason = CU.reasonName(r.reason);
      c.serverHint = { reason, text: CU.hintFor(reason, c.left, c.right) || '换个说法吧' };
      trackResult('rejected', reason);
    } else if (code === 'TEXT_BLOCKED') {
      c.serverHint = { reason: 'moderation', text: CU.COPY.blocked };
      trackResult('blocked');
      const rs = CU.restrictionOf(r.restriction || (r.until ? { until: r.until, permanent: r.permanent } : null));
      if (rs) c.ugc.restriction = rs;
      if (r.strikeNotice || r.warnPending) c.sheet = 'warn';
    } else if (code === 'RULES_REQUIRED') {
      c.ugc.rulesAgreed = false;
      store.state.rulesAgreedVersion = null;
      store.save();
      trackResult('rulesRequired');
      openRules(c, 'send'); // after agreement the send repeats
    } else if (code === 'RESTRICTED') {
      c.ugc.restriction = CU.restrictionOf({ until: r.until, permanent: r.permanent }) || { until: 0, permanent: true };
      trackResult('restricted');
      setTab(c, 'preset', 'auto');
    } else if (code === 'UGC_PAUSED') {
      c.ugc.createEnabled = false;
      c.tabs = ['preset'];
      c.tab = 'preset';
      K.closeKeyboard();
      K.toast(CU.COPY.paused);
      trackResult('paused');
    } else if (code === 'RATE_LIMITED' && r.scope === 'day') {
      K.toast(CU.COPY.dayLimit);
      trackResult('limit');
      setTab(c, 'preset', 'auto');
    } else if (code === 'RATE_LIMITED') {
      K.toast(K.copy('RATE_LIMITED'));
    } else if (code === 'ROUND_NOT_FOUND') {
      restartPick(c);
      K.toast(K.copy(code, 'setClue'));
    } else if (code === 'MODERATION_BUSY' || K.isNet(code) || code === 'BAD_RESPONSE' || code === 'INTERNAL' || code === 'SERVER_CONFIG') {
      // MODERATION_BUSY, timeout, offline: nothing was sent, nobody saw the text (fail closed); 重试 or 改用提示词
      c.busyBox = true;
      trackResult('busy');
    } else {
      K.track('error', { where: 'setClue', code: code || 'unknown' });
      K.toast(K.copy(code, 'setClue'));
    }
  }

  /** The draft round expired (30 min): start again from the spectra. */
  function restartPick(c) {
    c.step = 'pickSpectrum';
    c.sharing = false;
    c.text = '';
    offerSpectra(c);
  }

  async function sendPreset(c) {
    if (c.clueItemId === null) return;
    c.sharing = true;
    const r = await api.setClue({ roundId: c.roundId, clueMode: 'preset', clueItemId: c.clueItemId });
    if (st.create !== c) return;
    if (!r.ok) {
      c.sharing = false;
      if (r.code === 'ROUND_NOT_FOUND') restartPick(c);
      K.track('error', { where: 'setClue', code: r.code || 'unknown' });
      K.toast(K.copy(r.code, 'setClue'));
      K.invalidate();
      return;
    }
    const opt = c.clueOptions.find((o) => o.itemId === c.clueItemId);
    c.presetText = r.clueText || (opt && opt.text) || null;
    K.track('round_clue', { roundId: c.roundId, clueMode: 'preset', presetSwaps: c.presetSwaps, tabSwitches: c.tabSwitches });
    await shareNow(c);
  }

  async function shareNow(c) {
    c.step = 'sharing';
    c.sharing = true;
    K.invalidate();
    // spec 7.2: the share image says what the clue mode allows (typed text is never an input here)
    await share.shareRound({ roundId: c.roundId, left: c.left, right: c.right, clueMode: c.tab === 'text' ? 'text' : 'preset', presetText: c.tab === 'text' ? null : c.presetText });
    c.sharing = false;
    if (st.create !== c) return;
    K.openRound(c.roundId, { fromCreate: true });
  }

  // ---- round screen ---------------------------------------------------------------------------------------------------------------

  const newRound = (roundId) => ({ roundId, loadState: 'loading', data: null, lateMode: false, viewAnswer: false, submitting: false, revealAt: 0, subRequesting: false, listScroll: 0, odcPosted: false, reported: false, reportSheet: null });

  K.openRound = function openRound(roundId, opts) {
    ruler.reset();
    st.play = null;
    st.round = newRound(roundId);
    const tok = K.go('round');
    return loadRound(tok, !!(opts && opts.fromCreate));
  };

  K.roundPlacing = () => !!st.round && !st.round.submitting && VM.roundStatus(st.round, K.srvNow()) === 'open';

  async function fetchRound(r, extra) {
    const arg = Object.assign({ roundId: r.roundId }, extra || {});
    if (st.group.status === 'ok') arg.groupRef = st.group.groupRef;
    return api.getRound(arg);
  }

  async function loadRound(tok, tapped) {
    const r = st.round;
    const res = await fetchRound(r);
    if (!K.live(tok) || st.round !== r) return;
    applyRound(r, res);
    const status = VM.roundStatus(r, K.srvNow());
    if (r.loadState === 'ok') {
      K.track('round_view', { roundId: r.roundId, status, isHost: !!r.data.isHost });
      offerTrack(r, status);
      if (status === 'revealed') afterReveal(r, tapped);
    }
    K.invalidate();
  }

  function applyRound(r, res) {
    if (res.ok) {
      r.data = res;
      r.loadState = 'ok';
    } else if (res.code === 'ROUND_NOT_FOUND') {
      r.loadState = 'notFound';
    } else {
      r.loadState = 'offline';
      K.track('error', { where: 'getRound', code: res.code || 'unknown' });
    }
  }

  function offerTrack(r, status) {
    const where = status === 'hostWaiting' ? 'host' : status === 'submitted' ? 'guess' : null;
    if (where && K.subscribe.stateFor(st.features, r.roundId) === 'offer') K.trackOnce('offer:' + r.roundId + ':' + where, 'subscribe_offer', { where });
  }

  /** The reveal just became visible: animate, and draw the name list in the open data domain. `tapped` = a user tap led here. */
  async function afterReveal(r, tapped) {
    r.revealAt = K.now();
    let anonymous = true;
    if (tapped) {
      const gate = await privacy.ensureForBoard('round_reveal');
      anonymous = gate.state !== 'ok';
    } else anonymous = privacy.passiveState() !== 'ok';
    if (st.round !== r || !r.data || !r.data.reveal) return;
    K.postRoundOdc(r, anonymous);
    K.invalidate();
  }

  K.postRoundOdc = function postRoundOdc(r, anonymous) {
    const rv = r.data.reveal;
    const L = K.layout();
    const lr = K.d.listRect ? K.d.listRect(L, K.display()) : null;
    const size = lr ? { w: lr.w, h: lr.h } : K.boardSize({ show: false, reservedHeight: 0 });
    // rows, hashes and positions only: no clue text of any mode reaches the open data domain (PD-37, AC 96)
    const msg = {
      type: 'render',
      view: 'round',
      salt: rv.salt,
      selfHash: rv.selfHash,
      viewerDone: !!(st.daily && st.daily.mine.complete),
      dateKey: K.todayKey(),
      rows: rv.rows,
      closestH: rv.closestH,
      target: rv.target,
      width: size.w,
      height: size.h,
      dpr: K.layout().dpr || 1,
      palette: K.display().palette,
      scale: K.display().scale,
    };
    if (st.group.shareTicket) msg.shareTicket = st.group.shareTicket;
    if (anonymous) msg.anonymous = true;
    r.odcPosted = odc.render(msg);
  };

  K.on('round:back', () => K.goHome());
  K.on('round:home', () => K.goHome());
  K.on('round:daily', () => K.goHome());
  K.on('round:scroll', () => {});
  K.on('round:list', () => {});
  K.on('round:retry', () => {
    const r = st.round;
    if (!r) return;
    r.loadState = 'loading';
    loadRound(st.nav, true);
  });

  // guess (and the late 先猜再看)
  K.on('round:primary', async () => {
    const r = st.round;
    if (!r || !K.roundPlacing() || !ruler.canConfirm()) return;
    const pos = ruler.pos;
    r.submitting = true;
    ruler.lock();
    K.invalidate();
    const arg = { roundId: r.roundId, pos };
    if (st.group.status === 'ok') arg.groupRef = st.group.groupRef;
    const res = await api.submitGuess(arg);
    r.submitting = false;
    if (st.round !== r) return;
    if (res.ok) {
      K.track('round_guess', { roundId: r.roundId, late: !!res.late, isFirstSession: store.state.firstDate === K.todayKey() });
      r.lateMode = false;
      const again = await fetchRound(r);
      if (st.round !== r) return;
      if (again.ok) applyRound(r, again);
      else if (r.data) r.data = Object.assign({}, r.data, { myGuess: { pos, late: !!res.late }, guessCount: res.guessCount });
      const status = VM.roundStatus(r, K.srvNow());
      offerTrack(r, status);
      if (status === 'revealed') afterReveal(r, true);
      guessMarker();
    } else if (res.code === 'ALREADY_GUESSED' || res.code === 'OWN_ROUND' || res.code === 'ROUND_EXPIRED') {
      K.toast(K.copy(res.code));
      r.lateMode = false;
      const again = await fetchRound(r);
      if (st.round === r) {
        applyRound(r, again);
        // QA-7: the answer was already served (ROUND_EXPIRED): the refreshed round carries the reveal
        if (res.code === 'ROUND_EXPIRED' && again.ok && again.reveal && VM.roundStatus(r, K.srvNow()) === 'revealed') afterReveal(r, true);
      }
    } else {
      K.track('error', { where: 'submitGuess', code: res.code || 'unknown' });
      K.toast(K.copy(res.code || 'NETWORK'));
      ruler.unlock(); // keep the needle: the player can confirm again
    }
    K.invalidate();
  });

  /** First round guess of a day writes the presence marker if the daily has not (spec 8.2). */
  function guessMarker() {
    const today = K.todayKey();
    if (store.state.privacy.markerDay === today) return;
    const total = st.daily && st.daily.dateKey === today && st.daily.mine.total !== null && st.daily.mine.complete ? st.daily.mine.total : 0;
    privacy.writeMarker(today, total);
  }

  K.on('round:late', () => {
    const r = st.round;
    if (!r || !r.data || r.data.status !== 'revealed' || r.data.myGuess || r.data.isHost) return;
    if (K.srvNow() > r.data.closesAt) return; // > 7 days: reveal view only
    r.lateMode = true;
    ruler.reset();
  });
  K.on('round:view', async () => {
    const r = st.round;
    if (!r || !r.data) return;
    if (r.data.answerHidden) {
      // L4: the server withholds the answer from someone who could still guess late; asking for it is recorded there
      // and closes the late guess for this player
      const res = await fetchRound(r, { showAnswer: true });
      if (st.round !== r) return;
      if (!res.ok || !res.reveal) {
        K.toast(K.copy(res.code || 'NETWORK'));
        K.invalidate();
        return;
      }
      r.data = res;
    }
    r.viewAnswer = true;
    afterReveal(r, true);
  });

  // host
  K.on('round:reveal', async () => {
    const r = st.round;
    if (!r || !r.data || !r.data.isHost || !r.data.canReveal) return;
    const res = await api.revealRound({ roundId: r.roundId });
    if (st.round !== r) return;
    if (!res.ok) K.toast(K.copy(res.code));
    const again = await fetchRound(r);
    if (st.round !== r) return;
    applyRound(r, again);
    if (res.ok && VM.roundStatus(r, K.srvNow()) === 'revealed') afterReveal(r, true);
    K.invalidate();
  });
  K.on('round:reshare', () => {
    const r = st.round;
    if (!r || !r.data) return;
    const clue = CU.roundClue(r.data, { reported: r.reported });
    share.shareRound({ roundId: r.roundId, left: r.data.left, right: r.data.right, clueMode: clue.mode, presetText: clue.mode === 'preset' ? clue.text : null });
  });
  K.on('round:shareReveal', () => {
    const r = st.round;
    if (!r || !r.data || !r.data.reveal) return;
    const rv = r.data.reveal;
    const guesses = rv.rows.filter((row) => row[1] !== null && row[3] === 0).map((row) => row[1]);
    share.shareReveal({ roundId: r.roundId, left: r.data.left, right: r.data.right, target: rv.target, guesses, mq: rv.mq, guessCount: guesses.length });
  });
  K.on('round:hostAgain', () => K.startCreate());

  // 举报 on a shown typed clue (spec 6.6, 6.12): five one-tap reasons, no text field, hides the clue at once
  K.on('round:report', () => {
    const r = st.round;
    if (!r || !r.data || r.reportSheet) return;
    if (!CU.roundClue(r.data, { reported: r.reported }).canReport) return;
    r.reportSheet = { selected: null, sending: false };
  });
  K.onPrefix('clueReport:reason:', (reason) => {
    const r = st.round;
    if (r && r.reportSheet && !r.reportSheet.sending && CU.REPORT_REASONS.indexOf(reason) >= 0) r.reportSheet.selected = reason;
  });
  K.on('clueReport:cancel', () => {
    const r = st.round;
    if (r && r.reportSheet && !r.reportSheet.sending) r.reportSheet = null;
  });
  K.on('clueReport:submit', async () => {
    const r = st.round;
    const sh = r && r.reportSheet;
    if (!sh || sh.sending || !sh.selected) return;
    sh.sending = true;
    K.invalidate();
    const reason = sh.selected;
    const res = await api.reportClue({ roundId: r.roundId, reason });
    if (st.round !== r) return;
    sh.sending = false;
    if (res.ok || res.code === 'DUP_REPORT') {
      r.reported = true; // the line turns into the hidden placeholder at once
      r.reportSheet = null;
      K.toast(res.ok ? CU.COPY.reportOk : CU.COPY.reportDup);
      K.track('clue_report', { roundId: r.roundId, reason, result: res.ok ? 'ok' : 'dup' });
    } else if (res.code === 'REPORT_LIMIT') {
      r.reportSheet = null;
      K.toast(CU.COPY.reportLimit);
      K.track('clue_report', { roundId: r.roundId, reason, result: 'limit' });
    } else {
      K.toast(CU.COPY.reportErr); // the clue stays as it was; the sheet stays for another try
      K.track('clue_report', { roundId: r.roundId, reason, result: 'error' });
      K.track('error', { where: 'reportClue', code: res.code || 'unknown' });
    }
    K.invalidate();
  });
  K.on('clueReport:block', () => {});

  // subscribe: wx.requestSubscribeMessage must be called synchronously from this tap
  K.on('round:subscribe', () => {
    const r = st.round;
    if (!r || !r.data || r.subRequesting) return;
    const status = VM.roundStatus(r, K.srvNow());
    const where = status === 'hostWaiting' ? 'host' : status === 'submitted' ? 'guess' : null;
    if (!where || K.subscribe.stateFor(st.features, r.roundId) !== 'offer') return;
    r.subRequesting = true;
    const p = K.subscribe.request(st.features, r.roundId, where);
    p.then(() => {
      r.subRequesting = false;
      K.invalidate();
    });
  });
};
