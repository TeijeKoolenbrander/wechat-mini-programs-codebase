'use strict';
// In-memory stand-in for the WeChat cloud database as a cloud function sees it. Models what our code relies on:
//   - duplicate _id on add, doc.get throwing when the document is missing
//   - default 100 / max 1000 rows per query, command.inc / in / gt / lte ..., dotted-path updates, array-contains equality
//   - TRANSACTIONS with optimistic concurrency (first committer wins, the others get a write conflict and are retried, like
//     the platform): every read is versioned, writes are buffered and applied atomically at commit
//   - every operation yields to the event loop, so concurrent calls genuinely interleave (AC 9: 50 racing claims)
//   - strictness: data containing `_id` in set/update is an error here (so the code never sends one)

const clone = (o) => (o === undefined ? undefined : JSON.parse(JSON.stringify(o)));
const tick = () => new Promise((r) => setImmediate(r));

function getPath(obj, path) {
  // like the platform's query language: a path through an array of objects ('seats.openid') yields the array of values (array-contains matching)
  return path.split('.').reduce((o, k) => {
    if (o == null) return undefined;
    if (Array.isArray(o) && !/^\d+$/.test(k)) return o.map((x) => (x == null ? undefined : x[k])).filter((x) => x !== undefined);
    return o[k];
  }, obj);
}
function setPath(obj, path, val) {
  const ks = path.split('.');
  let o = obj;
  for (let i = 0; i < ks.length - 1; i++) {
    if (o[ks[i]] == null || typeof o[ks[i]] !== 'object') o[ks[i]] = {};
    o = o[ks[i]];
  }
  o[ks[ks.length - 1]] = val;
}

const mk = (name, v) => {
  const o = { __op: name, v };
  o.and = (other) => ({ __op: 'and', v: [o, other], and: (x) => ({ __op: 'and', v: [o, other, x] }) });
  return o;
};
const command = {
  inc: (v) => mk('inc', v), lt: (v) => mk('lt', v), lte: (v) => mk('lte', v), gt: (v) => mk('gt', v), gte: (v) => mk('gte', v),
  in: (v) => mk('in', v), nin: (v) => mk('nin', v), neq: (v) => mk('neq', v), eq: (v) => mk('eq', v), remove: () => mk('remove'),
};

function matchVal(actual, cond) {
  if (cond && cond.__op) {
    switch (cond.__op) {
      case 'lt': return actual !== undefined && actual !== null && actual < cond.v;
      case 'lte': return actual !== undefined && actual !== null && actual <= cond.v;
      case 'gt': return actual !== undefined && actual !== null && actual > cond.v;
      case 'gte': return actual !== undefined && actual !== null && actual >= cond.v;
      case 'and': return cond.v.every((c) => matchVal(actual, c));
      case 'in': return cond.v.some((x) => JSON.stringify(x) === JSON.stringify(actual));
      case 'nin': return !cond.v.some((x) => JSON.stringify(x) === JSON.stringify(actual));
      case 'neq': return JSON.stringify(actual) !== JSON.stringify(cond.v);
      case 'eq': return JSON.stringify(actual) === JSON.stringify(cond.v);
      default: throw new Error('fake-db: unsupported op ' + cond.__op);
    }
  }
  if (Array.isArray(actual) && !Array.isArray(cond)) return actual.some((x) => JSON.stringify(x) === JSON.stringify(cond)); // array-contains
  return JSON.stringify(actual) === JSON.stringify(cond);
}
const matches = (doc, where) => Object.keys(where || {}).every((k) => matchVal(getPath(doc, k), where[k]));

function applyUpdate(doc, data) {
  for (const [k, v] of Object.entries(data)) {
    if (v && v.__op === 'inc') setPath(doc, k, (getPath(doc, k) || 0) + v.v);
    else if (v && v.__op === 'remove') {
      const ks = k.split('.');
      const parent = ks.length > 1 ? getPath(doc, ks.slice(0, -1).join('.')) : doc;
      if (parent) delete parent[ks[ks.length - 1]];
    } else setPath(doc, k, clone(v));
  }
}

