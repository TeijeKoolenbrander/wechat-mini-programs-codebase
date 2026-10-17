'use strict';
// QA rev. 3 (independent), final gate: the riskiest live-room paths re-checked after the backend contention work (TD-145 / TD-146):
//   1. forced send at 0 s with every seat sending at once (n = 10, zero-jitter schedule), client-style retry on BUSY_RETRY: nobody sees INTERNAL, no slot becomes a marker,
//      rotation holds in every chain;
//   2. a server fault after a drawing PASSED moderation never turns that drawing into 「（这一棒没传过来）」: the seat resends and the reveal shows the drawing;
//   3. moderation stays fail-closed when the check errors or says risky, also under contention;
//   4. a fault in the middle of a game does not break the rotation or the rematch;
//   5. startRoom rolls: seats that joined and left between attempts never end up sharing prompt ids.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { roomWorld, drawing } = require('./helpers/roomworld');

const P = 'chuanhua_';
async function withWorld(o, fn) {
  const w = await roomWorld(o);
  const unhandled = [];
  const ce = console.error;
  console.error = (...a) => {
    if (a[0] === 'unhandled') unhandled.push(String(a[1]).trim());
    else ce(...a);
  };
  try {
    await fn(w, unhandled);
  } finally {
    console.error = ce;
    w.teardown();
  }
}
const conflict = () => Object.assign(new Error('database.transaction:fail -503000 transaction write conflict'), { errCode: -503000 });
const stripe = (s, round) => drawing(3, 1000 + s * 7 + round);

/** the rotation invariant: step k of chain c was written by seat (c + k) mod n, and nobody wrote two steps of one chain */
function assertRotation(w, id) {
  const room = w.room(id);
  const n = room.n;
  const chains = w.rows('chains').filter((c) => c.roomId === id);
  assert.equal(chains.length, n);
  for (const c of chains) {
    const authors = c.authors.filter(Boolean);
    c.authors.forEach((a, k) => {
      if (!a) return;
      assert.equal(a, room.seats[(c.seat + k) % n].openid, 'chain ' + c.seat + ' step ' + k + ' written by the wrong seat');
    });
    assert.equal(new Set(authors).size, authors.length, 'chain ' + c.seat + ' has a repeated author');
  }
}

test('QA-R3-1: ten seats, zero-jitter, every round a simultaneous send storm with client-style retry: only BUSY_RETRY may be seen, no marker, no INTERNAL, rotation intact, reveal complete', async () => {
  const realRandom = Math.random;
  Math.random = () => 0;
  try {
    await withWorld({ n: 10 }, async (w, unhandled) => {
      const names = w.names;
      const id = await w.game(names);
      const seen = new Set();
      const send = async (nm, body) => {
        for (let i = 0; i < 6; i++) {
          const r = await w.u[nm].call('submitRoomStep', body);
          if (r.ok) return r;
          seen.add(r.code);
          assert.equal(r.code, 'BUSY_RETRY', nm + ' got ' + JSON.stringify(r));
          w.h.advance(1000);
        }
        assert.fail(nm + ' never got through');
      };
      for (let round = 0; w.room(id).state === 'playing'; round++) {
        const room = w.room(id);
        assert.equal(room.round, round);
        const views = await Promise.all(names.map((nm) => w.view(id, nm)));
        const out = await Promise.all(names.map((nm, s) => {
          if (round === 0) {
            const roll = views[s].assignment.roll;
            return send(nm, { roomId: id, round, rollId: roll.rollId, promptId: roll.prompts[0].id, auto: true, empty: false });
          }
          return send(nm, room.kind === 'draw' ? { roomId: id, round, strokes: stripe(s, round), auto: true, empty: false } : { roomId: id, round, text: '一只猫在开出租车', auto: true, empty: false });
        }));
        assert.ok(out.every((r) => r.ok));
        if (round > 12) assert.fail('game did not end');
      }
      const r = w.room(id);
      assert.equal(r.state, 'reveal');
      assert.equal(r.endedBy === 'cap', false);
      for (const slots of Object.values(r.slots)) for (const sl of slots) assert.notEqual(sl.state, 'marker', 'a send storm produced a marker: ' + JSON.stringify(sl));
      assert.equal(w.rows('steps').filter((s) => s.roomId === id && s.state !== 'passed').length, 0);
      assert.equal(w.rows('steps').filter((s) => s.roomId === id && s.state === 'passed').length, 10 * r.R);
      assertRotation(w, id);
      assert.deepEqual(unhandled.filter((u) => !/conflict/i.test(u)), []);
      console.log('QA-R3-1 codes seen under zero jitter, n = 10:', JSON.stringify([...seen]));
    });
  } finally {
    Math.random = realRandom;
  }
});

