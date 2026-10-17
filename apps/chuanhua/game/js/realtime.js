/**
 * Realtime sync of a live room (spec 3A.7, PO-43, AC 147, 149; [VERIFY V17, V18]): a DOORBELL, not a data channel.
 *
 *   - `watch()` on the player's own content-free signal document (`chuanhua_room_signals`, custom read rule `doc._openid == auth.openid`). A new `seq`
 *     only means "call getRoom"; content never comes through the signal.
 *   - the guaranteed fallback is POLLING getRoom every `pollSec` (2 s) after two `onError`s, when `watch` does not exist (PC WeChat), or when
 *     `rt.watch` is false in the remote config. With `watch` running there is also a safety poll every `safetyPollSec` (10 s).
 *   - `roomTick` is called at `deadline + graceSec + 1 s` (server time) and then every 2 s until the round changes, so a round advances on every client
 *     even with no signal at all (the server side is idempotent: exactly one advance).
 *   - timers use the server offset (`serverNow - deviceNow`) measured on EVERY response, never the device clock alone (AC 149).
 *
 * Pure logic with injected collaborators, so the client tests drive it with a fake clock and `srv.realtime` of the mock server (game/js/mock-server.js):
 *
 *   const rt = createRealtime({
 *     call: (name, data) => Promise<response>,        // api.call: 'getRoom' | 'roomTick'
 *     watch: (openid, roomId, {onChange, onError}) => {close()} | undefined,   // wxWatch(db) or srv.realtime.watch bound to a player; undefined = unsupported
 *     openid: '{openid}',                              // the platform placeholder in the real client; the mock needs the real id
 *     now: () => Date.now(), timers: {setTimeout, clearTimeout},
 *     config: {watch: true, pollSec: 2, safetyPollSec: 10}, graceSec: 5,
 *     onRoom: (resp) => {}, onMode: ({mode, reason, latencyMs}) => {}, onStatus: ({online}) => {}, onGone: (code) => {},
 *   });
 *   rt.start(roomId);  rt.refresh();  rt.stop();  rt.mode  // 'watch' | 'poll' | 'idle'
 */

const FATAL = ['ROOM_NOT_FOUND', 'NOT_IN_ROOM', 'ROOM_CLOSED'];
const MAX_WATCH_ERRORS = 2;
const TICK_RETRY_MS = 2000;

/** the real client's watch function over `wx.cloud.database()` (the signal collection is `chuanhua_room_signals`) */
function wxWatch(db, collectionName) {
  return function watch(openid, roomId, h) {
    const col = db.collection(collectionName || 'chuanhua_room_signals');
    if (!col || typeof col.where !== 'function') return undefined;
    const q = col.where({ _openid: openid, roomId }); // '{openid}' is replaced by the platform; the query is a subset of the read rule
    if (typeof q.watch !== 'function') return undefined;
    return q.watch({ onChange: h.onChange, onError: h.onError });
  };
}