function dupError() {
  const e = new Error('database.add:fail -502001 duplicate key: _id already exists');
  e.errCode = -502001;
  return e;
}
function notFound(id) {
  const e = new Error(`document.get:fail document with _id ${id} does not exist`);
  e.errCode = -502002;
  return e;
}
function conflictError() {
  const e = new Error('database.transaction:fail -503000 transaction write conflict');
  e.errCode = -503000;
  return e;
}
function noId(data, what) {
  if (data && Object.prototype.hasOwnProperty.call(data, '_id')) throw new Error('fake-db: ' + what + ' data must not contain _id');
}

class FakeDb {
  constructor() {
    this.cols = new Map(); // name -> Map(id -> {doc, ver})
    this.command = command;
    this.seq = 0;
    this.stats = { reads: 0, conflicts: 0, commits: 0 };
    this.touched = new Set(); // every collection name that was used (security test)
  }
  _col(name) {
    this.touched.add(name);
    if (!this.cols.has(name)) this.cols.set(name, new Map());
    return this.cols.get(name);
  }
  /** test helpers (synchronous, no yielding) */
  all(name) { return [...this._col(name).values()].map((r) => clone(r.doc)); }
  get(name, id) { const r = this._col(name).get(id); return r ? clone(r.doc) : null; }
  put(name, doc) { this._col(name).set(doc._id, { doc: clone(doc), ver: ++this.seq }); }
  collection(name) { return new Coll(this, name); }

  async runTransaction(fn, times = 3) {
    let last;
    for (let i = 0; i < times; i++) {
      const tx = new Txn(this);
      try {
        const r = await fn(tx);
        tx._commit();
        return r;
      } catch (e) {
        if (e && e.errCode === -503000) {
          this.stats.conflicts++;
          last = e;
          continue;
        }
        throw e;
      }
    }
    throw last;
  }
}

class Txn {
  constructor(db) {
    this.db = db;
    this.reads = new Map(); // key -> version seen (0 = absent)
    this.writes = new Map(); // key -> {name, id, doc|null}
  }
  collection(name) { return new TxColl(this, name); }
  _key(name, id) { return name + '\u0000' + id; }
  _view(name, id) {
    const k = this._key(name, id);
    if (this.writes.has(k)) return this.writes.get(k).doc;
    const rec = this.db._col(name).get(id);
    if (!this.reads.has(k)) this.reads.set(k, rec ? rec.ver : 0);
    return rec ? clone(rec.doc) : null;
  }
  _touch(name, id) {
    const k = this._key(name, id);
    if (!this.reads.has(k) && !this.writes.has(k)) {
      const rec = this.db._col(name).get(id);
      this.reads.set(k, rec ? rec.ver : 0);
    }
  }
  _commit() {
    for (const [k, ver] of this.reads) {
      const [name, id] = k.split('\u0000');
      const rec = this.db._col(name).get(id);
      if ((rec ? rec.ver : 0) !== ver) throw conflictError();
    }
    const ver = ++this.db.seq;
    for (const w of this.writes.values()) {
      const col = this.db._col(w.name);
      if (w.doc === null) col.delete(w.id);
      else col.set(w.id, { doc: clone(w.doc), ver });
    }
    this.db.stats.commits++;
  }
}

class TxColl {
  constructor(tx, name) { this.tx = tx; this.name = name; }
  async add({ data }) {
    await tick();
    const id = data._id || `auto_${Math.random().toString(36).slice(2, 10)}`;
    if (this.tx._view(this.name, id)) throw dupError();
    this.tx.writes.set(this.tx._key(this.name, id), { name: this.name, id, doc: Object.assign(clone(data), { _id: id }) });
    return { _id: id };
  }
  doc(id) {
    const { tx, name } = this;
    return {
      async get() {
        await tick();
        const d = tx._view(name, id);
        if (!d) throw notFound(id);
        return { data: d };
      },
      async set({ data }) {
        await tick();
        noId(data, 'set');
        tx._touch(name, id);
        tx.writes.set(tx._key(name, id), { name, id, doc: Object.assign(clone(data), { _id: id }) });
        return { stats: { updated: 1 } };
      },
      async update({ data }) {
        await tick();
        noId(data, 'update');
        const cur = tx._view(name, id);
        if (!cur) return { stats: { updated: 0 } };
        applyUpdate(cur, data);
        tx.writes.set(tx._key(name, id), { name, id, doc: cur });
        return { stats: { updated: 1 } };
      },
      async remove() {
        await tick();
        tx._touch(name, id);
        tx.writes.set(tx._key(name, id), { name, id, doc: null });
        return { stats: { removed: 1 } };
      },
    };
  }
}

