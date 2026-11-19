const Ajv = require('ajv');
const addFormats = require('ajv-formats');


function createValidator(spec) {
  const ajv = new Ajv({ allErrors: true, strict: false, allowUnionTypes: true });
  addFormats(ajv);

  // Register OpenAPI component schemas as JSON Schema definitions.
  const components = spec.components?.schemas || {};
  const schemaRoot = {
    $id: 'http://local/openapi-schemas.json',
    $defs: components
  };
  ajv.addSchema(schemaRoot);

  function compile(schema) {
    if (!schema) return null;
    // Resolve local OpenAPI component references against the registered schema root.
    const rewritten = JSON.parse(JSON.stringify(schema));
    const rewriteRefs = (node) => {
      if (!node || typeof node !== 'object') return;
      if (typeof node.$ref === 'string' && node.$ref.startsWith('#/components/schemas/')) {
        const componentName = node.$ref.split('/').pop();
        node.$ref = `http://local/openapi-schemas.json#/$defs/${componentName}`;
      }
      for (const value of Object.values(node)) {
        if (Array.isArray(value)) value.forEach(rewriteRefs);
        else if (value && typeof value === 'object') rewriteRefs(value);
      }
    };
    rewriteRefs(rewritten);
    return ajv.compile(rewritten);
  }

  return { compile };
}


function formatValidationErrors(errors = []) {
  return errors.map((error) => ({
    field: error.instancePath || '/', 
    message: error.message || 'Invalid value'
  }));
}

module.exports = { createValidator, formatValidationErrors };
