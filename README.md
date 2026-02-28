# TSQL

> [!NOTE]
> I'm currently working towards a proof of concept. It doesn't work yet, but I wanted to share the idea and get feedback. See below for feature checklist

- [x] Basic parser & transformer
- [x] SQL client integration (config-selected executor modules)
- [ ] More built-in adapter helpers (pg, mysql2, etc)
- [ ] Bundler plugins (esbuild, vite, bun, etc)
- [ ] CLI tool for generating code without a bundler
- [ ] Make the format nicer

ORMs (drizzle, prisma, etc) are often the best choice for developers wanting type-safety with their databases, but sometimes you can't use them. Maybe you can't ship the migrations due to some constraint, maybe you need a self-contained bundle or binary, maybe you just want ownership of the queries.

TSQL is a way to write SQL in a type-safe way by combining Typescript and SQL similar to how JSX combines HTML and Javascript.

It allows you to create an Astro-style template with a Typescript header. You define input props, export your output shape, reference props in SQL, and get typed mapped results.

## Config

TSQL requires `tsql.config.*` at compile time (unless overridden programmatically):

```ts
import { defineConfig } from "tsql/config";

export default defineConfig({
    executor: {
        module: "tsql/adapters/bun-sqlite",
    },
});
```

The configured module must export a named async `execute(query, params, meta?)` function.

## Example

```ts
import { User } from "./";

const { id } = tsql.props as {
    id: string
}

export const users: User[] = []

---

SELECT
    u.id AS users[].id,
    u.email AS users[].email
FROM users u
WHERE u.id = $id;
```

## Adapter: bun:sqlite

You can use the built-in adapter module:

```ts
import { execute } from "tsql/adapters/bun-sqlite";
```

By default it resolves a database path from:
- `TSQL_BUN_SQLITE_PATH`
- `BUN_SQLITE_PATH`
- `SQLITE_DATABASE_PATH`
- `DATABASE_URL`

## Custom adapters

For this to work you should set up path aliases, for example point `@/*` to `./src/*` in your `tsconfig.json`. Then you can create your own adapter module:

```ts
// src/adapters/my-adapter.ts
import { defineExecutor } from "tsql";

export const execute = defineExecutor(async (query, params, meta) => {
    // do something with the query and params, return results
    // see src/adapters/bun-sqlite.ts for an example implementation
});
```

Then update your tsql.config.ts:

```ts
import { defineConfig } from "tsql/config";

export default defineConfig({
    executor: {
        module: "@/adapters/my-adapter",
    },
});
```