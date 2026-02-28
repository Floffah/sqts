# TSQL

> [!NOTE]
> I'm currently working towards a proof of concept. It doesn't work yet, but I wanted to share the idea and get feedback. See below for feature checklist

- [x] Basic parser & transformer
- [ ] SQL client integration (bun:sql/bun:sqlite, pg, mysql2, etc)
- [ ] Bundler plugins (esbuild, vite, bun, etc)
- [ ] CLI tool for generating code without a bundler
- [ ] Make the format nicer

ORMs (drizzle, prisma, etc) are great, but sometimes you can't use them. Maybe you can't properly ship the migrations, maybe you need a self-contained bundle or binary, maybe you just want ownership of the SQL.

TSQL is a way to write SQL in a type-safe way by compining Typescript and SQL similar to how JSX combines HTML and Javascript.

It allows you to create an Astro-style template with a typescript header. You defined input props, you reference them by name in the SQL, and you get type-safety and autocompletion for free.

TSQL works as a command-line tool AND plugins for your favourite bundler. You configure it with whatever SQL client you use, and it will generate code for.

## Examples

Basic query:

```ts
import { User } from "@/models"

const { id } = tsql.props as {
    id: User['id']
}

---

SELECT * FROM users WHERE id = $id
```

Input & output types:
