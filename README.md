# SQTS

> [!NOTE]
> I'm currently working towards a proof of concept. It doesn't work yet, but I wanted to share the idea and get feedback. See below for feature checklist

- [x] Basic parser & transformer
- [x] SQL client integration (config-selected executor modules)
- [ ] More built-in adapter helpers (pg, mysql2, etc)
- [ ] Bundler plugins (esbuild, vite, bun, etc)
- [x] CLI tool for generating code without a bundler
- [x] Make the format nicer
- [ ] Supports more complex use cases
- [ ] Overhaul the codebase structure

ORMs (drizzle, prisma, etc) are often the best choice for developers wanting type-safety with their databases, but sometimes you can't use them. Maybe you can't ship the migrations due to some constraint, maybe you need a self-contained bundle or binary, maybe you just want ownership of the queries.

SQTS is a way to keep your SQL type safe without an ORM.

Define your migrations or schema as normal SQL files, write your queries in .sqts files, and get type safety and autocompletion in your editor. SQTS will parse your SQL, extract the types, and generate TypeScript code that you can import and use in your application.

## Config

SQTS requires `sqts.config.*` at compile time (unless overridden programmatically):

```ts
import { defineConfig } from "@sqts/core/config";

export default defineConfig({
    executor: {
        module: "@sqts/core/adapters/bun-sqlite",
    },
});
```

The configured module must export a named async `execute(query, params, meta?)` function.

## Example

```sql
-- migrations/001-create-users.sql

CREATE TABlE IF NOT EXISTS users (
     id SERIAL PRIMARY KEY,
     name TEXT NOT NULL,
     email TEXT NOT NULL UNIQUE
);
```

```sql
-- operations.sqts

GetUser => SELECT * FROM users WHERE id = $id;
```

With this, in your configured output folder (default is `./sqts`) you'll get generated model types and this function signature:
```ts
export async function GetUser(params: { id: number; }): Promise<User[]>;
```

## Adapter: bun:sqlite

Create an executor file somewhere in your project:

```ts
// src/db.ts
import { executorWithBunSqlite } from "@sqts/core/adapters/bun-sqlite";
import Database from "bun:sqlite";

const db = new Database(":memory:"); // or path to your database file

export const execute = executorWithBunSqlite(db);
```

Then point to it in your config:

```ts
import { defineConfig } from "@sqts/core/config";

export default defineConfig({
    executor: {
        module: "@/db",
    },
});
```

## Custom adapters

For this to work you should set up path aliases, for example point `@/*` to `./src/*` in your `tsconfig.json`. Then you can create your own adapter module:

```ts
// src/adapters/my-adapter.ts
import { defineExecutor } from "@sqts/core";

export const execute = defineExecutor(async (query, params, meta) => {
    // do something with the query and params, return results
    // see src/adapters/bun-sqlite.ts for an example implementation
});
```

Then update your sqts.config.ts:

```ts
import { defineConfig } from "@sqts/core/config";

export default defineConfig({
    executor: {
        module: "@/adapters/my-adapter",
    },
});
```