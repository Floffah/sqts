---
title: Your First Query
description: Write and use your first SQTS query.
---

In SQTS, query files (`.sqts`) are split into two sections: the Typescript header and SQL query body, separated by a `---` divider. The header defines input/output types along with any transformation you may need, while the body contains the SQL query with special syntax for referencing props and shaping results.

Here's a basic query that gets a user by ID:

```ts
// getUser.sqts
import type { User } from "@/my-models";

const { id } = sqts.props as {
    id: string
}

export const user = {} as User;

---

SELECT
    u.id AS user.id,
    u.email AS user.email
FROM users u
WHERE u.id = $id;
```

This will compile a module with the signature of:
```ts
export function execGetUser(params: { id: string }): Promise<{ user: User }>;
```

The compiler does a few magical things here. The majority of your typescript is copied verbatim into the output function, however whenever it sees `sqts.props`, it uses this as query input context, and similarly it uses any exported variables as output context. Input and output context is used to derive the function signature, SQL transformation, and result "parsing".

In the SQL body, you can reference input props using `$propName` syntax, and shape output using `AS outputContextPath`. The compiler transforms the SQL query to use parameterized values, and generates code to map results into the output shape.

The above query would output this SQL:
```sql
SELECT 
    u.id AS "user.id", 
    u.email AS "user.email" 
FROM users u
WHERE u.id = ?;
```

It would then call your configured adapter by passing in all of your referenced props individually as parameters.

When turning results into the output shape, the compiler looks at the `AS` paths and generates code to map the flat SQL result into the nested output structure. In this case, it would create a single object with `id` and `email` properties.

When using a single output (`export user = {} as User`), you define the alias shape with `variableName.path` syntax. For arrays (`export const users: User[] = []`), you would instead use `variableName[].path` syntax to indicate the array item shape.