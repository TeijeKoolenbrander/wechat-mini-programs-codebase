'use strict';
// TEST DOUBLE of core/validate.js. Implements the section 14.3 rejection rules in simplified form.
const { getContent } = require('./content');
const { buildSheet } = require('./sheet');
const SLOTS = ['zhugong', 'junshi', 'xianfeng', 'mengjiang', 'shoujiang'];

function replay(seed, contentVersion, actions, mode) {
  let content;
  try { content = getContent(contentVersion); } catch (e) { return { ok: false, error: 'unknown contentVersion' }; }
  const rounds = buildSheet(seed, contentVersion);
  const picked = [];
  const slots = new Map();
  const tokens = rounds.map((r) => ({ faction: r.faction, era: r.era }));
  const st = rounds.map(() => ({ flipped: false, kf: 0, ke: 0, ad: 0, picked: false }));
  for (const a of actions) {
    const s = st[a.round - 1];
    const r = rounds[a.round - 1];
    if (a.type === 'flip') {
      if (a.round > 1 && !st[a.round - 2].picked) return { ok: false, error: 'flip before previous pick' };
      s.flipped = true;
    } else if (a.type === 'respinFaction' || a.type === 'respinEra') {
      if (!s.flipped) return { ok: false, error: 'respin before flip' };
      if (s.picked) return { ok: false, error: 'respin after pick' };
      if (a.source === 'ad') {
        if (mode !== 'free') return { ok: false, error: 'ad respin not allowed' };
        if (++s.ad > 2) return { ok: false, error: 'too many ad respins' };
      } else if (a.type === 'respinFaction') {
        if (s.kf++ >= 1) return { ok: false, error: 'free faction respin used' };
        tokens[a.round - 1].faction = r.altFaction[0];
      } else {
        if (s.ke++ >= 1) return { ok: false, error: 'free era respin used' };
        tokens[a.round - 1].era = r.altEra[0];
      }
    } else if (a.type === 'pick') {
      if (!s.flipped || s.picked) return { ok: false, error: 'bad pick state' };
      const g = content.generals.find((x) => x.id === a.generalId);
      const t = tokens[a.round - 1];
      if (!g || g.faction !== t.faction || !g.eras.includes(t.era)) return { ok: false, error: 'pick not in pool' };
      if (picked.includes(g.id)) return { ok: false, error: 'duplicate general' };
      if (slots.has(a.slot)) return { ok: false, error: 'duplicate slot' };
      picked.push(g.id);
      slots.set(a.slot, g.id);
      s.picked = true;
    } else if (a.type === 'undo') {
      return { ok: false, error: 'undo unsupported in fake' };
    }
  }
  if (picked.length !== 5) return { ok: false, error: 'need exactly 5 picks' };
  return { ok: true, lineup: SLOTS.map((slot) => ({ slot, generalId: slots.get(slot) })), tokens };
}
module.exports = { replay };
