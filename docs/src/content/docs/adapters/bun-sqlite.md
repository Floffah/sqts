---
title: Bun SQLite Adapter
description: Using SQTS with Bun's SQLite runtime.
---

The Bun SQLite adapter is the quickest way to run SQTS queries without building custom integration code.

In your config, point `executor.module` to the built-in adapter:

```ts
import { defineConfig } from "@sqts/core/config";

export default defineConfig({
    executor: {
        module: "@sqts/core/adapters/bun-sqlite",
    },
});
```

By default, the adapter resolves the database path from environment variables in this order:
- `TSQL_BUN_SQLITE_PATH`
- `BUN_SQLITE_PATH`
- `SQLITE_DATABASE_PATH`
- `DATABASE_URL`

If you need custom connection lifecycle logic, wrappers, transactions, or observability hooks, create a custom adapter module instead and set that module in `sqts.config.*`.
