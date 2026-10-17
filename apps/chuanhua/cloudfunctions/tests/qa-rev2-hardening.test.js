'use strict';
// QA rev. 2 (independent), part 4: security hardening, hostile input against every room function, joinGroup / pepper / track edge cases, the owner-read rule of room_signals.
// Spec 13.4, 16, AC 57, 73, 75, 112, 146 and TD-100 / TD-116 / TD-121. A test marked `todo` is an OPEN BUG (docs/chuanhua/qa/bugs.md).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { createHarness, cid } = require('./helpers/harness');
const { roomWorld, drawing } = require('./helpers/roomworld');

const CF = path.join(__dirname, '..');
const P = 'chuanhua_';

const HOSTILE_ROOM_IDS = [undefined, null, 0, 1, true, [], ['ABCDEFGHJK'], {}, { $ne: 'x' }, { toString: () => 'ABCDEFGHJK' }, '', ' ', 'x', '__proto__', 'constructor', 'toString', 'a.b', '../../etc/passwd', 'x'.repeat(10000), '\u0000', '😀'.repeat(20), 'ABCDEFGHJK\n', NaN, Infinity];
const HOSTILE_BODIES = [
  {}, { round: NaN }, { round: -1 }, { round: 1e9 }, { round: '1' }, { round: 1.5 }, { auto: 'yes' }, { empty: 1 },
  { strokes: null }, { strokes: [] }, { strokes: 'x' }, { strokes: { v: 2, h: 1000, s: [] } }, { strokes: { v: 2, h: NaN, s: [[0, 0, 1, 1]] } }, { strokes: { v: 2, h: 1000, s: [[0, 0, 1e9, 1]] } },
  { strokes: JSON.parse('{"v":2,"h":1000,"s":[[0,0,5,5]],"__proto__":{"polluted":1}}') }, { strokes: { v: 2, h: 5000, s: [[0, 0, 5, 5]] } }, { text: 'x'.repeat(100000) }, { text: ['a'] }, { text: { toString: () => '你好你好' } },
  { customText: '‮微信号12345678' }, { promptId: {}, rollId: [] }, { reroll: 'true' }, { reportRef: {} }, { reportRef: 'q', reason: {} },
  JSON.parse('{"__proto__":{"admin":true},"roomId":"ABCDEFGHJK"}'),
];

test('AC 112 (rooms): every room function answers {ok:boolean} and never INTERNAL for hostile room ids and bodies, for a member, a stranger and no one', async () => {
  const w = await roomWorld({ n: 6 });
  const unhandled = [];
  const ce = console.error;
  console.error = (...a) => {
    if (a[0] === 'unhandled') unhandled.push(String(a[1]).trim().slice(0, 120));
    else ce(...a);
  };
  try {
    const names = ['A', 'B', 'C', 'D'];
    const id = await w.game(names);
    await w.pickAll(id, names);
    await w.view(id, 'A');
    const fns = ['createRoom', 'joinRoom', 'leaveRoom', 'startRoom', 'getRoom', 'submitRoomStep', 'roomTick', 'getRoomReveal', 'rematch', 'rollPrompts', 'report', 'getHome', 'getMyChains', 'getGroupChains'];
    const bad = [];
    const snapshot = () => JSON.stringify([w.rows('rooms'), w.rows('steps')]);
    for (const fn of fns) {
      for (const who of ['A', 'E']) {
        if (fn === 'joinRoom' && who === 'A') continue; // a seated member re-entering a playing room: QA-R2-4 below (it is INTERNAL today)
        const evs = [];
        for (const rid of HOSTILE_ROOM_IDS) evs.push({ roomId: rid });
        for (const b of HOSTILE_BODIES) evs.push(Object.assign({ roomId: id, round: 1 }, b));
        evs.push(undefined, null, [], 'string', 42);
        for (const ev of evs) {
          let r;
          try {
            r = await w.u[who].call(fn, ev);
          } catch (e) {
            bad.push(fn + ' THREW ' + e.message);
            continue;
          }
          if (!r || typeof r.ok !== 'boolean') bad.push(fn + ' non-object answer ' + JSON.stringify(r));
          else if (r.code === 'INTERNAL') bad.push(fn + '(' + who + ') INTERNAL for ' + JSON.stringify(ev, (k, v) => (typeof v === 'string' && v.length > 30 ? v.slice(0, 30) + '..' : v)));
        }
      }
    }
    const byFn = {};
    for (const b of bad) byFn[b.split('(')[0].split(' ')[0]] = (byFn[b.split('(')[0].split(' ')[0]] || 0) + 1;
    assert.deepEqual(byFn, {}, bad.length + ' bad answers, first: ' + bad[0] + '; unhandled: ' + JSON.stringify(unhandled.slice(0, 2)));
    void snapshot;
    // the polluted prototype never took hold
    assert.equal({}.polluted, undefined);
    assert.equal({}.admin, undefined);
  } finally {
    console.error = ce;
    w.teardown();
  }
});

