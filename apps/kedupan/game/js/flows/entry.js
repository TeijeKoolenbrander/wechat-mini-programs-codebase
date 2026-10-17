/**
 * Card entry routing and group context (spec 7.5, 8.1, AC 41, 54). Pure routing is core/entry.parseEntryQuery; this
 * file applies it on a cold start and on a warm start (onShow).
 *
 *   s=d (+ticket)  Home; with a ticket, joinGroup -> the group banner on Home
 *   s=g (+ticket)  the group page (with a ticket) or the explainer
 *   r=<id> (+ticket) the round entry (guess / host / reveal); joinGroup runs in the background with a ticket
 *   wxad_fallback_share=1 / malformed  Home; logged; grants nothing
 * `card_open` fires once per entry. A warm start while the player is on a card screen waits until they are back home
 * (toast "你有一道新刻度题", the 点将台 pattern). The group context lives in memory for this entry only.
 */

const E = require('../../core/entry');

module.exports = function install(K) {
  const { st, share, analytics } = K;
  let lastKey = null;
  let toasted = false;

  function parse(options) {
    const o = options || {};
    let q = o.query;
    if (typeof q === 'string') {
      const out = {};
      try {
        q.split('&').forEach((kv) => {
          const i = kv.indexOf('=');
          if (i > 0) out[decodeURIComponent(kv.slice(0, i))] = decodeURIComponent(kv.slice(i + 1));
        });
        q = out;
      } catch (e) {
        // I3: a hostile or truncated query ("%E0%A4%A", "%") makes decodeURIComponent throw URIError: treat the whole entry as malformed
        q = { _malformed: '1' };
      }
    }
    return { e: E.parseEntryQuery(q), ticket: o.shareTicket || null, scene: typeof o.scene === 'number' ? o.scene : 0, chatType: o.chatType, key: JSON.stringify([q || {}, o.shareTicket || null]) };
  }

  const fromCardOf = (k) => (k === 'daily' || k === 'round' || k === 'group' ? k : 'none');
  const props = (p) => ({ scene: p.scene, fromCard: fromCardOf(p.e.kind), hasShareTicket: !!p.ticket });

  function joinGroupFor(p) {
    st.group = { status: 'checking', groupRef: null, shareTicket: p.ticket };
    K.groupJoin = share.enterGroup({ scene: p.scene, chatType: p.chatType, shareTicket: p.ticket }).then((res) => {
      st.group.status = res.status;
      st.group.groupRef = res.groupRef || null;
      K.invalidate();
      if (res.status === 'ok') K.loadDaily(); // the daily reveals now carry the group block
      return res;
    });
    return K.groupJoin;
  }

  function route(p) {
    const k = p.e.kind;
    if (k === 'none') return;
    if (k === 'fallback') {
      K.track('error', { where: 'entry', code: 'fallback_share' }); // logged, grants nothing (AC 58)
      return;
    }
    if (k === 'malformed') {
      K.track('error', { where: 'entry', code: 'malformed' });
      return;
    }
    const cardKind = k === 'round' ? (p.scene === 1014 ? 'notice' : 'round') : k === 'group' ? 'group' : 'daily';
    const cp = { cardKind, hasShareTicket: !!p.ticket };
    if (k === 'round') cp.roundId = p.e.roundId;
    K.track('card_open', cp);
    if (p.ticket) joinGroupFor(p);
    if (k === 'round') K.openRound(p.e.roundId, {});
    else if (k === 'group') K.openGroupPage();
  }

  K.startEntry = function startEntry(options) {
    const p = parse(options);
    lastKey = p.key;
    analytics.startSession(props(p));
    route(p);
  };

  K.onShowEntry = function onShowEntry(options) {
    const p = parse(options);
    analytics.onShow(props(p));
    if (p.e.kind === 'none' || p.key === lastKey) return; // an ordinary resume, or the same card again
    lastKey = p.key;
    if (st.screen === 'card') {
      st.deferred = p;
      toasted = false;
      return;
    }
    route(p);
  };

  /** Called when a card is confirmed: tell the player a new card is waiting (once). */
  K.pendingEntryToast = function pendingEntryToast() {
    if (st.deferred && !toasted) {
      toasted = true;
      K.toast('你有一道新刻度题');
    }
  };

  /** Back on Home: open the card that arrived mid-card. */
  K.resumeDeferred = function resumeDeferred() {
    const p = st.deferred;
    if (!p) return;
    st.deferred = null;
    if (!toasted) K.toast('你有一道新刻度题');
    toasted = false;
    route(p);
  };
};
