---
title: Executor Contract
description: The runtime execution shape SQTS expects.
---

SQTS compiles every operation into one or more calls to your configured executor module.

Your executor module must export a named async function called `execute`.

## Function shape

- Name: `execute`
- Inputs:
  - `query: string`
  - `params: unknown[]`
  - `meta?: { queryName: string; sourceFile: string; statementIndex: number }`
- Output:
  - `Promise<{ rows: Record<string, unknown>[] }>`

## Behavior expectations

- `query` uses positional placeholders (`?`) after SQTS compilation.
- `params` are ordered by placeholder appearance in that statement, including duplicates.
- `rows` is used for row-producing statements (SELECT); write-only statements can return `{ rows: [] }`.
- Block operations are executed sequentially; the last row-producing statement determines the returned rows.
- Throwing from `execute` signals execution failure and is surfaced to the caller.