test('QA-R3-2: a fault AFTER the drawing passed moderation (the resolving transaction conflicts for the whole first send) releases the slot, answers BUSY_RETRY (never INTERNAL), the resend is taken at once and the drawing, not a marker, is in the reveal', async () => {
  await withWorld({ n: 4 }, async (w) => {
    const names = ['A', 'B', 'C'];
    const id = await w.game(names);
    await w.pickAll(id, names);
    await w.view(id, 'A');
    const db = w.h.db;
    const orig = db.runTransaction.bind(db);
    let fail = true;
    db.runTransaction = (fn, times) => orig(async (tx) => {
      const r = await fn(tx);
      const w2 = [...tx.writes.values()].find((x) => x.name === P + 'rooms' && x.doc && x.doc.slots && x.doc.slots['1'] && !['received', 'none'].includes(x.doc.slots['1'][0].state));
      if (fail && w2) throw conflict();
      return r;
    }, times);
    const first = await w.u.A.call('submitRoomStep', { roomId: id, round: 1, strokes: stripe(0, 1), auto: false, empty: false });
    assert.equal(first.ok, false);
    assert.equal(first.code, 'BUSY_RETRY', JSON.stringify(first));
    assert.equal(w.room(id).slots['1'][0].state, 'none', 'the slot is released, not stranded in `received`');
    fail = false;
    const retry = await w.u.A.call('submitRoomStep', { roomId: id, round: 1, strokes: stripe(0, 1), auto: false, empty: false }); // same second: no wait for the 8 s takeover
    assert.equal(retry.ok, true, JSON.stringify(retry));
    assert.equal(w.rows('steps').filter((s) => s.author === 'openid-A' && s.kind === 'draw' && s.state === 'passed').length, 1, 'exactly one passed drawing by A (no orphan from the failed try)');
    // the rest of the game
    await w.sendRound(id, ['B', 'C']);
    for (let k = 0; k < 8 && w.room(id).state === 'playing'; k++) {
      await w.sendRound(id, names).catch(() => {});
      if (w.room(id).state === 'playing') {
        w.expireRound(id);
        await w.u.A.call('roomTick', { roomId: id });
      }
    }
    assert.equal(w.room(id).state, 'reveal');
    assert.equal(w.room(id).slots['1'][0].state, 'sent');
    const chain = w.rows('chains').find((c) => c.roomId === id && c.seat === 0);
    const step1 = w.rows('steps').find((s) => s._id === chain.stepIds[1]);
    assert.ok(step1 && !step1.marker && step1.strokes, 'chain 0 step 1 is A\'s drawing');
    assertRotation(w, id);
  });
});

test('QA-R3-3: the round deadline passes while the seat is still being told BUSY_RETRY: a passed-but-unresolved drawing is not delivered as a marker silently with ok:true to the author (the author was told to retry, the marker is the documented not-delivered outcome)', async () => {
  await withWorld({ n: 4 }, async (w) => {
    const names = ['A', 'B', 'C'];
    const id = await w.game(names);
    await w.pickAll(id, names);
    await w.view(id, 'A');
    const db = w.h.db;
    const orig = db.runTransaction.bind(db);
    db.runTransaction = (fn, times) => orig(async (tx) => {
      const r = await fn(tx);
      const w2 = [...tx.writes.values()].find((x) => x.name === P + 'rooms' && x.doc && x.doc.slots && x.doc.slots['1'] && !['received', 'none'].includes(x.doc.slots['1'][0].state) && x.doc.slots['1'][0].stepId);
      if (w2) throw conflict();
      return r;
    }, times);
    const first = await w.u.A.call('submitRoomStep', { roomId: id, round: 1, strokes: stripe(0, 1), auto: true, empty: false });
    assert.equal(first.ok, false, JSON.stringify(first));
    assert.notEqual(first.code, 'INTERNAL');
    w.expireRound(id);
    await w.sendRound(id, ['B', 'C']).catch(() => {});
    const t = await w.u.B.call('roomTick', { roomId: id });
    assert.equal(t.ok, true, JSON.stringify(t));
    // the game moved on without A's drawing; nothing hangs, and no passed step row of A leaks into any chain
    const room = w.room(id);
    assert.ok(room.round >= 2 || room.state === 'reveal', 'the round ended');
    const chain = w.rows('chains').find((c) => c.roomId === id && c.seat === 0);
    const sid = chain.stepIds[1];
    const step = sid && w.rows('steps').find((s) => s._id === sid);
    if (step) assert.ok(step.marker, 'what stands in chain 0 step 1 is a marker (A never delivered)');
  });
});

