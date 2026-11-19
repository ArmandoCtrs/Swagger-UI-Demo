/**
 * Relation handling driven entirely by the OpenAPI specification.
 *
 * A component schema is "collection-backed" when some top-level path (e.g. /classes)
 * accepts it as a JSON request body. Any property elsewhere in the spec that
 * $refs such a schema (directly, or as the items of an array) is treated as a
 * relation to that collection instead of as embedded data:
 *
 *   WRITE (POST/PUT/PATCH):  each nested object is linked to an existing record
 *                            or created, and only its ID is stored.
 *   READ  (GET and responses): stored IDs are expanded back into full objects.
 *
 * Nothing here is specific to students or classes. Adding a new relation only
 * requires a $ref in the YAML.
 */

const REF_PREFIX = '#/components/schemas/';
const WRITE_METHODS = ['post', 'put', 'patch'];
const GONE = Symbol('gone'); // marks a reference whose record no longer exists

class RelationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RelationError';
  }
}

function refName(node) {
  return node && typeof node.$ref === 'string' && node.$ref.startsWith(REF_PREFIX)
    ? node.$ref.slice(REF_PREFIX.length)
    : null;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// Swagger UI pre-fills integer fields with 0, so 0 (like null/undefined) means "no ID supplied".
function isUnset(id) {
  return id === undefined || id === null || id === 0;
}

function sameValue(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function createRelations(spec, database, collectionNameFromPath) {
  const schemas = spec.components?.schemas || {};
  const schemaToCollection = new Map(); // 'Classes'  -> 'classes'
  const collectionToSchema = new Map(); // 'classes'  -> 'Classes'

  // Discover collection-backed schemas from top-level paths such as /classes.
  for (const [openApiPath, pathItem] of Object.entries(spec.paths || {})) {
    const literalSegments = openApiPath.split('/').filter((part) => part && !part.startsWith('{'));
    if (literalSegments.length !== 1) continue; // skip nested paths like /students/{id}/classes

    for (const method of WRITE_METHODS) {
      const name = refName(pathItem[method]?.requestBody?.content?.['application/json']?.schema);
      if (!name) continue;
      const collection = collectionNameFromPath(openApiPath);
      if (!schemaToCollection.has(name)) schemaToCollection.set(name, collection);
      if (!collectionToSchema.has(collection)) collectionToSchema.set(collection, name);
    }
  }

  // ---------------------------------------------------------------- write side

  function storeProperties(node, obj, ctx) {
    const out = { ...obj };
    for (const [key, propSchema] of Object.entries(node.properties || {})) {
      if (key in obj) out[key] = toStored(propSchema, obj[key], ctx);
    }
    return out;
  }

  function toStored(node, value, ctx) {
    if (!node || value === undefined || value === null) return value;

    const name = refName(node);
    if (name) {
      if (schemaToCollection.has(name)) return linkOrCreate(name, value, ctx);
      return toStored(schemas[name], value, ctx); // plain embedded schema: look inside it
    }
    if (Array.isArray(value) && node.items) {
      const ids = value.map((item) => toStored(node.items, item, ctx));
      // Drop duplicates that resolved to the same record (e.g. the same class listed twice).
      return ids.every((v) => typeof v === 'number') ? [...new Set(ids)] : ids;
    }
    if (isPlainObject(value) && node.properties) return storeProperties(node, value, ctx);
    return value;
  }

  /** Resolve one nested object to the ID of an existing record, creating the record if needed. */
  function linkOrCreate(schemaName, value, ctx) {
    if (!isPlainObject(value)) return value; // request validation reports wrong types
    const collection = schemaToCollection.get(schemaName);
    const { id, ...fields } = value;

    // 1. An ID was supplied: it must point at an existing record.
    if (!isUnset(id)) {
      const existing = database.getById(collection, id);
      if (!existing) throw new RelationError(`${schemaName} with id ${id} does not exist`);
      return existing.id;
    }

    // 2. No ID: resolve the object's own relations first, then look for an identical record.
    const resolved = storeProperties(schemas[schemaName] || {}, fields, ctx);
    const keys = Object.keys(resolved);
    if (keys.length === 0) {
      throw new RelationError(`${schemaName} needs an id or at least one field to identify it`);
    }
    const match = database
      .getAll(collection)
      .find((record) => keys.every((key) => sameValue(record[key], resolved[key])));
    if (match) return match.id;

    // 3. Nothing matches: create it so it gets a real, unique ID.
    const created = database.create(collection, resolved);
    ctx.created.push({ collection, id: created.id });
    return created.id;
  }

  /**
   * Convert a request body into its stored form (nested objects replaced by IDs).
   * Records created along the way are rolled back if any later item fails.
   */
  function prepareForStorage(schemaNode, body) {
    if (!schemaNode || !isPlainObject(body)) return body;
    const rootName = refName(schemaNode);
    const rootSchema = rootName ? schemas[rootName] : schemaNode; // the body itself is not "linked"
    const ctx = { created: [] };
    try {
      return toStored(rootSchema, body, ctx);
    } catch (error) {
      for (const { collection, id } of ctx.created.reverse()) database.delete(collection, id);
      throw error;
    }
  }

  // ----------------------------------------------------------------- read side

  function fromStored(node, value, seen) {
    if (!node || value === undefined || value === null) return value;

    const name = refName(node);
    if (name) {
      if (schemaToCollection.has(name)) return expand(name, value, seen);
      return fromStored(schemas[name], value, seen);
    }
    if (Array.isArray(value) && node.items) {
      return value.map((item) => fromStored(node.items, item, seen)).filter((item) => item !== GONE);
    }
    if (isPlainObject(value) && node.properties) {
      const out = { ...value };
      for (const [key, propSchema] of Object.entries(node.properties)) {
        if (!(key in value)) continue;
        const expanded = fromStored(propSchema, value[key], seen);
        out[key] = expanded === GONE ? null : expanded;
      }
      return out;
    }
    return value;
  }

  function expand(schemaName, value, seen) {
    if (isPlainObject(value)) return value; // already embedded (legacy data)
    const collection = schemaToCollection.get(schemaName);
    const key = `${collection}:${value}`;
    if (seen.has(key)) return GONE; // circular relation: stop here
    const record = database.getById(collection, value);
    if (!record) return GONE; // the referenced record was deleted
    return fromStored(schemas[schemaName], { ...record }, new Set(seen).add(key));
  }

  /** Expand stored IDs in a record of the given collection into full nested objects. */
  function hydrate(collection, record) {
    const schemaName = collectionToSchema.get(collection);
    if (!schemaName || !record) return record;
    return fromStored(schemas[schemaName], { ...record }, new Set([`${collection}:${record.id}`]));
  }

  return { prepareForStorage, hydrate, schemaToCollection };
}

module.exports = { createRelations, RelationError };
