/**
 * Query-string filtering for GET collection endpoints.
 *
 * Filters are driven by the specification: only parameters declared with
 * `in: query` on the operation (or on its path item) are used. Undeclared
 * query parameters are ignored.
 */

function resolveRef(spec, node) {
  if (!node || typeof node.$ref !== 'string') return node;
  const prefix = '#/components/parameters/';
  if (!node.$ref.startsWith(prefix)) return node;
  return spec.components?.parameters?.[node.$ref.slice(prefix.length)] || null;
}

/** Collect the query parameters for an operation (path-level + operation-level, $refs resolved). */
function resolveQueryParameters(spec, pathItem, operation) {
  const byKey = new Map();
  const add = (list) => {
    for (const raw of list || []) {
      const param = resolveRef(spec, raw);
      if (param && param.in === 'query' && param.name) byKey.set(param.name, param);
    }
  };
  add(pathItem.parameters);
  add(operation.parameters); // operation-level overrides path-level
  return [...byKey.values()];
}

/** Convert one raw query value to the type declared in the parameter's schema. */
function coerce(raw, schema = {}) {
  switch (schema.type) {
    case 'integer': {
      if (!/^-?\d+$/.test(raw)) throw new Error('must be an integer');
      return Number(raw);
    }
    case 'number': {
      if (raw.trim() === '' || Number.isNaN(Number(raw))) throw new Error('must be a number');
      return Number(raw);
    }
    case 'boolean': {
      const lowered = raw.toLowerCase();
      if (lowered !== 'true' && lowered !== 'false') throw new Error('must be true or false');
      return lowered === 'true';
    }
    default:
      return raw;
  }
}

/**
 * Turn req.query into a list of filters, validating against the declared parameters.
 * Returns { filters, errors }.
 */
function parseQuery(query, parameters) {
  const filters = [];
  const errors = [];

  for (const param of parameters) {
    const supplied = query[param.name];
    const values = (Array.isArray(supplied) ? supplied : [supplied])
      .filter((value) => value !== undefined && value !== '');

    if (values.length === 0) {
      if (param.required) errors.push({ parameter: param.name, message: 'is required' });
      continue;
    }

    try {
      const coerced = values.map((value) => {
        if (typeof value !== 'string') throw new Error('must be a simple value');
        return coerce(value, param.schema);
      });
      filters.push({ field: param.name, values: coerced });
    } catch (error) {
      errors.push({ parameter: param.name, message: error.message });
    }
  }

  return { filters, errors };
}

function matches(fieldValue, wanted) {
  if (fieldValue === undefined || fieldValue === null) return false;
  if (typeof wanted === 'string') return String(fieldValue).toLowerCase() === wanted.toLowerCase();
  return fieldValue === wanted;
}

/** Keep records that satisfy every filter. Repeated values for one parameter match if any is equal. */
function applyFilters(records, filters) {
  if (filters.length === 0) return records;
  return records.filter((record) =>
    filters.every(({ field, values }) => values.some((wanted) => matches(record[field], wanted)))
  );
}

module.exports = { resolveQueryParameters, parseQuery, applyFilters };