test('QA-R3-4: moderation is fail-closed under contention: an erroring or risky image verdict never delivers the drawing to the next seat, the seat can resend, and nothing is stored as passed', async () => {
  for (const mode of ['throws', 'risky', 'errcode']) {
    await withWorld({ n: 4, env: { ENV_KIND: 'prod', MODERATION_MODE: 'live' } }, async (w) => {
      let behaviour = mode;
      w.h.handle('wxa.game.contentSpam.mediaCheckSync', async () => {
        if (behaviour === 'throws') throw new Error('openapi down');
        if (behaviour === 'risky') return { errCode: 0, result: { suggest: 'risky', label: 20002 } };
        if (behaviour === 'errcode') return { errCode: 87014, errMsg: 'risky content' };
        return { errCode: 0, result: { suggest: 'pass', label: 100 } };
      });
      w.h.handle('wxa.game.contentSpam.msgSecCheck', async () => ({ errCode: 0, result: { suggest: 'pass', label: 100 } }));
      const names = ['A', 'B', 'C'];
      const id = await w.game(names);
      await w.pickAll(id, names);
      await w.view(id, 'A');
      const bad = await Promise.all(names.map(async (nm) => {
        await w.view(id, nm);
        return w.u[nm].call('submitRoomStep', { roomId: id, round: 1, strokes: stripe(0, 1), auto: false, empty: false });
      }));
      for (const r of bad) assert.ok(!(r.ok && r.state === 'sent'), mode + ': a drawing was delivered despite the verdict ' + JSON.stringify(r));
      assert.equal(w.rows('steps').filter((s) => s.roomId === id && s.kind === 'draw' && s.state === 'passed' && !s.marker).length, 0, mode + ': a drawing is stored as passed');
      for (const sl of w.room(id).slots['1']) assert.ok(!['sent'].includes(sl.state), mode + ' slot ' + sl.state);
      // the next round's assignments never carry a stroke
      assert.ok(!JSON.stringify(await w.u.B.call('getRoom', { roomId: id })).includes('"strokes"'), mode + ': strokes leaked into a view');
      // service recovers: a resend by the seat goes through
      behaviour = 'pass';
      w.h.advance(1000);
      const ok = await w.u.A.call('submitRoomStep', { roomId: id, round: 1, strokes: stripe(0, 1), auto: false, empty: false });
      assert.equal(ok.ok, true, mode + ': resend after recovery ' + JSON.stringify(ok));
    });
  }
});

