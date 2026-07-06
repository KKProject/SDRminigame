function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function readPath(value, path) {
  const parts = String(path || '').split('.');
  let current = value;
  for (const part of parts) {
    if (Array.isArray(current)) current = current.map((item) => item && item[part]);
    else current = current && current[part];
  }
  return current;
}

function valueMatches(actual, expected) {
  if (Array.isArray(actual)) return actual.some((item) => valueMatches(item, expected));
  return actual === expected;
}

function matchesQuery(doc, query = {}) {
  return Object.keys(query).every((key) => valueMatches(readPath(doc, key), query[key]));
}

class MemoryDocumentRef {
  constructor(collection, id) {
    this.collection = collection;
    this.id = id;
  }

  async get() {
    if (!this.collection.docs.has(this.id)) throw new Error('DOCUMENT_NOT_FOUND');
    return { data: clone(Object.assign({ _id: this.id }, this.collection.docs.get(this.id))) };
  }

  async set({ data }) {
    const next = clone(data || {});
    delete next._id;
    this.collection.docs.set(this.id, next);
    await this.collection.persist();
    return { updated: 1 };
  }

  async update({ data }) {
    const current = this.collection.docs.get(this.id) || {};
    this.collection.docs.set(this.id, Object.assign({}, current, clone(data || {})));
    await this.collection.persist();
    return { updated: 1 };
  }

  async remove() {
    this.collection.docs.delete(this.id);
    await this.collection.persist();
    return { deleted: 1 };
  }
}

class MemoryQuery {
  constructor(collection, query = {}) {
    this.collection = collection;
    this.query = query;
    this.sortField = '';
    this.sortDirection = 'asc';
    this.max = 0;
  }

  where(query) {
    this.query = query || {};
    return this;
  }

  orderBy(field, direction) {
    this.sortField = field;
    this.sortDirection = direction === 'desc' ? 'desc' : 'asc';
    return this;
  }

  limit(max) {
    this.max = Number(max) || 0;
    return this;
  }

  async get() {
    let data = Array.from(this.collection.docs.entries())
      .map(([id, doc]) => clone(Object.assign({ _id: id }, doc)))
      .filter((doc) => matchesQuery(doc, this.query));
    if (this.sortField) {
      const direction = this.sortDirection === 'desc' ? -1 : 1;
      data = data.sort((a, b) => {
        const av = readPath(a, this.sortField) || 0;
        const bv = readPath(b, this.sortField) || 0;
        return av === bv ? 0 : (av > bv ? direction : -direction);
      });
    }
    if (this.max > 0) data = data.slice(0, this.max);
    return { data };
  }
}

class MemoryCollection {
  constructor(name, owner = null) {
    this.name = name;
    this.owner = owner;
    this.docs = new Map();
  }

  doc(id) {
    return new MemoryDocumentRef(this, String(id));
  }

  where(query) {
    return new MemoryQuery(this, query);
  }

  limit(max) {
    return new MemoryQuery(this).limit(max);
  }

  async countDocuments(query = {}) {
    const snap = await new MemoryQuery(this, query).get();
    return snap.data.length;
  }

  async deleteMany(query = {}) {
    const ids = [];
    this.docs.forEach((doc, id) => {
      if (matchesQuery(Object.assign({ _id: id }, doc), query)) ids.push(id);
    });
    ids.forEach((id) => this.docs.delete(id));
    await this.persist();
    return { deletedCount: ids.length };
  }

  async persist() {
    if (this.owner && this.owner.persist) await this.owner.persist();
  }
}

class MemoryDocumentDatabase {
  constructor() {
    this.collections = new Map();
    this.command = {};
  }

  collection(name) {
    const key = String(name);
    if (!this.collections.has(key)) this.collections.set(key, new MemoryCollection(key, this));
    return this.collections.get(key);
  }

  async createCollection(name) {
    this.collection(name);
    return { ok: true };
  }

  async persist() {}
}

class FileDocumentDatabase extends MemoryDocumentDatabase {
  constructor(filePath) {
    super();
    this.filePath = filePath;
  }

  static async open(filePath) {
    const db = new FileDocumentDatabase(filePath);
    const fs = require('fs/promises');
    try {
      const raw = await fs.readFile(filePath, 'utf8');
      const data = JSON.parse(raw || '{}');
      Object.keys(data.collections || {}).forEach((name) => {
        const collection = db.collection(name);
        Object.entries(data.collections[name] || {}).forEach(([id, doc]) => {
          collection.docs.set(id, clone(doc));
        });
      });
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
    return db;
  }

  async persist() {
    if (!this.filePath) return;
    const fs = require('fs/promises');
    const path = require('path');
    const collections = {};
    this.collections.forEach((collection, name) => {
      collections[name] = {};
      collection.docs.forEach((doc, id) => {
        collections[name][id] = clone(doc);
      });
    });
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const tempPath = `${this.filePath}.tmp`;
    await fs.writeFile(tempPath, JSON.stringify({ collections }, null, 2));
    await fs.rename(tempPath, this.filePath);
  }
}

class MongoDocumentRef {
  constructor(collection, id) {
    this.collection = collection;
    this.id = id;
  }

  async get() {
    const data = await this.collection.mongo.findOne({ _id: this.id });
    if (!data) throw new Error('DOCUMENT_NOT_FOUND');
    return { data: clone(data) };
  }

  async set({ data }) {
    const next = clone(data || {});
    delete next._id;
    await this.collection.mongo.replaceOne({ _id: this.id }, Object.assign({ _id: this.id }, next), { upsert: true });
    return { updated: 1 };
  }

  async update({ data }) {
    await this.collection.mongo.updateOne({ _id: this.id }, { $set: clone(data || {}) }, { upsert: true });
    return { updated: 1 };
  }

  async remove() {
    await this.collection.mongo.deleteOne({ _id: this.id });
    return { deleted: 1 };
  }
}

class MongoQuery {
  constructor(collection, query = {}) {
    this.collection = collection;
    this.query = query;
    this.sortSpec = null;
    this.max = 0;
  }

  where(query) {
    this.query = query || {};
    return this;
  }

  orderBy(field, direction) {
    this.sortSpec = { [field]: direction === 'desc' ? -1 : 1 };
    return this;
  }

  limit(max) {
    this.max = Number(max) || 0;
    return this;
  }

  async get() {
    let cursor = this.collection.mongo.find(this.query || {});
    if (this.sortSpec) cursor = cursor.sort(this.sortSpec);
    if (this.max > 0) cursor = cursor.limit(this.max);
    return { data: await cursor.toArray() };
  }
}

class MongoCollection {
  constructor(mongo) {
    this.mongo = mongo;
  }

  doc(id) {
    return new MongoDocumentRef(this, String(id));
  }

  where(query) {
    return new MongoQuery(this, query);
  }

  limit(max) {
    return new MongoQuery(this).limit(max);
  }

  async countDocuments(query = {}) {
    return this.mongo.countDocuments(query || {});
  }

  async deleteMany(query = {}) {
    const res = await this.mongo.deleteMany(query || {});
    return { deletedCount: res.deletedCount || 0 };
  }
}

class MongoDocumentDatabase {
  constructor(database) {
    this.database = database;
    this.command = {};
  }

  collection(name) {
    return new MongoCollection(this.database.collection(name));
  }

  async createCollection(name) {
    const existing = await this.database.listCollections({ name }).toArray();
    if (!existing.length) await this.database.createCollection(name);
    return { ok: true };
  }
}

async function createDatabase(config = {}) {
  const driver = String(config.databaseDriver || 'mongodb').trim().toLowerCase();
  if (driver === 'memory') return new MemoryDocumentDatabase();
  if (driver === 'file') {
    if (!config.fileDbPath) {
      const error = new Error('FILE_DB_PATH_REQUIRED');
      error.code = 'FILE_DB_PATH_REQUIRED';
      throw error;
    }
    return FileDocumentDatabase.open(config.fileDbPath);
  }
  if (driver !== 'mongodb') {
    const error = new Error('DATABASE_DRIVER_UNSUPPORTED');
    error.code = 'DATABASE_DRIVER_UNSUPPORTED';
    throw error;
  }
  if (!config.mongodbUri) {
    const error = new Error('MONGODB_URI_REQUIRED');
    error.code = 'MONGODB_URI_REQUIRED';
    throw error;
  }
  const { MongoClient } = require('mongodb');
  const client = new MongoClient(config.mongodbUri);
  await client.connect();
  const db = new MongoDocumentDatabase(client.db(config.mongodbDb || 'huapai'));
  db.client = client;
  return db;
}

module.exports = {
  FileDocumentDatabase,
  MemoryDocumentDatabase,
  MongoDocumentDatabase,
  createDatabase,
  matchesQuery,
};
