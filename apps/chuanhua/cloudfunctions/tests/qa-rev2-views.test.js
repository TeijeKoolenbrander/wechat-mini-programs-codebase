'use strict';
// QA rev. 2 (independent), part 1: WHERE ELSE can user text surface, and do the kill switch, reports, deletion and takedown reach every one of those places?
// Written from spec 6.4-6.5, 6.8, 7.1-7.4, 8.10, 8.11 and AC 54, 59-64, 71, 80, 82, 98, not from the developers' summary. Real cloud functions on the fake database.
// A test marked `todo` is an OPEN BUG (docs/chuanhua/qa/bugs.md); delete the `todo` option when the owner fixes it.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { roomWorld, drawing } = require('./helpers/roomworld');

const P = 'chuanhua_';
const SECRET_A = '外星人在吃披萨';
const SECRET_PROMPT = '我家的大熊猫';

async function withWorld(o, fn) {
  const w = await roomWorld(o);
  try {
    await fn(w);
  } finally {
    w.teardown();
  }
}
const cfg = (w, ugc) => {
  w.h.db.put(P + 'app_config', { _id: 'live', ugc: Object.assign({ createEnabled: true, viewEnabled: true }, ugc) });
  w.h.resetCaches();
};

/** a complete 慢慢传 chain A(1,3,5) / B(2,4,6) in sync mode; returns the chain id */
async function slowChain(w, { custom } = {}) {
  const A = w.u.A;
  const B = w.u.B;
  let c;
  if (custom) {
    c = await A.call('createChain', { customText: custom, groupRef: A.ref });
  } else {
    const roll = await A.call('rollPrompts', {});
    c = await A.call('createChain', { rollId: roll.rollId, promptId: roll.prompts[0].id, groupRef: A.ref });
  }
  assert.equal(c.ok, true, JSON.stringify(c));
  const id = c.chainId;
  assert.equal((await A.call('submitStep', { chainId: id, claimId: c.claim.claimId, strokes: drawing(3, 1024) })).state, 'passed');
  const turn = async (u, body) => {
    const k = await u.call('claimStep', { chainId: id, groupRef: u.ref });
    assert.equal(k.ok, true, JSON.stringify(k));
    const r = await u.call('submitStep', Object.assign({ chainId: id, claimId: k.claimId }, body));
    assert.equal(r.ok, true, JSON.stringify(r));
    return r;
  };
  await turn(B, { text: '一个大饼在天上' });
  await turn(A, { strokes: drawing(4, 1024) });
  await turn(B, { text: '谁在吃大饼呢' });
  await turn(A, { strokes: drawing(5, 1024) });
  const last = await turn(B, { text: SECRET_A });
  assert.equal(last.revealed, true);
  return id;
}

/** a finished live room of `names`; every describe round says `say(seat)`; returns {id, finalChains} */
async function liveGame(w, names, say) {
  const id = await w.game(names);
  await w.pickAll(id, names);
  for (let k = 0; k < 8 && w.room(id).state === 'playing'; k++) {
    const r = w.room(id);
    if (r.kind === 'draw') await w.sendRound(id, names);
    else await w.sendRound(id, names, { text: say || SECRET_A });
  }
  assert.equal(w.room(id).state, 'reveal');
  return id;
}

// OPEN (QA-R2-3): getGroupChains has no viewEnabled check, so the emergency stop leaves the prompt and last sentence of every revealed chain readable in 本群接龙.
test('6.8 / AC 54: viewEnabled=false is the emergency stop for EVERY content view: the 本群接龙 list shows no user text either', async () => {
  await withWorld({ n: 5 }, async (w) => {
    await slowChain(w, { custom: SECRET_PROMPT });
    const before = await w.u.C.call('getGroupChains', { groupRef: w.u.C.ref });
    assert.equal(before.revealed[0].promptText, SECRET_PROMPT, 'sanity: a passed custom prompt is listed while viewing is on');
    cfg(w, { viewEnabled: false });
    const list = await w.u.C.call('getGroupChains', { groupRef: w.u.C.ref });
    const dump = JSON.stringify(list);
    assert.ok(!dump.includes(SECRET_PROMPT) && !dump.includes(SECRET_A), 'the group list must not carry user text while viewEnabled is false: ' + dump);
  });
});

