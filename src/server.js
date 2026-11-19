const express = require('express');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const swaggerUi = require('swagger-ui-express');
const $RefParser = require('@apidevtools/json-schema-ref-parser');
const { database, seedData } = require('./database');
const { createValidator } = require('./validator');
const { registerApiRoutes } = require('./apiEngine');

const PORT = process.env.PORT || 3000;
const SPEC_PATH = path.resolve(__dirname, '../specs/openapi.yaml');

function loadSpec() {
  const fileContents = fs.readFileSync(SPEC_PATH, 'utf8');
  const spec = yaml.load(fileContents);
  if (!spec || !spec.openapi || !spec.paths) {
    throw new Error('The YAML file must contain an OpenAPI version and paths section.');
  }
  return spec;
}

async function start() {
  const spec = loadSpec();

  // dereference() modifies the object it's given, so work on a copy.
  // Swagger UI and your routes keep the original spec with its $refs.
  const dereferencedSpec = await $RefParser.dereference(
    JSON.parse(JSON.stringify(spec))
  );

  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.get('/', (req, res) => res.redirect('/docs'));
  app.get('/openapi.yaml', (req, res) => res.sendFile(SPEC_PATH));
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(spec, { explorer: true }));
  app.get('/health', (req, res) => res.json({ status: 'ok', message: 'OpenAPI-driven API server is running' }));

  // The validator gets the dereferenced spec, so Ajv never has to resolve a $ref
  const validator = createValidator(dereferencedSpec);
  const routeCount = registerApiRoutes(app, spec, database, validator);

  // Optional demo-only reset route restores initial seed data.
  app.post('/__demo/reset', (req, res) => {
    database.reset(seedData);
    res.json({ message: 'Demo database reset to seed data.' });
  });

  // JSON 404 for unmatched API routes.
  app.use('/api', (req, res) => res.status(404).json({ error: 'Endpoint not defined in OpenAPI specification' }));

  app.listen(PORT, () => {
    console.log(`\nOpenAPI dynamic server started on http://localhost:${PORT}`);
    console.log(`Swagger UI: http://localhost:${PORT}/docs`);
    console.log(`Registered ${routeCount} API routes from ${SPEC_PATH}\n`);
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});