'use strict';
// In-memory stand-in for the cloud database as seen from a cloud function (wx-server-sdk).
// Models the behaviours our code relies on: duplicate _id on add, doc.get throwing when missing,
// the 100-row default / 1000-row max query limits, command.inc/lt/in..., dotted-path updates,
// and runTransaction with rollback (serialised; real DBs use snapshot isolation).

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

const op = (name, v) => ({ __op: name, v });
const command = {
  inc: (v) => op('inc', v), lt: (v) => op('lt', v), lte: (v) => op('lte', v),
  gt: (v) => op('gt', v), gte: (v) => op('gte', v), in: (v) => op('in', v), neq: (v) => op('neq', v), eq: (v) => op('eq', v),
};
function matchVal(actual, cond) {
  if (cond && cond.__op) {
    switch (cond.__op) {
      case 'lt': return actual !== undefined && actual < cond.v;
      case 'lte': return actual !== undefined && actual <= cond.v;
      case 'gt': return actual !== undefined && actual > cond.v;
      case 'gte': return actual !== undefined && actual >= cond.v;
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
    else setPath(doc, k, clone(v));
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

class FakeDb {
  constructor() {
    this.cols = {};
    this.command = command;
    this._lock = Promise.resolve();
    this.stats = { reads: 0, byCol: {} };
  }
  _read(name, n) {
    this.stats.reads += n;
    this.stats.byCol[name] = (this.stats.byCol[name] || 0) + n;
  }
  _col(name) { return (this.cols[name] = this.cols[name] || new Map()); }
  /** test helpers */
  all(name) { return [...this._col(name).values()].map(clone); }
  put(name, doc) { this._col(name).set(doc._id, clone(doc)); }
  collection(name) { return new Coll(this, name, this._col(name)); }
  async runTransaction(fn) {
    const prev = this._lock;
    let release;
    this._lock = new Promise((r) => { release = r; });
    await prev;
    const snapshot = Object.fromEntries(Object.entries(this.cols).map(([n, m]) => [n, new Map([...m].map(([k, v]) => [k, clone(v)]))]));
    try {
      const t = { collection: (name) => new Coll(this, name, this._col(name), true) };
      return await fn(t);
    } catch (e) {
      this.cols = snapshot; // rollback
      throw e;
    } finally {
      release();
    }
  }
}

class Coll {
  constructor(db, name, map, inTxn) { this.db = db; this.name = name; this.map = map; this.inTxn = inTxn; }
  async add({ data }) {
    if (Array.isArray(data)) throw new Error('fake-db: batch add unsupported (mirrors server SDK usage)');
    const id = data._id || `auto${this.map.size + 1}_${Math.random().toString(36).slice(2, 8)}`;
    if (this.map.has(id)) throw dupError();
    this.map.set(id, clone({ ...data, _id: id }));
    return { _id: id };
  }
  doc(id) {
    const self = this;
    return {
      async get() {
        const d = self.map.get(id);
        self.db._read(self.name, d ? 1 : 0);
        if (!d) throw notFound(id);
        return { data: clone(d) };
      },
      async set({ data }) { self.map.set(id, clone({ ...data, _id: id })); return { stats: { updated: 1 } }; },
      async update({ data }) {
        const d = self.map.get(id);
        if (!d) return { stats: { updated: 0 } };
        applyUpdate(d, data);
        return { stats: { updated: 1 } };
      },
      async remove() { return { stats: { removed: self.map.delete(id) ? 1 : 0 } }; },
    };
  }
  where(w) { return new Query(this, w); }
  async count() { return new Query(this, {}).count(); }
}

class Query {
  constructor(coll, where) { this.coll = coll; this.w = where; this._order = null; this._skip = 0; this._limit = 100; this._field = null; }
  orderBy(f, dir) { this._order = [f, dir]; return this; }
  skip(n) { this._skip = n; return this; }
  limit(n) { this._limit = Math.min(n, 1000); return this; }
  field(f) { this._field = f; return this; }
  _rows() {
    let rows = [...this.coll.map.values()].filter((d) => matches(d, this.w));
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
    this.coll.db._read(this.coll.name, rows.length);
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
