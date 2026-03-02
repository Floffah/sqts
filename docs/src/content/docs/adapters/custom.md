---
title: Custom Adapters
description: Build your own SQTS executor module.
---

Custom adapters let you plug SQTS into your existing database and runtime architecture.

Instead of asking SQTS to understand every query client directly, you provide a module with a single `execute` function. SQTS compiles queries to call that function.

## Required shape

Your configured module must export a named async function called `execute`. For ease, you can use our `defineExecutor` helper.

```ts
import { defineExecutor } from "@sqts/core";

export const execute = defineExecutor(async (query, params, meta) => {
    // do something with the query and params, return results
    // see src/adapters/bun-sqlite.ts for an example implementation
});
```

## Configuration

Point SQTS at your adapter module in `sqts.config.*`:

```ts
import { defineConfig } from "@sqts/core/config";

export default defineConfig({
    executor: {
        module: "@/db/sqts-executor",
    },
});
```

The module string is used as-is in generated imports, so package names and path aliases are both supported.