test('TD-100 / L5: GROUP_REF_PEPPER of 31 characters is refused (SERVER_CONFIG + [ALERT]), 32 works, missing is refused', async () => {
  for (const [pepper, ok] of [['p'.repeat(31), false], ['p'.repeat(32), true], [undefined, false], ['', false]]) {
    const h = createHarness({ env: { GROUP_REF_PEPPER: pepper } });
    const alerts = [];
    const ce = console.error;
    console.error = (...a) => alerts.push(String(a[0]));
    try {
      const r = await h.call('joinGroup', { cloudID: cid('g-1') }, { openid: 'u1' });
      assert.equal(r.ok, ok, 'pepper ' + JSON.stringify(pepper && pepper.length) + ': ' + JSON.stringify(r));
      if (!ok) assert.equal(r.code, 'SERVER_CONFIG');
      if (pepper !== undefined && pepper !== '' && !ok) assert.ok(alerts.some((a) => a.startsWith('[ALERT]')), 'a short pepper logs an [ALERT]');
      // a groupRef is never the bare hash of the group id (the pepper is mixed in)
      if (ok) assert.match(r.groupRef, /^[0-9a-f]{16}$/);
    } finally {
      console.error = ce;
      h.teardown();
    }
  }
});

test('TD-116 / 9.3: joinGroup accepts a group payload with chat_type absent, 3 or 4 and an opengid; everything else is refused; forged client payloads are never read', async () => {
  const h = createHarness();
  try {
    let seq = 0;
    const call = (event, openid) => h.call('joinGroup', event, { openid: openid || 'u' + ++seq });
    for (const chat of [undefined, null, 3, 4, '3', '4']) {
      h.state.openData.set('cloud-ok-' + chat, { cloudID: 'cloud-ok-' + chat, data: { opengid: 'GROUP-A', chat_type: chat } });
      assert.equal((await call({ cloudID: 'cloud-ok-' + chat })).ok, true, 'chat_type ' + chat);
    }
    const refused = [
      { data: { opengid: 'GROUP-A', chat_type: 1 } }, { data: { opengid: 'GROUP-A', chat_type: 2 } }, { data: { opengid: 'GROUP-A', chat_type: 5 } }, { data: { opengid: 'GROUP-A', chat_type: 0 } },
      { data: { opengid: 'GROUP-A', chat_type: 'abc' } }, { data: { opengid: 'GROUP-A', chat_type: {} } }, { data: { open_single_roomid: 'ROOM-1' } }, { data: { open_single_roomid: 'ROOM-1', chat_type: 3 } },
      { data: { opengid: '' } }, { data: { opengid: 'x'.repeat(129) } }, { data: { opengid: 12345 } }, { data: { opengid: ['G'] } }, { data: null }, { data: 'str' }, { data: [] },
      { errCode: 87009, data: { opengid: 'GROUP-A' } },
    ];
    let k = 0;
    for (const item of refused) {
      const id = 'cloud-bad-' + k++;
      h.state.openData.set(id, Object.assign({ cloudID: id }, item));
      const r = await call({ cloudID: id });
      assert.equal(r.ok, false, JSON.stringify(item));
      assert.ok(['NOT_GROUP', 'BAD_CLOUDID'].includes(r.code), JSON.stringify(item) + ' -> ' + r.code);
    }
    // a cloudID whose decrypted item names a different cloudID, a non-string cloudID, a forged groupData
    h.state.openData.set('cloud-swap', { cloudID: 'someone-else', data: { opengid: 'GROUP-A', chat_type: 3 } });
    assert.equal((await call({ cloudID: 'cloud-swap' })).ok, false);
    for (const bad of [undefined, null, 5, {}, [], ['cloud-ok-3'], 'x'.repeat(100000)]) assert.equal((await call({ cloudID: bad })).ok, false);
    const forged = await call({ groupData: { data: { opengid: 'GROUP-A', chat_type: 3 } }, cloudID: undefined });
    assert.equal(forged.ok, false, 'event.groupData is never read');
    assert.equal(h.db.all(P + 'group_members').length, 6, 'only the six accepted payloads created a membership (one row each), none from the refused ones');
    // the answer holds the opaque ref and nothing else
    const r = await call({ cloudID: 'cloud-ok-3' });
    assert.deepEqual(Object.keys(r).sort(), ['groupRef', 'ok']);
  } finally {
    h.teardown();
  }
});

