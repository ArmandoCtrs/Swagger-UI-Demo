const { formatValidationErrors } = require('./validator');


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


  for (const [openApiPath, pathItem] of Object.entries(paths)) {
    for (const [method, operation] of Object.entries(pathItem)) {
      if (!METHODS.has(method.toLowerCase()) || !operation || typeof operation !== 'object') continue;

      const collectionName = collectionNameFromPath(openApiPath);
      const expressPath = toExpressPath(openApiPath);
      const hasId = openApiPath.includes('{id}') || openApiPath.includes('{') && openApiPath.split('/').filter(Boolean).length > 1;
      const requestSchema = operation.requestBody?.content?.['application/json']?.schema;
      const validateBody = requestSchema ? validator.compile(requestSchema) : null;
      const methodName = method.toLowerCase();

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
              return record ? res.json(record) : res.status(404).json({ error: `${collectionName} record not found` });
            }
            return res.json(database.getAll(collectionName));
          }

          if (methodName === 'post') {
            const created = database.create(collectionName, body);
            return res.status(201).json(created);
          }

          if (methodName === 'put') {
            if (id === undefined) return res.status(400).json({ error: 'PUT requires an ID path parameter' });
            const updated = database.replace(collectionName, id, body);
            return updated ? res.json(updated) : res.status(404).json({ error: `${collectionName} record not found` });
          }

          if (methodName === 'patch') {
            if (id === undefined) return res.status(400).json({ error: 'PATCH requires an ID path parameter' });
            const updated = database.patch(collectionName, id, body);
            return updated ? res.json(updated) : res.status(404).json({ error: `${collectionName} record not found` });
          }

          if (methodName === 'delete') {
            if (id === undefined) return res.status(400).json({ error: 'DELETE requires an ID path parameter' });
            const deleted = database.delete(collectionName, id);
            return deleted ? res.status(204).send() : res.status(404).json({ error: `${collectionName} record not found` });
          }
        } catch (error) {
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
