/**
 * Typed-clue client helpers (spec 6.5, 6.6, 6.12, 10; D-2). Pure JS, no wx, no drawing: the copy of every state, the
 * typed-input filter, the reason mapping and the adapters that read the server's round / ugc blocks.
 *
 * Why an adapter: the server answers with the flat shape of spec 11.2 (`clueMode`, `clueState`, `clueText`, `canReport`;
 * `createRound.ugc`) and the CTO's contract brief with the nested shape (`clue {mode, text, hidden}`, `me {canReport,
 * rulesAgreed, restriction, strikeNotice}`). The client reads BOTH, in this one place (TD-85).
 *
 * Typed clue text is held in exactly two places (spec 10): the author's own draft (create flow, memory only) and the round
 * view's clue line for a passed, unhidden clue. Nothing in this module logs, stores or sends it.
 */

const RULES_VERSION = 1;
const CLUE_MAX = 12;
const DEBOUNCE_MS = 150;

const COPY = {
  rulesTitle: '发言规则',
  busy: '提示暂时没法检查，还没有发出去',
  blocked: '这个提示没通过审核，换个说法吧',
  paused: '自己写提示暂时关闭，先选一个提示词吧',
  dayLimit: '今天检查提示的次数用完了，先选一个提示词吧',
  noKeyboard: '这台设备暂时没法输入，先选一个提示词吧',
  sent: '提示已通过 · 发到群里',
  checking: '检查中…',
  reportOk: '已举报，提示已隐藏，我们会尽快核实',
  reportDup: '你已经举报过了',
  reportLimit: '今天举报次数已用完',
  reportErr: '举报没发出去，请稍后再试',
  hiddenGuest: '提示已被举报隐藏',
  hiddenHost: '你的提示被举报隐藏了，群友仍可继续猜',
  pausedLine: '提示暂不显示',
  chatLine: '提示在群聊里，看看 TA 怎么说',
  guessAnyway: '凭感觉猜一猜，或回群里问问出题人',
  shareLine: '提示在题目里，点开看看',
  warn: '你写的提示没有通过审核。请遵守发言规则，多次违规将暂时不能自己写提示。',
  restrictionWhy: '原因：多次写的提示未通过审核。如有疑问，请在「设置 · 联系我们」反馈。',
  restrictionPick: '可以先选一个提示词。',
};

const REPORT_REASONS = ['porn', 'politics', 'abuse', 'ads', 'other'];

// ---- reasons --------------------------------------------------------------------------------------------------------

/** Spec names (digits, chars) for the contract's (digit, charset): one vocabulary in the vm and the events. */
function reasonName(reason) {
  if (reason === 'digit') return 'digits';
  if (reason === 'charset') return 'chars';
  return reason;
}

const FIXED_HINT = {
  length: '最多 12 个字',
  digits: '提示里不能有数字哦',
  position: '别直接说位置，换个说法吧',
  chars: '只能用中文写提示',
  blocked: '换个说法吧',
};

/** Inline hint for a rejection reason (server TEXT_REJECTED, or a reason without a hint from the local check). */
function hintFor(reason, left, right) {
  const r = reasonName(reason);
  if (r === 'endLabel') return '别用刻度两头的词（' + left + '、' + right + '）';
  return FIXED_HINT[r] || null;
}

/** Reasons that go into the `clue_result` event (spec 12); anything else is dropped. */
const EVENT_REASONS = ['length', 'digits', 'position', 'endLabel', 'chars', 'blocked'];

// ---- the typed input ----------------------------------------------------------------------------------------------------

const KEEP = /^(?:[\p{L}\p{N}\p{P}]|[~～%％‰])$/u;
const SPACE = /\s/u;

/**
 * What stays in the box as the host types (spec 6.5): whitespace goes (the 12 limit counts without it), and emoji, symbols and
 * formatting characters are removed because no rule hint could explain them. Letters, digits and punctuation stay so the hint can
 * say why they fail. At most CLUE_MAX code points. Returns {text, changed}.
 */