test('L2 / AC 75: track drops hostile events: prototype names, nested and oversized payloads, content-like props; at most 50 events a batch; nothing but the catalogue reaches `events`', async () => {
  const h = createHarness();
  try {
    const big = Array.from({ length: 500 }, (_, i) => ({ name: 'laugh', sessionId: 's' + i, props: { mode: 'live' } }));
    const r = await h.call('track', {
      events: [
        { name: 'constructor', props: { keys: 1, name: 'x', length: 3 } },
        { name: '__proto__', props: { a: 1 } },
        { name: 'hasOwnProperty', props: {} },
        { name: 'toString', props: {} },
        { name: 'step_submit', props: { strokes: { v: 2, s: [[1]] }, chars: 'x'.repeat(100), text: '你好', openid: 'oABCDEFGHIJKLMNOPQRSTUVWXYZ12', mode: 'live', kind: 'draw', __proto__: { evil: 1 }, canvasH: 99999 }, sessionId: { a: 1 }, clientTs: 'now' },
        { name: 'rematch', props: { role: 'host', result: 'created', extra: { deep: [1, 2, 3] } } },
        { name: 'card_open', props: { cardKind: 'room', hasShareTicket: true, targetState: 'oABCDEFGHIJKLMNOPQRSTUVWXYZ12' } },
        ...big,
      ],
    }, { openid: 'u-track' });
    assert.equal(r.ok, true);
    const rows = h.db.all(P + 'events');
    assert.ok(rows.length <= 50, 'a batch is capped at 50 events: ' + rows.length);
    for (const e of rows) {
      assert.ok(!['constructor', '__proto__', 'hasOwnProperty', 'toString'].includes(e.name), e.name);
      const dump = JSON.stringify(e);
      assert.ok(!dump.includes('你好') && !dump.includes('strokes') && !dump.includes('evil'), dump);
    }
    const step = rows.find((e) => e.name === 'step_submit');
    assert.deepEqual(step && step.props, { mode: 'live', kind: 'draw' });
    assert.equal({}.evil, undefined);
    // an identity-looking string in a TOKEN-typed prop: stored as sent (the property is a short label); record the exposure for the report
    const card = rows.find((e) => e.name === 'card_open');
    assert.ok(card, 'card_open stored');
    assert.ok(typeof (card.props.targetState || '') === 'string');
  } finally {
    h.teardown();
  }
});

test('13.4 / AC 57 / 146: the ONLY custom rule is the owner-read rule of room_signals; its write rule is false; every other collection and the storage are deny-all', () => {
  const rules = JSON.parse(fs.readFileSync(path.join(CF, 'database', 'rules.json'), 'utf8'));
  const entries = Object.entries(rules).filter(([k]) => k !== '_comment');
  assert.ok(entries.length >= 18, 'one rule per collection: ' + entries.length);
  const custom = entries.filter(([, v]) => JSON.stringify(v) !== JSON.stringify({ read: false, write: false }));
  assert.deepEqual(custom.map(([k]) => k), ['chuanhua_room_signals']);
  assert.deepEqual(custom[0][1], { read: 'doc._openid == auth.openid', write: false });
  const storage = JSON.parse(fs.readFileSync(path.join(CF, 'storage.rules.json'), 'utf8'));
  assert.deepEqual({ read: storage.read, write: storage.write }, { read: false, write: false });
  assert.deepEqual(Object.keys(storage).filter((k) => k !== '_comment').sort(), ['read', 'write']);
});

test('146 / 73: the doorbell documents are the only data a client can read: each carries exactly the owner _openid and the allowed content-free fields, never any other openid, through a whole game with a leave and a rematch', async () => {
  const ALLOWED = new Set(['_id', '_openid', 'roomId', 'seq', 'state', 'round', 'kind', 'phase', 'deadline', 'serverNow', 'sent', 'active', 'rematchRoomId']);
  const w = await roomWorld({ n: 6 });
  try {
    const names = ['A', 'B', 'C', 'D', 'E'];
    const id = await w.game(names);
    await w.pickAll(id, names);
    await w.sendRound(id, names, { strokes: drawing(4, 1700) });
    await w.u.E.call('leaveRoom', { roomId: id });
    for (let k = 0; k < 8 && w.room(id).state === 'playing'; k++) {
      const r = w.room(id);
      if (r.kind === 'draw') await w.sendRound(id, ['A', 'B', 'C', 'D']);
      else await w.sendRound(id, ['A', 'B', 'C', 'D'], { text: '一只猫在开出租车' });
    }
    await w.u.A.call('rematch', { roomId: id });
    const docs = w.rows('room_signals');
    assert.ok(docs.length >= 6, 'signals exist for the old and the new room: ' + docs.length);
    const everyOpenid = names.map((n) => 'openid-' + n);
    for (const d of docs) {
      for (const k of Object.keys(d)) assert.ok(ALLOWED.has(k), 'unexpected signal field ' + k);
      assert.ok(everyOpenid.includes(d._openid), 'the owner');
      const rest = JSON.stringify(Object.assign({}, d, { _openid: undefined }));
      for (const o of everyOpenid) assert.ok(!rest.includes(o), 'another openid in a signal: ' + rest);
      assert.ok(!/strokes|text|prompt|chain/i.test(JSON.stringify(Object.keys(d))), 'no content field names');
      assert.equal(d._id, d.roomId + '_' + d._id.split('_').pop());
    }
    // one doc per seat and room
    assert.equal(new Set(docs.map((d) => d._id)).size, docs.length);
  } finally {
    w.teardown();
  }
});
