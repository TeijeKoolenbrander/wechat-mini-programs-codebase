'use strict';
/**
 * A scriptable stand-in for the backend's typed-clue functions (D-2), layered over the in-memory mock server so the client flows can be
 * driven through every outcome (pass, local and server rejection, risky, busy, timeout, rules required, restriction, pause, report).
 * It follows the contract the client codes against (spec 11.2, 11.6-11.8 and the CTO brief): createRound answers an `ugc` block;
 * setClue text runs core/clue.js, the mock moderation words (测试违规 -> risky, 测试复审 -> review, 测试繁忙 -> busy) and stores the
 * clue on the round document; getRound adds clueState / canReport (flat shape) or `clue` / `me` (nested shape); agreeRules and
 * reportClue behave as specified. It is a TEST double: the real mock-server and cloud functions are the backend agent's.
 *
 *   const fake = installClueServer(h, { shape: 'flat' | 'nested' });
 *   fake.state      { rulesVersion, strikes, restriction, createEnabled, viewEnabled, busy, timeout, warnPending, wechatCalls, setClueCalls, reports }
 *   fake.callAs(openid, name, data)   another player's call through the same logic
 */

const core = require('../core/clue');

function installClueServer(h, o) {
  o = o || {};
  const api = h.app.api;
  const srv = h.srv;
  const shape = o.shape || 'flat';
  const state = {
    rulesVersion: o.rulesVersion === undefined ? null : o.rulesVersion,
    strikes: 0,
    restriction: o.restriction || null,
    createEnabled: o.createEnabled !== false,
    viewEnabled: o.viewEnabled !== false,
    busy: false,
    timeout: false,
    warnPending: false,
    wechatCalls: 0,
    setClueCalls: 0,
    reports: {}, // roundId -> [openid]
    reportsToday: {},
    log: [],
  };
  const orig = {};
  ['createRound', 'setClue', 'getRound'].forEach((n) => (orig[n] = api[n].bind(api)));
  const err = (code, extra) => Object.assign({ ok: false, code, message: code }, extra || {});

  function createRound(openid, data) {
    const r = srv.callAs(openid, 'createRound', data);
    if (!r.ok) return r;
    r.ugc = {
      createEnabled: state.createEnabled,
      rulesVersion: state.rulesVersion,
      rulesRequiredVersion: 1,
      restriction: state.restriction,
      warnPending: state.warnPending,
    };
    state.warnPending = false;
    return r;
  }

  function setClue(openid, data) {
    if (data.clueMode !== 'text') return srv.callAs(openid, 'setClue', data);
    state.setClueCalls++;
    const round = srv.db.rounds[data.roundId];
    if (!round) return err('ROUND_NOT_FOUND');
    if (round.hostOpenid !== openid) return err('NOT_HOST');
    if (!state.createEnabled) return err('UGC_PAUSED');
    if (state.rulesVersion !== 1) return err('RULES_REQUIRED');
    if (state.restriction) return err('RESTRICTED', { until: state.restriction.until, permanent: !!state.restriction.permanent });
    const chk = core.checkClue(data.clueText, { leftLabel: round.left, rightLabel: round.right });
    if (!chk.ok) return err('TEXT_REJECTED', { reason: chk.reason });
    if (round.clueMode === 'text' && round.clueText === chk.text) return { ok: true, clueMode: 'text', clueText: chk.text };
    state.wechatCalls++;
    if (state.timeout) return err('TIMEOUT');
    if (state.busy || chk.text.includes('测试繁忙')) return err('MODERATION_BUSY');
    if (chk.text.includes('测试违规')) {
      state.strikes++;
      if (state.strikes === 1) state.warnPending = true;
      return err('TEXT_BLOCKED');
    }
    if (chk.text.includes('测试复审')) return err('TEXT_BLOCKED');
    srv.db.rounds[data.roundId] = Object.assign({}, round, { status: 'open', clueMode: 'text', clueItemId: null, clueText: chk.text, clueHidden: false });
    return { ok: true, clueMode: 'text', clueText: chk.text };
  }

  function getRound(openid, data) {
    const out = srv.callAs(openid, 'getRound', data);
    if (!out.ok) return out;
    const round = srv.db.rounds[data.roundId];
    const isHost = round.hostOpenid === openid;
    const mode = round.clueMode === 'text' ? 'text' : round.clueMode === 'chat' ? 'chat' : 'preset';
    let clueState = 'shown';
    let text = mode === 'text' ? round.clueText : mode === 'preset' ? round.clueText : null;
    if (mode === 'text' && (round.clueHidden || round.status === 'draft')) clueState = round.clueHidden ? 'hidden' : 'shown';
    if (mode === 'text' && !state.viewEnabled) clueState = 'paused';
    if (clueState !== 'shown') text = null;
    const reported = (state.reports[round._id] || []).includes(openid);
    const canReport = mode === 'text' && clueState === 'shown' && !isHost && !reported;
    if (shape === 'nested') {
      delete out.clueMode;
      delete out.clueText;
      out.clue = { mode, text, hidden: clueState === 'hidden' };
      if (clueState === 'paused') out.clue.state = 'paused';
      out.me = { canReport, rulesAgreed: state.rulesVersion === 1, restriction: state.restriction, strikeNotice: false };
    } else {
      out.clueMode = mode;
      out.clueText = text;
      out.clueState = clueState;
      out.canReport = canReport;
    }
    return out;
  }

  function agreeRules(openid, data) {
    if (!data || (data.rulesVersion !== 1 && data.version !== 1)) return err('INVALID_INPUT');
    state.rulesVersion = 1;
    return { ok: true, rulesVersion: 1 };
  }

  function reportClue(openid, data) {
    if (!['porn', 'politics', 'abuse', 'ads', 'other'].includes(data && data.reason)) return err('INVALID_INPUT');
    const round = srv.db.rounds[data.roundId];
    if (!round) return err('ROUND_NOT_FOUND');
    if (round.clueMode !== 'text') return err('INVALID_INPUT'); // a preset, a legacy chat round or no clue: nothing to report
    if (round.hostOpenid === openid) return err('OWN_ROUND');
    const list = (state.reports[round._id] = state.reports[round._id] || []);
    if (list.includes(openid)) return err('DUP_REPORT');
    state.reportsToday[openid] = (state.reportsToday[openid] || 0) + 1;
    if (state.reportsToday[openid] > 10) return err('REPORT_LIMIT');
    list.push(openid);
    round.clueHidden = true;
    return { ok: true, hidden: true };
  }

  const dispatch = { createRound, setClue, getRound, agreeRules, reportClue };
  const callAs = (openid, name, data) => (dispatch[name] ? dispatch[name](openid, data || {}) : srv.callAs(openid, name, data));
  api.createRound = (d) => Promise.resolve(createRound(srv.ME, d || {}));
  api.setClue = (d) => Promise.resolve(setClue(srv.ME, d || {}));
  api.getRound = (d) => Promise.resolve(getRound(srv.ME, d || {}));
  api.agreeRules = (d) => Promise.resolve(agreeRules(srv.ME, d || {}));
  api.reportClue = (d) => Promise.resolve(reportClue(srv.ME, d || {}));
  void orig;
  return { state, callAs, srv };
}

module.exports = { installClueServer, core };