function createRealtime(opts) {
  const o = opts || {};
  const timers = o.timers || { setTimeout, clearTimeout };
  const nowDev = o.now || (() => Date.now());
  const cfg = Object.assign({ watch: true, pollSec: 2, safetyPollSec: 10 }, o.config || {});
  const graceSec = o.graceSec === undefined ? 5 : o.graceSec;

  let roomId = null;
  let running = false;
  let mode = 'idle';
  let offset = 0; // serverNow - device now
  let lastVersion = -1;
  let lastSeq = -1;
  let lastResp = null;
  let watcher = null;
  let watchErrors = 0;
  let pollTimer = null;
  let tickTimer = null;
  let inflight = false;
  let again = false;
  let online = true;
  let tickRound = null; // the round a tick series is for
  let fellBack = false;

  const serverNow = () => nowDev() + offset;
  const setMode = (m, reason, latencyMs) => {
    if (mode === m && reason === undefined && latencyMs === undefined) return;
    mode = m;
    if (o.onMode) o.onMode({ mode: m, reason, latencyMs });
  };

  function clearPoll() {
    if (pollTimer !== null) timers.clearTimeout(pollTimer);
    pollTimer = null;
  }
  function clearTick() {
    if (tickTimer !== null) timers.clearTimeout(tickTimer);
    tickTimer = null;
  }

  function schedulePoll() {
    clearPoll();
    if (!running) return;
    const sec = mode === 'poll' ? cfg.pollSec : cfg.safetyPollSec;
    pollTimer = timers.setTimeout(() => {
      pollTimer = null;
      refresh();
    }, sec * 1000);
  }

  function handle(resp, viaTick) {
    if (resp && typeof resp.serverNow === 'number') offset = resp.serverNow - nowDev();
    if (!resp || resp.ok === false) {
      const code = resp && resp.code;
      if (code && FATAL.indexOf(code) >= 0) {
        if (o.onGone) o.onGone(code);
        stopInner();
        return;
      }
      // a network / rate-limit / server hiccup: keep going, tell the screen once
      if (online) {
        online = false;
        if (o.onStatus) o.onStatus({ online: false, code });
      }
      return;
    }
    if (!online) {
      online = true;
      if (o.onStatus) o.onStatus({ online: true });
    }
    if (typeof resp.version === 'number' && resp.version < lastVersion) return; // an older answer that arrived late: ignore
    if (typeof resp.version === 'number') lastVersion = resp.version;
    lastResp = resp;
    if (o.onRoom) o.onRoom(resp, { viaTick: !!viaTick });
    planTick(resp);
  }

  /** getRoom now; calls coalesce (one in flight, one queued) */
  function refresh() {
    if (!running) return Promise.resolve(null);
    if (inflight) {
      again = true;
      return Promise.resolve(null);
    }
    inflight = true;
    return Promise.resolve(o.call('getRoom', { roomId, groupRef: o.groupRef }))
      .then((resp) => {
        inflight = false;
        if (running) handle(resp, false);
        return resp;
      })
      .catch(() => {
        inflight = false;
        if (running && online) {
          online = false;
          if (o.onStatus) o.onStatus({ online: false });
        }
        return null;
      })
      .then((resp) => {
        if (again) {
          again = false;
          refresh();
        } else schedulePoll();
        return resp;
      });
  }

  // ---- roomTick at deadline + grace + 1 s, then every 2 s until the round changes -------------------------------------------------------------
  function planTick(resp) {
    clearTick();
    if (!running || !resp || resp.state !== 'playing' || typeof resp.deadline !== 'number') {
      tickRound = null;
      return;
    }
    const due = resp.deadline + (resp.graceSec === undefined ? graceSec : resp.graceSec) * 1000 + 1000;
    const delay = Math.max(0, due - serverNow());
    tickRound = resp.round;
    tickTimer = timers.setTimeout(() => {
      tickTimer = null;
      tick(resp.round);
    }, delay);
  }
  function tick(round) {
    if (!running) return;
    Promise.resolve(o.call('roomTick', { roomId }))
      .then((resp) => {
        if (!running) return;
        handle(resp, true);
        // still the same round (a check in flight, or the call failed): try again in 2 s
        if (running && (!resp || resp.ok === false || (resp.state === 'playing' && resp.round === round))) {
          clearTick();
          tickTimer = timers.setTimeout(() => {
            tickTimer = null;
            tick(round);
          }, TICK_RETRY_MS);
        }
      })
      .catch(() => {
        if (!running) return;
        clearTick();
        tickTimer = timers.setTimeout(() => {
          tickTimer = null;
          tick(round);
        }, TICK_RETRY_MS);
      });
  }

  // ---- watch ----------------------------------------------------------------------------------------------------------------------------------
  function startWatch() {
    if (!cfg.watch || typeof o.watch !== 'function') {
      setMode('poll', 'unsupported');
      return;
    }
    let w;
    fellBack = false;
    try {
      w = o.watch(o.openid, roomId, {
        onChange(snapshot) {
          const docs = (snapshot && (snapshot.docs || (snapshot.doc ? [snapshot.doc] : []))) || [];
          let seq = -1;
          let sig = null;
          for (const d of docs) {
            if (d && typeof d.seq === 'number' && d.seq > seq) {
              seq = d.seq;
              sig = d;
            }
          }
          if (seq > lastSeq) {
            lastSeq = seq;
            watchErrors = 0;
            const latency = sig && typeof sig.serverNow === 'number' ? Math.max(0, serverNow() - sig.serverNow) : undefined;
            if (o.onSignal) o.onSignal(sig, latency);
            if (mode !== 'watch') setMode('watch', undefined, latency);
            if (!(inflight && lastVersion < 0)) refresh(); // the init snapshot while the first getRoom is out needs no second one
          }
        },
        onError() {
          watchErrors++;
          if (watchErrors >= MAX_WATCH_ERRORS) {
            closeWatcher();
            fellBack = true;
            setMode('poll', 'error');
            refresh(); // starts the 2 s polling
          }
        },
      });
    } catch (e) {
      w = undefined;
    }
    if (fellBack) {
      // two onErrors arrived while watch() was still returning: polling already took over
      if (w && typeof w.close === 'function') w.close();
      return;
    }
    if (!w) {
      setMode('poll', 'unsupported');
      return;
    }
    watcher = w;
    setMode('watch');
  }
  function closeWatcher() {
    if (watcher && typeof watcher.close === 'function') {
      try {
        watcher.close();
      } catch (e) {
        /* ignore */
      }
    }
    watcher = null;
  }

  function stopInner() {
    running = false;
    clearPoll();
    clearTick();
    closeWatcher();
    inflight = false;
    again = false;
    mode = 'idle';
  }

  return {
    /** open the room: one getRoom now, then watch (or poll) and the tick plan */
    start(id) {
      stopInner();
      roomId = id;
      running = true;
      lastVersion = -1;
      lastSeq = -1;
      watchErrors = 0;
      online = true;
      const first = refresh(); // the first getRoom is out before the watch snapshot can arrive
      startWatch();
      return first;
    },
    stop() {
      stopInner();
    },
    refresh,
    /** the remote config changed (rt.watch false, pollSec): applies to the next start / poll */
    setConfig(c) {
      Object.assign(cfg, c || {});
    },
    /** use a response obtained elsewhere (a submit or tick answer) */
    accept(resp) {
      if (running) handle(resp, false);
    },
    get mode() { return mode; },
    get offset() { return offset; },
    get last() { return lastResp; },
    get running() { return running; },
    /** remaining ms of the current round by the SERVER clock (AC 149) */
    msLeft() {
      return lastResp && typeof lastResp.deadline === 'number' ? Math.max(0, lastResp.deadline - serverNow()) : null;
    },
    serverNow,
  };
}

module.exports = { createRealtime, wxWatch, MAX_WATCH_ERRORS, TICK_RETRY_MS };
