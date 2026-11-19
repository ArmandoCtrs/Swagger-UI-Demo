const { formatValidationErrors } = require('./validator');
const { resolveQueryParameters, parseQuery, applyFilters } = require('./queryFilter');
const { createRelations, RelationError } = require('./relations');


const METHODS = new Set(['get', 'post', 'put', 'patch', 'delete']);


function toExpressPath(openApiPath) {
  return openApiPath.replace(/\{([^}]+)\}/g, ':$1');
}


function collectionNameFromPath(openApiPath) {
  // Use the first non-parameter segment (e.g. /users/{id} -> users).
  const segment = openApiPath.split('/').filter(Boolean).find((part) => !part.startsWith('{'));
  if (!segment) throw new Error(`Cannot infer collection name from path: ${openApiPath}`);
  return segment;
}


function registerApiRoutes(app, spec, database, validator) {
  let routeCount = 0;
  const paths = spec.paths || {};
  const relations = createRelations(spec, database, collectionNameFromPath);


  for (const [openApiPath, pathItem] of Object.entries(paths)) {
    for (const [method, operation] of Object.entries(pathItem)) {
      if (!METHODS.has(method.toLowerCase()) || !operation || typeof operation !== 'object') continue;

      const collectionName = collectionNameFromPath(openApiPath);
      const expressPath = toExpressPath(openApiPath);
      const hasId = openApiPath.includes('{id}') || openApiPath.includes('{') && openApiPath.split('/').filter(Boolean).length > 1;
      const requestSchema = operation.requestBody?.content?.['application/json']?.schema;
      const validateBody = requestSchema ? validator.compile(requestSchema) : null;
      const methodName = method.toLowerCase();
      const queryParameters = resolveQueryParameters(spec, pathItem, operation);

      app[methodName](expressPath, (req, res) => {
        const id = req.params.id;
        const body = req.body || {};
        if (validateBody && ['post', 'put', 'patch'].includes(methodName)) {
          const valid = validateBody(body);
          if (!valid) {
            return res.status(400).json({
              error: 'Request validation failed',
              details: formatValidationErrors(validateBody.errors)
            });
          }
        }

        try {
          if (methodName === 'get') {
            if (id !== undefined) {
              const record = database.getById(collectionName, id);
              return record ? res.json(relations.hydrate(collectionName, record)) : res.status(404).json({ error: `${collectionName} record not found` });
            }

            // Collection request: filter by any query parameters declared in the spec.
            const { filters, errors } = parseQuery(req.query, queryParameters);
            if (errors.length > 0) {
              return res.status(400).json({ error: 'Invalid query parameters', details: errors });
            }
            const records = database.getAll(collectionName).map((record) => relations.hydrate(collectionName, record));
            return res.json(applyFilters(records, filters));
          }

          if (methodName === 'post') {
            const created = database.create(collectionName, relations.prepareForStorage(requestSchema, body));
            return res.status(201).json(relations.hydrate(collectionName, created));
          }

          if (methodName === 'put') {
            if (id === undefined) return res.status(400).json({ error: 'PUT requires an ID path parameter' });
            const updated = database.replace(collectionName, id, relations.prepareForStorage(requestSchema, body));
            return updated ? res.json(relations.hydrate(collectionName, updated)) : res.status(404).json({ error: `${collectionName} record not found` });
          }

          if (methodName === 'patch') {
            if (id === undefined) return res.status(400).json({ error: 'PATCH requires an ID path parameter' });
            const updated = database.patch(collectionName, id, relations.prepareForStorage(requestSchema, body));
            return updated ? res.json(relations.hydrate(collectionName, updated)) : res.status(404).json({ error: `${collectionName} record not found` });
          }

          if (methodName === 'delete') {
            if (id === undefined) return res.status(400).json({ error: 'DELETE requires an ID path parameter' });
            const deleted = database.delete(collectionName, id);
            return deleted ? res.status(204).send() : res.status(404).json({ error: `${collectionName} record not found` });
          }
        } catch (error) {
          if (error instanceof RelationError) {
            return res.status(400).json({ error: 'Invalid reference', details: [{ message: error.message }] });
          }
          console.error('API operation error:', error);
          return res.status(500).json({ error: 'Internal server error' });
        }
      });
      routeCount += 1;
      console.log(`Registered ${method.toUpperCase()} ${expressPath} -> ${collectionName}`);
    }
  }
  return routeCount;
}

module.exports = { registerApiRoutes, toExpressPath, collectionNameFromPath };