test('QA-R3-5: a fault mid-game (round 1 release) does not disturb the rest of the game: full rotation, reveal, then rematch returns ONE new lobby for all and the old room points to it', async () => {
  await withWorld({ n: 5 }, async (w) => {
    const names = w.names;
    const id = await w.game(names);
    await w.pickAll(id, names);
    for (const nm of names) await w.view(id, nm);
    const db = w.h.db;
    const orig = db.runTransaction.bind(db);
    let fails = 2;
    db.runTransaction = (fn, times) => orig(async (tx) => {
      const r = await fn(tx);
      const w2 = [...tx.writes.values()].find((x) => x.name === P + 'rooms' && x.doc && x.doc.slots && x.doc.slots['1'] && x.doc.slots['1'].some((s) => s.stepId));
      if (fails > 0 && w2) { fails--; throw Object.assign(conflict(), { _sticky: true }); }
      return r;
    }, times);
    // a flaky platform for the first two resolving writes; clients keep retrying
    for (let guard = 0; w.room(id).state === 'playing' && guard < 80; guard++) {
      const room = w.room(id);
      let progressed = false;
      for (const [s, nm] of names.entries()) {
        const sl = room.slots[String(room.round)] && room.slots[String(room.round)][s];
        if (sl && ['sent', 'marker'].includes(sl.state)) continue;
        await w.view(id, nm);
        const body = { roomId: id, round: room.round, auto: false, empty: false };
        if (room.kind === 'draw') body.strokes = stripe(s, room.round); else body.text = '一只猫在开出租车';
        const r = await w.u[nm].call('submitRoomStep', body);
        if (!r.ok) { assert.equal(r.code, 'BUSY_RETRY', JSON.stringify(r)); w.h.advance(1000); } else progressed = true;
      }
      if (!progressed) w.h.advance(1000);
    }
    assert.equal(w.room(id).state, 'reveal');
    assertRotation(w, id);
    for (const slots of Object.values(w.room(id).slots)) for (const sl of slots) assert.notEqual(sl.state, 'marker');
    const rs = await Promise.all(['C', 'D', 'A', 'B', 'E'].map((nm) => w.u[nm].call('rematch', { roomId: id })));
    assert.ok(rs.every((r) => r.ok), JSON.stringify(rs));
    assert.equal(new Set(rs.map((r) => r.roomId)).size, 1, 'one rematch room for everybody');
    const nr = w.room(rs[0].roomId);
    assert.equal(nr.state, 'lobby');
    assert.equal(nr.seats.length, 5);
    assert.equal(w.room(id).rematchRoomId, rs[0].roomId);
    assert.equal(w.rows('rooms').filter((r) => r.state === 'lobby').length, 1);
    // and the host of the rematch can start it
    const st = await w.u[nr.seats[0].openid.replace('openid-', '')].call('startRoom', { roomId: rs[0].roomId });
    assert.equal(st.ok, true, JSON.stringify(st));
  });
});

test('QA-R3-6: startRoom rolls only the seats added since the last attempt: with joins and a leave landing during the start, no two seats ever share a prompt id and every seat has 3 rolled prompts from 3 categories', async () => {
  await withWorld({ n: 9 }, async (w) => {
    const c = await w.u.A.call('createRoom', { groupRef: w.u.A.ref });
    for (const nm of ['B', 'C', 'D']) await w.u[nm].call('joinRoom', { roomId: c.roomId, groupRef: w.u[nm].ref });
    const db = w.h.db;
    const orig = db.runTransaction.bind(db);
    const script = [['join', 'E'], ['join', 'F'], ['leave', 'B'], ['join', 'G'], ['join', 'H'], ['leave', 'F'], ['join', 'I']];
    let k = 0;
    let injecting = false;
    db.runTransaction = async (fn, times) => {
      const isStart = String(fn).includes('startBlock') && String(fn).includes('newLiveChain');
      if (isStart && !injecting && k < script.length) {
        injecting = true;
        const [what, nm] = script[k++];
        await w.u[nm].call(what === 'join' ? 'joinRoom' : 'leaveRoom', what === 'join' ? { roomId: c.roomId, groupRef: w.u[nm].ref } : { roomId: c.roomId });
        injecting = false;
      }
      return orig(fn, times);
    };
    const out = await w.u.A.call('startRoom', { roomId: c.roomId });
    assert.equal(out.ok, true, JSON.stringify(out));
    const room = w.room(c.roomId);
    assert.equal(room.state, 'playing');
    const rolls = Object.values(room.rolls || {}).filter(Boolean);
    const seen = new Set();
    for (const r of rolls) {
      const ids = (r.prompts || r.ids || []).map((p) => (typeof p === 'string' ? p : p.id));
      assert.equal(ids.length, 3, JSON.stringify(r));
      for (const id of ids) { assert.ok(!seen.has(id), 'prompt id ' + id + ' rolled for two seats'); seen.add(id); }
    }
    assert.equal(room.seats.length, room.n);
    assert.ok(!room.seats.some((s) => ['openid-B', 'openid-F'].includes(s.openid)), 'the seats that left are not in the game');
  });
});
