---
title: Executor Contract
description: The runtime execution shape SQTS expects.
---

SQTS keeps runtime integration intentionally small.

Your configured executor module must export a named async function called `execute`.

## Function shape

- Name: `execute`
- Inputs:
  - `query: string`
  - `params: unknown[]`
  - `meta?: { queryName: string; sourceFile: string }`
- Output:
  - `Promise<{ rows: Record<string, unknown>[] }>`

## Behavior expectations

- `params` are positional and already ordered by query placeholder appearance.
- `rows` must be an array of plain row objects keyed by selected SQL aliases.
- Throwing from `execute` should indicate query execution failure.
