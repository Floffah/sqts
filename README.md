# TSQL

> [!NOTE]
> I'm currently working towards a proof of concept. It doesn't work yet, but I wanted to share the idea and get feedback. See below for feature checklist

- [x] Basic parser & transformer
- [ ] SQL client integration (bun:sql/bun:sqlite, pg, mysql2, etc)
- [ ] Bundler plugins (esbuild, vite, bun, etc)
- [ ] CLI tool for generating code without a bundler
- [ ] Make the format nicer

ORMs (drizzle, prisma, etc) are often the best choice for developers wanting type-safety with their databases, but sometimes you can't use them. Maybe you can't ship the migrations due to some constraint, maybe you need a self-contained bundle or binary, maybe you just want ownership of the queries.

TSQL is a way to write SQL in a type-safe way by combining Typescript and SQL similar to how JSX combines HTML and Javascript.

It allows you to create an Astro-style template with a Typescript header. You defined input props, you reference them by name in the SQL, and you get type-safety with ease.

TSQL works as a command-line tool AND plugins for your favourite bundler. You configure it with whatever SQL client you use, and it will generate code for you that runs the query and returns typed results.

## Examples

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

<details>
<summary>This outputs psuedocode similar to:</summary>

```ts
import { compiledApi as tsql } from "tsql";
import { User } from "./";

type QueryProps = { id: string; };

export default function execGetUsersQuery({ id }: QueryProps): User[] {
    const query = `SELECT u.id AS "users[].id", u.email AS "users[].email" FROM users u
WHERE u.id = ?;`;
    const output = execSql(query, id);
    const rows = output.rows as Record<string, unknown>[];

    const setPath = (target: Record<string, any>, path: string[], value: unknown) => {
        let current: Record<string, any> = target;
        for (let i = 0; i < path.length - 1; i++) {
            const key = path[i]!;
            const existing = current[key];
            if (typeof existing !== "object" || existing === null || Array.isArray(existing)) {
                current[key] = {};
            }
            current = current[key] as Record<string, any>;
        }
        current[path[path.length - 1]!] = value;
    };

    const mappings = [
        { aliasKey: "users[].id", targetPath: ["id"] },
        { aliasKey: "users[].email", targetPath: ["email"] },
    ] as const;

    const users: User[] = [];
    for (const row of rows) {
        const value = {} as User;
        for (const mapping of mappings) {
            setPath(value as Record<string, any>, [...mapping.targetPath], row[mapping.aliasKey]);
        }
        users.push(value);
    }
    return users;
}
```

</details>