test('6.8 / AC 54: viewEnabled=false: the 慢慢传 teaser is paused and a participant gets placeholders, no text', async () => {
  await withWorld({ n: 5 }, async (w) => {
    const id = await slowChain(w, { custom: SECRET_PROMPT });
    cfg(w, { viewEnabled: false });
    const teaser = await w.u.C.call('getReveal', { chainId: id });
    assert.equal(teaser.code, 'NOT_PARTICIPANT');
    assert.equal(teaser.teaser.paused, true);
    assert.ok(!JSON.stringify(teaser).includes(SECRET_A), 'teaser text is withheld while paused');
    const mine = await w.u.A.call('getReveal', { chainId: id });
    assert.ok(!JSON.stringify(mine).includes(SECRET_A), 'a participant gets placeholders too');
  });
});

test('6.8 / AC 54 (live): viewEnabled=false mid-round: the assignment is a `paused` source with no strokes or text, the room teaser and a member reveal are placeholders', async () => {
  await withWorld({ n: 4 }, async (w) => {
    const names = ['A', 'B', 'C', 'D'];
    const id = await w.game(names);
    await w.pickAll(id, names);
    await w.sendRound(id, ['A', 'B', 'C'], { strokes: drawing(7, 1500) }); // D stays silent
    cfg(w, { viewEnabled: false });
    const v = await w.view(id, 'D');
    assert.equal(v.assignment.source.kind, 'paused', JSON.stringify(v.assignment));
    assert.ok(!JSON.stringify(v.assignment).includes('strokes'));
    w.expireRound(id);
    for (const nm of names) await w.u[nm].call('roomTick', { roomId: id });
    // finish the game
    for (let k = 0; k < 6 && w.room(id).state === 'playing'; k++) {
      w.expireRound(id);
      await w.u.A.call('roomTick', { roomId: id });
    }
    cfg(w, { viewEnabled: false });
    const rev = await w.u.A.call('getRoomReveal', { roomId: id });
    assert.ok(!JSON.stringify(rev).match(/strokes|"text"/), JSON.stringify(rev).slice(0, 300));
  });
});

test('7.1 / 6.5 (慢慢传): after a report hides the final sentence, no other surface (group list, teaser) still serves it', async () => {
  await withWorld({ n: 5 }, async (w) => {
    const id = await slowChain(w);
    assert.equal(JSON.stringify(await w.u.C.call('getGroupChains', { groupRef: w.u.C.ref })).includes(SECRET_A), true, 'sanity');
    assert.equal((await w.u.A.call('report', { chainId: id, step: 6, reason: 'other' })).hidden, true);
    const list = await w.u.C.call('getGroupChains', { groupRef: w.u.C.ref });
    assert.ok(!JSON.stringify(list).includes(SECRET_A), 'group list after the report: ' + JSON.stringify(list.revealed));
    const teaser = await w.u.C.call('getReveal', { chainId: id });
    assert.ok(!JSON.stringify(teaser).includes(SECRET_A), 'teaser after the report');
    const mine = await w.u.B.call('getReveal', { chainId: id });
    assert.ok(!JSON.stringify(mine).includes(SECRET_A), 'participant reveal after the report');
  });
});

test('7.1 (慢慢传): reporting a CUSTOM prompt hides the whole chain: no listing, no teaser text, placeholders for participants', async () => {
  await withWorld({ n: 5 }, async (w) => {
    const id = await slowChain(w, { custom: SECRET_PROMPT });
    assert.equal((await w.u.C.call('report', { chainId: id, step: 0, reason: 'other' })).hidden, true);
    const list = await w.u.D.call('getGroupChains', { groupRef: w.u.D.ref });
    assert.ok(!JSON.stringify(list).includes(SECRET_PROMPT), 'group list: ' + JSON.stringify(list.revealed));
    assert.ok(!JSON.stringify(await w.u.D.call('getReveal', { chainId: id })).includes(SECRET_PROMPT), 'teaser');
    assert.ok(!JSON.stringify(await w.u.A.call('getReveal', { chainId: id })).includes(SECRET_PROMPT), 'participant');
  });
});

test('7.4 / AC 71: after the author deletes the final sentence it is gone from the group list and the teaser as well', async () => {
  await withWorld({ n: 5 }, async (w) => {
    const id = await slowChain(w);
    const del = await w.u.B.call('deleteMyStep', { chainId: id, step: 6 });
    assert.equal(del.ok, true, JSON.stringify(del));
    const list = await w.u.C.call('getGroupChains', { groupRef: w.u.C.ref });
    assert.ok(!JSON.stringify(list).includes(SECRET_A), 'group list: ' + JSON.stringify(list.revealed));
    assert.ok(!JSON.stringify(await w.u.C.call('getReveal', { chainId: id })).includes(SECRET_A), 'teaser');
  });
});

test('AC 64: admin removeChain / removeRoom leave no listing and no text anywhere for members or strangers', async () => {
  await withWorld({ n: 6 }, async (w) => {
    const id = await slowChain(w, { custom: SECRET_PROMPT });
    const room = await liveGame(w, ['A', 'B', 'C', 'D'], '舞台上的灯笼鱼');
    assert.equal((await w.h.call('admin', { op: 'removeChain', chainId: id }, {})).ok, true);
    assert.equal((await w.h.call('admin', { op: 'removeRoom', roomId: room }, {})).ok, true);
    const list = await w.u.E.call('getGroupChains', { groupRef: w.u.E.ref });
    const dump = JSON.stringify(list);
    assert.ok(!dump.includes(SECRET_PROMPT) && !dump.includes(SECRET_A), dump);
    assert.deepEqual(list.revealed, [], 'nothing removed is listed');
    const t = await w.u.E.call('getRoomReveal', { roomId: room });
    assert.ok(!JSON.stringify(t).includes('灯笼鱼'), 'a removed room serves no teaser text: ' + JSON.stringify(t).slice(0, 200));
    const rv = await w.u.A.call('getRoomReveal', { roomId: room });
    assert.equal(rv.ok, false);
    assert.ok(!JSON.stringify(rv).includes('灯笼鱼'));
  });
});

test('7.1 (live): after a member reports the final sentence in the step-through, the room teaser a non-member sees no longer carries it', async () => {
  await withWorld({ n: 5 }, async (w) => {
    const names = ['A', 'B', 'C', 'D'];
    const id = await liveGame(w, names, SECRET_A);
    const rv = await w.u.A.call('getRoomReveal', { roomId: id });
    assert.equal(rv.ok, true, JSON.stringify(rv));
    const before = await w.u.E.call('getRoomReveal', { roomId: id });
    assert.equal(before.code, 'NOT_MEMBER');
    const seen = JSON.stringify(before.teaser);
    // R = 3 for n = 4: the chains end on a drawing, so use a 5-player game for a text finale
    void seen;
  });
  await withWorld({ n: 6 }, async (w) => {
    const names = ['A', 'B', 'C', 'D', 'E'];
    const id = await w.game(names);
    await w.pickAll(id, names);
    for (let k = 0; k < 8 && w.room(id).state === 'playing'; k++) {
      const r = w.room(id);
      if (r.kind === 'draw') await w.sendRound(id, names);
      else await w.sendRound(id, names, { text: SECRET_A });
    }
    assert.equal(w.room(id).R, 4, 'n = 5: four rounds, the chains end on a sentence');
    const rv = await w.u.A.call('getRoomReveal', { roomId: id });
    const card = rv.cards.find((c) => c.finalKind === 'describe');
    assert.ok(card, JSON.stringify(rv.cards));
    const before = JSON.stringify((await w.u.F.call('getRoomReveal', { roomId: id })).teaser);
    assert.ok(before.includes(SECRET_A), 'sanity: the teaser shows the passed final sentence');
    const full = await w.u.A.call('getReveal', { chainId: card.chainId });
    const last = full.steps[full.steps.length - 1];
    const out = await w.u.B.call('report', { chainId: card.chainId, step: last.n, reason: 'other' });
    assert.equal(out.ok, true, JSON.stringify(out));
    const after = JSON.stringify((await w.u.F.call('getRoomReveal', { roomId: id })).teaser);
    assert.ok(!after.includes(SECRET_A) || after.split(SECRET_A).length < before.split(SECRET_A).length, 'the reported sentence is gone from the room teaser: ' + after);
  });
});

test('6.4: a member cannot read a live chain before the reveal even with its id (getReveal), and a stranger gets nothing from getRoom / getRoomReveal mid-game', async () => {
  await withWorld({ n: 6 }, async (w) => {
    const names = ['A', 'B', 'C', 'D'];
    const id = await w.game(names);
    await w.pickAll(id, names);
    await w.sendRound(id, names, { strokes: drawing(9, 1800) });
    const chainId = w.room(id).chainIds[0];
    for (const nm of names) {
      const r = await w.u[nm].call('getReveal', { chainId });
      assert.equal(r.ok, false, nm + ' must not read a running live chain: ' + JSON.stringify(r).slice(0, 200));
      assert.ok(!JSON.stringify(r).includes('strokes'));
    }
    const stranger = await w.u.E.call('getReveal', { chainId });
    assert.equal(stranger.ok, false);
    assert.ok(!JSON.stringify(stranger).includes('strokes'));
    const rr = await w.u.E.call('getRoomReveal', { roomId: id });
    assert.equal(rr.ok, false);
    assert.ok(!JSON.stringify(rr).includes('strokes'));
    const gr = await w.u.E.call('getRoom', { roomId: id, groupRef: w.u.E.ref });
    assert.ok(!JSON.stringify(gr).match(/strokes|assignment|source/), JSON.stringify(gr));
  });
});

test('AC 71 / 83 (live): 笑 toggles once per member and step and never on a marker; the author cannot delete a step while the game runs (single or all), after the reveal deleting works and markers are never deletable', async () => {
  await withWorld({ n: 6 }, async (w) => {
    const names = ['A', 'B', 'C', 'D', 'E'];
    const id = await w.game(names);
    await w.pickAll(id, names);
    await w.sendRound(id, names, { strokes: drawing(3, 1300) });
    // mid-game: nobody can delete (the step is part of a running round), the single form is refused and the all-form deletes nothing
    const chainOfA = w.room(id).chainIds[1]; // chain 1 is worked by A (seat 0) in round 1
    const mid = await w.u.A.call('deleteMyStep', { chainId: chainOfA, step: 1 });
    assert.equal(mid.ok, false, 'no deletion while the room plays: ' + JSON.stringify(mid));
    const all = await w.u.A.call('deleteMyStep', { all: true });
    assert.deepEqual([all.ok, all.count], [true, 0], 'delete-all skips a playing room');
    assert.ok(w.rows('steps').filter((s) => s.author === 'openid-A' && s.kind === 'draw' && !s.marker && s.strokes).length >= 1, 'A step is intact');
    // E stays silent in round 2 (describe) so there is a marker in the reveal
    for (let k = 0; k < 8 && w.room(id).state === 'playing'; k++) {
      const r = w.room(id);
      if (r.kind === 'draw') await w.sendRound(id, names);
      else {
        await w.sendRound(id, ['A', 'B', 'C', 'D'], { text: '一只猫在开出租车' }); // E stays silent: an emptyText marker
        w.expireRound(id);
        await w.u.A.call('roomTick', { roomId: id });
      }
    }
    assert.equal(w.room(id).state, 'reveal');
    const rv = await w.u.A.call('getRoomReveal', { roomId: id });
    const full = await w.u.A.call('getReveal', { chainId: rv.cards[1].chainId });
    const textStep = full.steps.find((s) => s.kind === 'describe' && !s.marker && s.canLaugh);
    const markerStep = full.steps.find((s) => s.marker);
    assert.ok(textStep, JSON.stringify(full.steps.map((s) => [s.n, s.kind, !!s.marker, s.canLaugh])));
    const l1 = await w.u.B.call('laugh', { chainId: rv.cards[1].chainId, step: textStep.n });
    assert.deepEqual([l1.ok, l1.laughs, l1.mine], [true, 1, true]);
    const l2 = await w.u.C.call('laugh', { chainId: rv.cards[1].chainId, step: textStep.n });
    assert.deepEqual([l2.laughs, l2.mine], [2, true]);
    const l3 = await w.u.B.call('laugh', { chainId: rv.cards[1].chainId, step: textStep.n });
    assert.deepEqual([l3.laughs, l3.mine], [1, false], 'a second tap toggles it off');
    if (markerStep) assert.equal((await w.u.B.call('laugh', { chainId: rv.cards[1].chainId, step: markerStep.n })).ok, false, 'no 笑 on a marker');
    assert.equal((await w.u.F.call('laugh', { chainId: rv.cards[1].chainId, step: textStep.n })).ok, false, 'a stranger cannot laugh');
    // after the reveal the author can delete a content step but never a marker
    const mine = await w.u.A.call('deleteMyStep', { all: true });
    assert.equal(mine.ok, true);
    assert.ok(mine.count >= 1, 'A deleted ' + mine.count);
    assert.ok(w.rows('steps').filter((s) => s.marker).every((s) => s.state !== 'deleted'), 'markers are never deleted');
    const after = await w.u.B.call('getReveal', { chainId: w.room(id).chainIds[1] });
    assert.ok(after.steps.some((s) => s.placeholder === 'deleted'), 'the deleted step is a placeholder for everybody');
  });
});
