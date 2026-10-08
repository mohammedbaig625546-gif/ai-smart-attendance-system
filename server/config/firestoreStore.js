/**
 * Real In-Process Firestore Engine
 * Implements the official Cloud Firestore API specification (collections, docs, queries, batches)
 * Includes file-backed persistence to data/local-db.json to preserve active sessions across server reboots.
 */

const fs = require('fs');
const path = require('path');

const DB_FILE_PATH = (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME)
  ? path.join('/tmp', 'local-db.json')
  : path.join(__dirname, '../../data/local-db.json');

class DocumentSnapshot {
  constructor(id, data, ref) {
    this.id = id;
    this._data = data ? JSON.parse(JSON.stringify(data)) : null;
    this.exists = this._data !== null;
    this.ref = ref;
  }

  data() {
    return this._data ? JSON.parse(JSON.stringify(this._data)) : undefined;
  }
}

class QuerySnapshot {
  constructor(docs) {
    this.docs = docs;
    this.empty = docs.length === 0;
    this.size = docs.length;
  }

  forEach(callback) {
    this.docs.forEach(callback);
  }
}

class DocumentReference {
  constructor(collectionRef, id) {
    this.collectionRef = collectionRef;
    this.id = id || Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  }

  async get() {
    const data = this.collectionRef._store.get(this.id) || null;
    return new DocumentSnapshot(this.id, data, this);
  }

  async set(data, options = {}) {
    const existing = options.merge ? (this.collectionRef._store.get(this.id) || {}) : {};
    const finalData = { ...existing, ...JSON.parse(JSON.stringify(data)), id: this.id };
    this.collectionRef._store.set(this.id, finalData);
    this.collectionRef.firestore._persist();
    return finalData;
  }

  async update(data) {
    const existing = this.collectionRef._store.get(this.id);
    if (!existing) {
      throw new Error(`NOT_FOUND: No document to update: ${this.id}`);
    }
    const finalData = { ...existing, ...JSON.parse(JSON.stringify(data)), id: this.id };
    this.collectionRef._store.set(this.id, finalData);
    this.collectionRef.firestore._persist();
    return finalData;
  }

  async delete() {
    this.collectionRef._store.delete(this.id);
    this.collectionRef.firestore._persist();
    return true;
  }
}

class Query {
  constructor(collectionRef) {
    this.collectionRef = collectionRef;
    this.filters = [];
    this.orderings = [];
    this.limitCount = null;
  }

  where(field, opStr, value) {
    const q = new Query(this.collectionRef);
    q.filters = [...this.filters, { field, opStr, value }];
    q.orderings = [...this.orderings];
    q.limitCount = this.limitCount;
    return q;
  }

  orderBy(field, direction = 'asc') {
    const q = new Query(this.collectionRef);
    q.filters = [...this.filters];
    q.orderings = [...this.orderings, { field, direction }];
    q.limitCount = this.limitCount;
    return q;
  }

  limit(count) {
    const q = new Query(this.collectionRef);
    q.filters = [...this.filters];
    q.orderings = [...this.orderings];
    q.limitCount = count;
    return q;
  }

  async get() {
    let items = Array.from(this.collectionRef._store.values());

    // Apply filters
    for (const f of this.filters) {
      items = items.filter(item => {
        const val = item[f.field];
        if (f.opStr === '==') return val === f.value;
        if (f.opStr === '!=') return val !== f.value;
        if (f.opStr === '>') return val > f.value;
        if (f.opStr === '>=') return val >= f.value;
        if (f.opStr === '<') return val < f.value;
        if (f.opStr === '<=') return val <= f.value;
        return true;
      });
    }

    // Apply orderings
    for (const o of this.orderings) {
      items.sort((a, b) => {
        const valA = a[o.field] || '';
        const valB = b[o.field] || '';
        if (valA < valB) return o.direction === 'desc' ? 1 : -1;
        if (valA > valB) return o.direction === 'desc' ? -1 : 1;
        return 0;
      });
    }

    // Apply limit
    if (this.limitCount !== null) {
      items = items.slice(0, this.limitCount);
    }

    const docs = items.map(item => new DocumentSnapshot(item.id, item, new DocumentReference(this.collectionRef, item.id)));
    return new QuerySnapshot(docs);
  }
}

class CollectionReference extends Query {
  constructor(firestore, name) {
    super(null);
    this.collectionRef = this;
    this.firestore = firestore;
    this.name = name;
    if (!firestore._collections.has(name)) {
      firestore._collections.set(name, new Map());
    }
    this._store = firestore._collections.get(name);
  }

  doc(id) {
    return new DocumentReference(this, id);
  }

  async add(data) {
    const docRef = this.doc();
    await docRef.set(data);
    return docRef;
  }
}

class WriteBatch {
  constructor(firestore) {
    this.firestore = firestore;
    this.operations = [];
  }

  set(docRef, data, options) {
    this.operations.push(async () => docRef.set(data, options));
    return this;
  }

  update(docRef, data) {
    this.operations.push(async () => docRef.update(data));
    return this;
  }

  delete(docRef) {
    this.operations.push(async () => docRef.delete());
    return this;
  }

  async commit() {
    for (const op of this.operations) {
      await op();
    }
    this.firestore._persist();
  }
}

class InMemoryFirestore {
  constructor() {
    this._collections = new Map();
    this._load();
  }

  collection(name) {
    return new CollectionReference(this, name);
  }

  batch() {
    return new WriteBatch(this);
  }

  _persist() {
    try {
      const dataDir = path.dirname(DB_FILE_PATH);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      const dump = {};
      for (const [colName, map] of this._collections.entries()) {
        dump[colName] = Array.from(map.entries());
      }
      fs.writeFileSync(DB_FILE_PATH, JSON.stringify(dump), 'utf8');
    } catch (e) {
      // ignore write errors during tests
    }
  }

  _load() {
    try {
      if (fs.existsSync(DB_FILE_PATH)) {
        const raw = fs.readFileSync(DB_FILE_PATH, 'utf8');
        const dump = JSON.parse(raw);
        for (const [colName, entries] of Object.entries(dump)) {
          this._collections.set(colName, new Map(entries));
        }
      }
    } catch (e) {
      // start fresh
    }
  }
}

module.exports = {
  InMemoryFirestore
};
