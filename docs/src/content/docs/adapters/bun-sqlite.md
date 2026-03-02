---
title: Bun SQLite Adapter
description: Using SQTS with Bun's SQLite runtime.
---

When using Bun SQLite, you can use the built-in adapter.

Create a file somewhere to contain the executor function, for example `src/db.ts`:

```ts
// src/db.ts
import { executorWithBunSqlite } from "@sqts/core/adapters/bun-sqlite";
import Database from "bun:sqlite";

const db = new Database(":memory:"); // or path to your database file

export const execute = executorWithBunSqlite(db);
```

In your config, point `executor.module` to this file:

```ts
import { defineConfig } from "@sqts/core/config";

export default defineConfig({
    executor: {
        module: "@/db",
    },
});
```
