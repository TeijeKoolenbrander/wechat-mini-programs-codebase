'use strict';
// In-memory stand-in for the cloud database as a cloud function sees it (wx-server-sdk). Reproduces the behaviours the
// functions rely on (modelled on 点将台 tests/helpers/fake-db.js, extended):
//  - add with an existing _id throws a duplicate-key error (-502001); doc.get of a missing doc THROWS (-502002)
//  - query default limit 100, max 1000; skip/limit/orderBy/field/count/remove
//  - command: inc, lt/lte/gt/gte, in, neq, eq, and(); dotted-path update (`hist.33`)
//  - runTransaction: serialised (a global lock); writes are buffered and applied atomically at commit, reads inside
//    see the transaction's own writes, nothing is visible to other readers before commit, and a throw rolls
//    everything back. Queries (where) are NOT available inside a transaction, as in the real SDK.
//  - fault injection: db.faults = [fn(op) -> Error|undefined] is consulted on every write op.

const clone = (o) => (o === undefined ? undefined : JSON.parse(JSON.stringify(o)));

function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}
function setPath(obj, path, val) {
  const ks = path.split('.');
  let o = obj;
  for (let i = 0; i < ks.length - 1; i++) {
    if (o[ks[i]] == null) o[ks[i]] = {};
    o = o[ks[i]];
  }
  o[ks[ks.length - 1]] = val;
}

const op = (name, v) => ({ __op: name, v, and: (o) => ({ __op: 'and', v: [op(name, v), o] }) });
const command = {
  inc: (v) => op('inc', v), lt: (v) => op('lt', v), lte: (v) => op('lte', v), gt: (v) => op('gt', v), gte: (v) => op('gte', v),
  in: (v) => op('in', v), neq: (v) => op('neq', v), eq: (v) => op('eq', v), remove: () => op('remove'),
};
function matchVal(actual, cond) {
  if (cond && cond.__op) {
    switch (cond.__op) {
      case 'lt': return actual !== undefined && actual !== null && actual < cond.v;
      case 'lte': return actual !== undefined && actual !== null && actual <= cond.v;
      case 'gt': return actual !== undefined && actual !== null && actual > cond.v;
      case 'gte': return actual !== undefined && actual !== null && actual >= cond.v;
      case 'and': return cond.v.every((c) => matchVal(actual, c));
      case 'in': return cond.v.includes(actual);
      case 'neq': return actual !== cond.v;
      case 'eq': return actual === cond.v;
      default: throw new Error('fake-db: unsupported op ' + cond.__op);
    }
  }
  return JSON.stringify(actual) === JSON.stringify(cond);
}
const matches = (doc, where) => Object.keys(where || {}).every((k) => matchVal(getPath(doc, k), where[k]));