function inputFilter(raw) {
  const src = typeof raw === 'string' ? raw : '';
  const out = [];
  for (const ch of src) {
    if (SPACE.test(ch)) continue;
    if (!KEEP.test(ch)) continue;
    if (out.length >= CLUE_MAX) break;
    out.push(ch);
  }
  const text = out.join('');
  return { text, changed: text !== src };
}

const codePoints = (s) => Array.from(s || '').length;

// ---- restriction ---------------------------------------------------------------------------------------------------

/** "10月17日 14:00" in Beijing time from epoch-ms. */
function untilText(ms) {
  const d = new Date(Number(ms) + 8 * 3600e3);
  const p2 = (n) => (n < 10 ? '0' + n : String(n));
  return d.getUTCMonth() + 1 + '月' + d.getUTCDate() + '日 ' + p2(d.getUTCHours()) + ':' + p2(d.getUTCMinutes());
}

/** Copy for tab 1 while the host is restricted (spec 11.8). restriction = {until, permanent} */
function restrictionText(restriction) {
  const r = restriction || {};
  const until = Number(r.until);
  const head = !r.permanent && Number.isFinite(until) && until > 0 ? '你暂时不能自己写提示（至 ' + untilText(until) + '）。' : '你暂时不能自己写提示。';
  return head + COPY.restrictionWhy + COPY.restrictionPick;
}

// ---- server blocks ------------------------------------------------------------------------------------------------

function restrictionOf(x) {
  if (!x || typeof x !== 'object') return null;
  const until = Number(x.until);
  if (!x.permanent && !(Number.isFinite(until) && until > 0)) return null;
  return { until: Number.isFinite(until) ? until : 0, permanent: !!x.permanent };
}

/**
 * The host's UGC state from a createRound answer (`ugc`, spec 11.2) or a getRound `me` block (contract brief). Missing pieces fall back to
 * the cached agreement. Returns {createEnabled, rulesAgreed, restriction, warnPending}.
 */
function ugcOf(res, cachedAgreed) {
  const u = res && res.ugc && typeof res.ugc === 'object' ? res.ugc : null;
  const me = res && res.me && typeof res.me === 'object' ? res.me : null;
  const src = u || me || {};
  let agreed = !!cachedAgreed;
  if (typeof src.rulesAgreed === 'boolean') agreed = src.rulesAgreed;
  else if (u && 'rulesVersion' in u) agreed = Number.isFinite(u.rulesVersion) && u.rulesVersion >= (Number.isFinite(u.rulesRequiredVersion) ? u.rulesRequiredVersion : RULES_VERSION);
  return {
    createEnabled: src.createEnabled !== false,
    rulesAgreed: agreed,
    restriction: restrictionOf(src.restriction),
    warnPending: !!(src.warnPending || src.strikeNotice),
  };
}

/**
 * A round's clue as the screens read it: {mode, state, text, canReport}. Accepts both shapes (see the header). A typed clue with no
 * text is shown as hidden, never as an empty or "null" line. `reported` = this viewer just reported it (local override).
 */
function roundClue(d, o) {
  const opts = o || {};
  if (!d) return { mode: 'preset', state: 'shown', text: null, canReport: false };
  const c = d.clue && typeof d.clue === 'object' ? d.clue : null;
  let mode = c ? c.mode : d.clueMode;
  if (mode !== 'text' && mode !== 'chat') mode = 'preset';
  const raw = c ? c.text : d.clueText;
  let text = typeof raw === 'string' && raw.length ? raw : null;
  let state = d.clueState || (c && c.state) || (c && c.hidden ? 'hidden' : 'shown');
  if (state !== 'hidden' && state !== 'paused') state = 'shown';
  if (opts.reported && mode === 'text') state = 'hidden';
  if (mode === 'text' && state === 'shown' && text === null) state = 'hidden';
  if (state !== 'shown' || mode === 'chat') text = null;
  const me = d.me && typeof d.me === 'object' ? d.me : null;
  const flag = me && typeof me.canReport === 'boolean' ? me.canReport : !!d.canReport;
  const canReport = !!(flag && mode === 'text' && state === 'shown' && !d.isHost && !opts.reported);
  return { mode, state, text, canReport };
}

