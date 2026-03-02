---
title: Your First Query
description: Write and use your first SQTS query.
---

SQTS operations live in `.sqts` files and use one core pattern:

- `OperationName => SQL_STATEMENT;`
- or a block: `OperationName => ( ... );`

A simple query might be:

```sql
GetUser => SELECT id, email FROM users WHERE id = $id;
```

With the migration:

```sql
-- migrations/001-create-users.sql

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE
);
```

When compiled, SQTS generates an async function that:

- accepts a `params` object based on placeholders (`$id` -> `params.id`),
- rewrites SQL placeholders to positional `?`,
- calls your configured `execute(query, params, meta)` function,
- maps returned rows into a typed array based on the SQL projection.

So `SELECT id, email ...` compiles to a return type like:

- `Promise<Array<{ id: number; email: string }>>`

If `compiler.modelTypes` is enabled and the operation is model-backed, SQTS will use sibling generated model types (for example `Promise<User[]>` from `./types`).

Write-only operations (for example `UPDATE`, `DELETE`, `INSERT`) compile to:

- `Promise<void>`

For multi-statement blocks, SQTS executes statements in order and returns rows from the final row-producing statement.