function applyUpdate(doc, data) {
  for (const [k, v] of Object.entries(data)) {
    if (v && v.__op === 'inc') setPath(doc, k, (getPath(doc, k) || 0) + v.v);
    else if (v && v.__op === 'remove') setPath(doc, k, undefined);
    else setPath(doc, k, clone(v));
  }
}
function checkNoOps(data) {
  Object.values(data).forEach((v) => {
    if (v && v.__op && v.__op !== 'inc' && v.__op !== 'remove') throw new Error('fake-db: command not allowed in data');
  });
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

class FakeDb {
  constructor() {
    this.cols = {};
    this.command = command;
    this._lock = Promise.resolve();
    this.stats = { reads: 0, queries: 0, txns: 0, aborted: 0 };
    this.faults = [];
    this.onQuery = null; // test hook: called with (collectionName) before each query runs
  }
  _col(name) {
    return (this.cols[name] = this.cols[name] || new Map());
  }
  /** test helpers */
  all(name) { return [...this._col(name).values()].map(clone); }
  get(name, id) { return clone(this._col(name).get(id)); }
  put(name, doc) { this._col(name).set(doc._id, clone(doc)); }
  size(name) { return this._col(name).size; }
  names() { return Object.keys(this.cols); }
  collection(name) {
    return new Coll(this, name, null);
  }
  _fault(opd) {
    for (const f of this.faults) {
      const e = f(opd);
      if (e) throw e;
    }
  }
  async runTransaction(fn) {
    const prev = this._lock;
    let release;
    this._lock = new Promise((r) => { release = r; });
    await prev;
    this.stats.txns++;
    const ops = []; // buffered writes in order: {name, kind, id, data}
    const txn = { ops };
    try {
      const t = { collection: (name) => new Coll(this, name, txn) };
      const result = await fn(t);
      this._commit(ops);
      return result;
    } catch (e) {
      this.stats.aborted++;
      throw e; // nothing was applied: rollback is "drop the buffer"
    } finally {
      release();
    }
  }
  _commit(ops) {
    // all-or-nothing: apply to a staged copy of the touched docs first
    const staged = new Map();
    const key = (n, id) => n + '\u0000' + id;
    const read = (n, id) => (staged.has(key(n, id)) ? staged.get(key(n, id)) : clone(this._col(n).get(id)));
    for (const o of ops) {
      let cur = read(o.name, o.id);
      if (o.kind === 'add') {
        if (cur !== undefined) throw dupError();
        cur = { ...clone(o.data), _id: o.id };
      } else if (o.kind === 'set') {
        cur = { ...clone(o.data), _id: o.id };
      } else if (o.kind === 'update') {
        if (cur === undefined) { staged.set(key(o.name, o.id), cur); continue; }
        applyUpdate(cur, o.data);
      } else if (o.kind === 'remove') {
        cur = undefined;
      }
      staged.set(key(o.name, o.id), cur);
    }
    staged.forEach((doc, k) => {
      const [n, id] = k.split('\u0000');
      if (doc === undefined) this._col(n).delete(id);
      else this._col(n).set(id, doc);
    });
  }
}

class Coll {
  constructor(db, name, txn) { this.db = db; this.name = name; this.txn = txn; this.map = db._col(name); }
  async add({ data }) {
    if (Array.isArray(data)) throw new Error('fake-db: batch add unsupported (mirrors server SDK usage)');
    const id = data._id || `auto${this.map.size + 1}_${Math.random().toString(36).slice(2, 10)}`;
    this.db._fault({ kind: 'add', name: this.name, id, txn: !!this.txn });
    if (this.txn) {
      const visible = this._visible(id);
      if (visible !== undefined) throw dupError();
      this.txn.ops.push({ name: this.name, kind: 'add', id, data });
      return { _id: id };
    }
    if (this.map.has(id)) throw dupError();
    this.map.set(id, clone({ ...data, _id: id }));
    return { _id: id };
  }
  /** document state as this handle sees it (transaction overlay applied) */
  _visible(id) {
    let cur = clone(this.map.get(id));
    if (!this.txn) return cur;
    for (const o of this.txn.ops) {
      if (o.name !== this.name || o.id !== id) continue;
      if (o.kind === 'add' || o.kind === 'set') cur = { ...clone(o.data), _id: id };
      else if (o.kind === 'update') { if (cur !== undefined) applyUpdate(cur, o.data); }
      else if (o.kind === 'remove') cur = undefined;
    }
    return cur;
  }
  doc(id) {
    const self = this;
    const db = this.db;
    const name = this.name;
    return {
      async get() {
        db.stats.reads++;
        const d = self._visible(id);
        if (d === undefined) throw notFound(id);
        return { data: d };
      },
      async set({ data }) {
        checkNoOps(data);
        db._fault({ kind: 'set', name, id, txn: !!self.txn });
        if (self.txn) self.txn.ops.push({ name, kind: 'set', id, data });
        else self.map.set(id, clone({ ...data, _id: id }));
        return { stats: { updated: 1 } };
      },
      async update({ data }) {
        db._fault({ kind: 'update', name, id, txn: !!self.txn });
        if (self.txn) {
          const exists = self._visible(id) !== undefined;
          self.txn.ops.push({ name, kind: 'update', id, data });
          return { stats: { updated: exists ? 1 : 0 } };
        }
        const d = self.map.get(id);
        if (!d) return { stats: { updated: 0 } };
        applyUpdate(d, data);
        return { stats: { updated: 1 } };
      },
      async remove() {
        db._fault({ kind: 'remove', name, id, txn: !!self.txn });
        if (self.txn) {
          self.txn.ops.push({ name, kind: 'remove', id });
          return { stats: { removed: 1 } };
        }
        return { stats: { removed: self.map.delete(id) ? 1 : 0 } };
      },
    };
  }
  where(w) {
    if (this.txn) throw new Error('fake-db: queries are not available inside a transaction');
    return new Query(this, w);
  }
  async count() { return new Query(this, {}).count(); }
}

class Query {
  constructor(coll, where) { this.coll = coll; this.w = where; this._order = null; this._skip = 0; this._limit = 100; this._field = null; }
  orderBy(f, dir) { this._order = [f, dir]; return this; }
  skip(n) { this._skip = n; return this; }
  limit(n) { this._limit = Math.min(n, 1000); return this; }
  field(f) { this._field = f; return this; }
  _rows() {
    const db = this.coll.db;
    if (db.onQuery) db.onQuery(this.coll.name);
    db.stats.queries++;
    const rows = [...this.coll.map.values()].filter((d) => matches(d, this.w));
    if (this._order) {
      const [f, dir] = this._order;
      rows.sort((a, b) => (getPath(a, f) < getPath(b, f) ? -1 : getPath(a, f) > getPath(b, f) ? 1 : 0) * (dir === 'desc' ? -1 : 1));
    }
    return rows;
  }
  async get() {
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
  async count() { return { total: this._rows().length }; }
  async remove() {
    const rows = this._rows().slice(0, 1000);
    for (const r of rows) this.coll.map.delete(r._id);
    return { stats: { removed: rows.length } };
  }
}

module.exports = { FakeDb, clone };