/** The clue line of a round (spec 6.6): strings are finished here, renderers draw them. */
function clueLine(clue, isHost) {
  if (clue.state === 'hidden') return isHost ? COPY.hiddenHost : COPY.hiddenGuest;
  if (clue.state === 'paused') return COPY.pausedLine;
  if (clue.mode === 'chat') return COPY.chatLine;
  if (clue.mode === 'text') return '提示：「' + clue.text + '」';
  return clue.text ? '提示：' + clue.text : '';
}

/** The line under a hidden or paused clue while guessing is still possible (guessers only). */
function clueSubLine(clue, isHost, canGuess) {
  return (clue.state === 'hidden' || clue.state === 'paused') && !isHost && canGuess ? COPY.guessAnyway : null;
}

/** What the round share image says about the clue (spec 7.2, PD-37): typed text is never an input. */
function shareClueLine(mode, presetText) {
  if (mode === 'text') return COPY.shareLine;
  if (mode === 'preset' && presetText) return '提示：' + presetText;
  return null; // legacy chat: core/entry.js falls back to 提示在群聊里
}

// ---- analytics guard ---------------------------------------------------------------------------------------------------

const oneOf = (list) => (v) => typeof v === 'string' && list.indexOf(v) >= 0;
const ROUND_ID = /^[A-Z2-7]{8}$/;
/**
 * Props the clue events may carry (spec 12, AC 95): enums, a round id and counts only. A typed clue, a fragment of it, a hint text or a
 * trace id can never pass: any other key, and any value outside its type, is dropped before the event is queued. `chars` is an integer.
 */
const CLUE_EVENT_PROPS = {
  clue_tab: { tab: oneOf(['text', 'preset']), via: oneOf(['tap', 'link', 'auto']) },
  clue_result: { result: oneOf(['pass', 'rejected', 'blocked', 'busy', 'rulesRequired', 'restricted', 'paused', 'limit']), reason: oneOf(EVENT_REASONS) },
  rules_view: { source: oneOf(['input', 'settings']) },
  rules_agree: { source: oneOf(['input', 'settings']) },
  clue_report: { roundId: (v) => typeof v === 'string' && ROUND_ID.test(v), reason: oneOf(REPORT_REASONS), result: oneOf(['ok', 'dup', 'limit', 'error']) },
  round_clue: {
    roundId: (v) => typeof v === 'string' && ROUND_ID.test(v),
    clueMode: oneOf(['text', 'preset']),
    presetSwaps: (v) => Number.isInteger(v) && v >= 0 && v <= 20,
    chars: (v) => Number.isInteger(v) && v >= 1 && v <= CLUE_MAX,
    tabSwitches: (v) => Number.isInteger(v) && v >= 0 && v <= 200,
  },
};

/** The allowlisted props of a clue event, or null when `name` is not a clue event (nothing to guard). */
function guardEventProps(name, props) {
  const spec = CLUE_EVENT_PROPS[name];
  if (!spec) return null;
  const out = {};
  const src = props || {};
  Object.keys(spec).forEach((k) => {
    if (Object.prototype.hasOwnProperty.call(src, k) && spec[k](src[k])) out[k] = src[k];
  });
  return out;
}

module.exports = {
  guardEventProps,
  CLUE_EVENT_PROPS,
  RULES_VERSION,
  CLUE_MAX,
  DEBOUNCE_MS,
  COPY,
  REPORT_REASONS,
  EVENT_REASONS,
  reasonName,
  hintFor,
  inputFilter,
  codePoints,
  untilText,
  restrictionText,
  restrictionOf,
  ugcOf,
  roundClue,
  clueLine,
  clueSubLine,
  shareClueLine,
};
