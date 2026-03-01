---
title: Configuration
description: Reference for sqts.config.* options.
---

Use `sqts.config.ts` (or `.js`/`.mjs`/`.cjs`) to configure the compiler.

```ts
import { defineConfig } from "@sqts/core/config";

export default defineConfig({
  executor: {
    // Module must export `execute(query, params, meta?)`
    module: "@sqts/core/adapters/bun-sqlite",
  },
  compiler: {
    // Directory containing ordered .sql schema files
    schemaDir: "migrations",

    // Output directory for generated artifacts
    outDir: ".sqts",

    // Generate schema-derived model interfaces in types.ts
    modelTypes: true,
  },
});
```

## Notes

- `executor.module` is required.
- `compiler.modelTypes` controls generation of `types.ts`.
- When `modelTypes` is enabled and an operation is model-backed, compiled return types use generated model types.