class Coll {
  constructor(db, name) { this.db = db; this.name = name; this.map = db._col(name); }
  async add({ data }) {
    await tick();
    if (Array.isArray(data)) throw new Error('fake-db: batch add unsupported (mirrors server SDK usage)');
    const id = data._id || `auto_${++this.db.seq}_${Math.random().toString(36).slice(2, 8)}`;
    if (this.map.has(id)) throw dupError();
    this.map.set(id, { doc: Object.assign(clone(data), { _id: id }), ver: ++this.db.seq });
    return { _id: id };
  }
  doc(id) {
    const self = this;
    return {
      async get() {
        await tick();
        const r = self.map.get(id);
        if (!r) throw notFound(id);
        return { data: clone(r.doc) };
      },
      async set({ data }) {
        await tick();
        noId(data, 'set');
        self.map.set(id, { doc: Object.assign(clone(data), { _id: id }), ver: ++self.db.seq });
        return { stats: { updated: 1 } };
      },
      async update({ data }) {
        await tick();
        noId(data, 'update');
        const r = self.map.get(id);
        if (!r) return { stats: { updated: 0 } };
        applyUpdate(r.doc, data);
        r.ver = ++self.db.seq;
        return { stats: { updated: 1 } };
      },
      async remove() {
        await tick();
        return { stats: { removed: self.map.delete(id) ? 1 : 0 } };
      },
    };
  }
  where(w) { return new Query(this, w); }
  async count() { return new Query(this, {}).count(); }
  orderBy(f, d) { return new Query(this, {}).orderBy(f, d); }
  limit(n) { return new Query(this, {}).limit(n); }
  get() { return new Query(this, {}).get(); }
}

class Query {
  constructor(coll, where) { this.coll = coll; this.w = where; this._order = []; this._skip = 0; this._limit = 100; this._field = null; }
  orderBy(f, dir) { this._order.push([f, dir]); return this; }
  skip(n) { this._skip = n; return this; }
  limit(n) { this._limit = Math.min(n, 1000); return this; }
  field(f) { this._field = f; return this; }
  _rows() {
    const rows = [...this.coll.map.values()].map((r) => r.doc).filter((d) => matches(d, this.w));
    if (this._order.length) {
      rows.sort((a, b) => {
        for (const [f, dir] of this._order) {
          const x = getPath(a, f);
          const y = getPath(b, f);
          if (x < y) return dir === 'desc' ? 1 : -1;
          if (x > y) return dir === 'desc' ? -1 : 1;
        }
        return 0;
      });
    }
    return rows;
  }
  async get() {
    await tick();
    let rows = this._rows().slice(this._skip, this._skip + this._limit).map(clone);
    if (this._field) {
      rows = rows.map((r) => {
        const o = { _id: r._id };
        for (const k of Object.keys(this._field)) if (this._field[k]) o[k] = r[k];
        return o;
      });
    }
    this.coll.db.stats.reads += rows.length;
    return { data: rows };
  }
  async count() { await tick(); return { total: this._rows().length }; }
  async remove() {
    await tick();
    const rows = this._rows().slice(0, 1000);
    for (const r of rows) this.coll.map.delete(r._id);
    return { stats: { removed: rows.length } };
  }
  async update({ data }) {
    await tick();
    noId(data, 'update');
    const rows = this._rows().slice(0, 1000);
    for (const r of rows) {
      applyUpdate(r, data);
      this.coll.map.get(r._id).ver = ++this.coll.db.seq;
    }
    return { stats: { updated: rows.length } };
  }
}

module.exports = { FakeDb, clone };
