/** In-memory, schema-agnostic database. Data is lost when the process restarts. */
class MemoryDatabase {
  constructor(seed = {}) {
    this.collections = new Map();
    this.nextIds = new Map();
    for (const [name, records] of Object.entries(seed)) {
      this.collections.set(name, records.map((record) => ({ ...record })));
      const highest = records.reduce((max, record) => Math.max(max, Number(record.id) || 0), 0);
      this.nextIds.set(name, highest + 1);
    }
  }

  ensureCollection(name) {
    if (!this.collections.has(name)) this.collections.set(name, []);
    if (!this.nextIds.has(name)) this.nextIds.set(name, 1);
    return this.collections.get(name);
  }

  getAll(name) { return this.ensureCollection(name).map((item) => ({ ...item })); }
  getById(name, id) { return this.ensureCollection(name).find((item) => String(item.id) === String(id)) || null; }

  create(name, input) {
    const collection = this.ensureCollection(name);
    const record = { ...input, id: this.nextIds.get(name) };
    this.nextIds.set(name, this.nextIds.get(name) + 1);
    collection.push(record);
    return { ...record };
  }

  replace(name, id, input) {
    const collection = this.ensureCollection(name);
    const index = collection.findIndex((item) => String(item.id) === String(id));
    if (index < 0) return null;
    const updated = { ...input, id: collection[index].id };
    collection[index] = updated;
    return { ...updated };
  }

  patch(name, id, input) {
    const collection = this.ensureCollection(name);
    const index = collection.findIndex((item) => String(item.id) === String(id));
    if (index < 0) return null;
    collection[index] = { ...collection[index], ...input, id: collection[index].id };
    return { ...collection[index] };
  }

  delete(name, id) {
    const collection = this.ensureCollection(name);
    const index = collection.findIndex((item) => String(item.id) === String(id));
    if (index < 0) return false;
    collection.splice(index, 1);
    return true;
  }

  reset(seed = {}) {
    this.collections.clear();
    this.nextIds.clear();
    for (const [name, records] of Object.entries(seed)) {
      this.collections.set(name, records.map((record) => ({ ...record })));
      const highest = records.reduce((max, record) => Math.max(max, Number(record.id) || 0), 0);
      this.nextIds.set(name, highest + 1);
    }
  }
}


const seedData = {
  users: [
    { id: 1, name: 'Alice Johnson', email: 'alice@example.com', role: 'admin' },
    { id: 2, name: 'Bob Smith', email: 'bob@example.com', role: 'user' }
  ],
  products: [
    { id: 1, name: 'Laptop', price: 899.99, inStock: true },
    { id: 2, name: 'Wireless Mouse', price: 24.99, inStock: true }
  ]
};

const database = new MemoryDatabase(seedData);
module.exports = { MemoryDatabase, database, seedData };
