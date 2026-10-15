/**
 * Cloud function wrapper (spec 14.2). Every call returns a Promise that RESOLVES to the
 * function's result ({ok:true,...}) or to {ok:false, code, msg}; it never rejects, so
 * callers branch on `ok`. Identity is never sent: the server reads OPENID from the context.
 *
 * The client never holds the answer or the rank lists: it sends a word string, a client
 * guess id and an input-source tag; the server returns ranks.
 *
 *   getDaily()                       -> {dateKey, issueNo, puzzleId, serverNow, warmups[6],
 *                                        my:{status:none|playing|solved|gaveup, steps, best, hints},
 *                                        myStreak:{current,best}, features:{ads?}}
 *   startPuzzle({puzzleId}|{next:true, pool?:'practice'})
 *                                    -> {puzzleId, kind:daily|archive|practice, ranked, issueNo, practiceNo,
 *                                        dateKey, warmups, vocabVersion, configVersion,
 *                                        play:{guesses:[{word,r,t,src,syn?,ch?}], steps, hintsUsed:[k],
 *                                              adHints, best, status:playing|solved|gaveup, firstChar?},
 *                                        answer? (only when finished)}
 *                                       (the 提示 3 step is a guess with word:null, r:null, ch:'番')
 *   guess({puzzleId, word, clientGuessId, src:warmup|chip|suggest|typed})
 *                                    -> {word, r, t, band, steps, best, dup, solved, solvedBy?, answer?,
 *                                        near:[<=5], ranked}
 *   near({puzzleId, word})           -> {near:[<=5]}   (answer-independent)
 *   useHint({puzzleId, k?, source:ladder|ad})
 *                                    -> {kind:word|firstChar, word?, r?, t?, ch?, steps, best, near?}
 *   giveUp({puzzleId})               -> {answer, steps, best}
 *   getReveal({puzzleId})            -> {answer, top:[[word,rank,isSyn]x100], stats?:{finishers,medianSteps,pctBetter}}
 *   getHistory({cursor?})            -> {items:[{puzzleId,issueNo,dateKey,my?:{status,steps},answer?}],
 *                                        nextCursor, bestStreak, practice:{done,total}}
 *   createChallenge({puzzleId})      -> {challengeId}
 *   getChallenge({challengeId})      -> {puzzleId, kind, issueNo?, practiceNo?, owner:{status,steps,hints,temps},
 *                                        own:{finishers,bestSteps}|null, countsAsToday, alreadyFinished, ownerWords?}
 *   joinGroup({groupData})           -> {groupRef}
 *   getBoard({kind, dateKey, groupRef?}) -> {dateKey, issueNo, salt, selfHash, mode, rows:[[h,st,n,hi,b,s,k?]]}
 *   track({events:[{name, props, clientTs, sessionId}]}) -> {}
 *
 * Error codes: see spec 14.2. Client-side only: TIMEOUT, NETWORK, BAD_RESPONSE.
 *
 * Modes: 'cloud' (wx.cloud.callFunction) or 'mock' (js/dev/mock-server.js, in memory, same
 * contracts; js/dev is dev-only and excluded from release packages). The mock is the default
 * until the founder supplies the AppID and cloud env id (H1, H6).
 */

const NAMES = ['getDaily', 'startPuzzle', 'guess', 'near', 'useHint', 'giveUp', 'getReveal', 'getHistory', 'createChallenge', 'getChallenge', 'joinGroup', 'getBoard', 'track'];
const TIMEOUT_MS = { guess: 5000, startPuzzle: 5000, useHint: 5000, giveUp: 5000, getReveal: 5000, near: 3000, getDaily: 10000, getBoard: 8000, track: 6000 };

function loadMockModule() {
  try {
    return require('./dev/mock-server');
  } catch (e) {
    return null; // release package: js/dev is excluded
  }
}

function createApi(opts) {
  opts = opts || {};
  const wx = opts.wx;
  const mode = opts.mode || 'mock';
  const now = opts.now || (() => Date.now());
  const setTimer = opts.setTimeout || setTimeout;
  const clearTimer = opts.clearTimeout || clearTimeout;
  let mock = null;
  if (mode === 'mock') {
    if (opts.mockServer) mock = opts.mockServer;
    else {
      const m = loadMockModule();
      mock = m ? m.createMockServer({ now }) : null;
    }
  }
  const api = { mode, mock };

  if (mode === 'cloud' && wx && wx.cloud && wx.cloud.init) {
    wx.cloud.init({ env: opts.env, traceUser: false });
  }

  function call(name, data) {
    if (mode === 'mock') return Promise.resolve(mock ? mock.call(name, data) : { ok: false, code: 'NETWORK', msg: 'no mock in this build' });
    return new Promise((resolve) => {
      let settled = false;
      let timer = null;
      const done = (r) => {
        if (settled) return;
        settled = true;
        clearTimer(timer);
        resolve(r);
      };
      timer = setTimer(() => done({ ok: false, code: 'TIMEOUT', msg: 'timeout' }), TIMEOUT_MS[name] || 8000);
      try {
        wx.cloud.callFunction({
          name,
          data,
          success: (res) => done(res && res.result && typeof res.result === 'object' ? res.result : { ok: false, code: 'BAD_RESPONSE' }),
          fail: (e) => done({ ok: false, code: 'NETWORK', msg: (e && e.errMsg) || 'network' }),
        });
      } catch (e) {
        done({ ok: false, code: 'NETWORK', msg: String(e && e.message) });
      }
    });
  }

  NAMES.forEach((n) => {
    api[n] = (data) => call(n, data || {});
  });
  api.NAMES = NAMES;
  return api;
}

module.exports = { createApi, NAMES };
