# OpenAPI Dynamic Node.js Server

A generic CRUD API server driven by `specs/openapi.yaml`, using an in-memory database.

## Requirements
- Node.js 18+ (recommended)
- npm

## Install and run
```bash
npm install
npm start
```
Then visit:
- Swagger UI: http://localhost:3000/docs
- Health check: http://localhost:3000/health
- OpenAPI YAML: http://localhost:3000/openapi.yaml

## API endpoints generated from YAML
Users and products support GET collection, POST collection, GET by ID, PUT by ID, PATCH by ID, and DELETE by ID. The engine registers operations that exist in the specification.


## Example requests
Create a user:
```bash
curl -X POST http://localhost:3000/users -H "Content-Type: application/json" -d '{"name":"Charlie","email":"charlie@example.com","role":"user"}'
```
Get users:
```bash
curl http://localhost:3000/users
```
Get user 1:
```bash
curl http://localhost:3000/users/1
```
Reset sample data:
```bash
curl -X POST http://localhost:3000/__demo/reset
```

## Filtering GET collection requests
Any parameter declared with `in: query` on a GET collection operation in `specs/openapi.yaml` becomes a filter on that collection. For example, `GET /users` declares `name`, `email` and `role`:
```bash
curl "http://localhost:3000/users?role=user"
curl "http://localhost:3000/users?role=user&name=bob smith"
curl "http://localhost:3000/products?inStock=true&price=24.99"
```
Rules:
- Each parameter filters on the record field with the same name. Multiple parameters are combined with AND.
- Repeating a parameter matches any of its values (`?role=admin&role=user` is OR).
- Strings match exactly but ignore case. `integer`, `number` and `boolean` parameters are converted to their declared type, and an invalid value (such as `?price=abc`) returns 400.
- A filter with no matches returns an empty list (`[]`), not an error.
- Empty values (`?name=`) and query parameters not declared in the spec are ignored.
- A parameter marked `required: true` returns 400 when missing.
- Parameters may be defined inline, on the path item, or as `$ref`s to `components/parameters`.

To filter a new resource, declare its query parameters on the GET operation in the YAML. No code changes are needed.

## In-memory database
Data is held in RAM. New POST requests are reflected in later GET requests until the server stops or restarts. Restarting restores the seed data. This is intended for demonstrations, not production persistence.


## Adding a new resource
Add a resource path and operations in `specs/openapi.yaml`, then restart the server. For example, adding `/books` and `/books/{id}` allows the generic engine to create the `books` collection automatically. The request-body schema should be declared under `components/schemas` and referenced by the POST operation for validation.

## Notes
- The current engine infers collection names from the first path segment (e.g. `/users/{id}` maps to `users`).
- Path parameters named `id` are used as record IDs for CRUD operations.
- Route registration is dynamic, but this is a demo-oriented generic CRUD engine. It does not implement every OpenAPI feature (security, content negotiation, custom operation behavior, response validation, pagination, nested resources, etc.).
