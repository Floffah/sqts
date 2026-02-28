import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import type { CompilerOptions } from "ts-morph";
import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { nanoid } from "nanoid";
import { getCompilerOptionsFromTsConfig } from "ts-morph";

import { normalizeRows } from "@/adapters/bun-sqlite.ts";
import { compile } from "@/compiler/index.ts";
import { defineExecutor } from "@/lib/executor.ts";

const compilerOptions = getCompilerOptionsFromTsConfig(
    resolve(process.cwd(), "tsconfig.json"),
) as unknown as CompilerOptions;

const singleRowTestFile = `
const { id } = tsql.props as {
    id: string
}

export const user: User = {} as { id: string; email: string };

---

SELECT
    u.id AS user.id,
    u.email AS "user.email"
FROM users u
WHERE u.id = $id;
`;

async function saveAndRun(code: string) {
    const path = resolve(__dirname, nanoid() + ".ts");
    await Bun.write(path, code);
    const callable = await import(path);
    await rm(path);
    return callable;
}

const db = new Database(":memory:");

export const execute = defineExecutor(async (query, params, meta) => {
    const statement = db.query(query);
    const rows = statement.all(...(params as any));

    return {
        rows: normalizeRows(rows, meta),
    };
});

test("Correctly returns single row", async () => {
    const output = await compile(singleRowTestFile.trim(), "getUser", {
        compilerOptions,
        executorModule: "@/compiler/generated.test.ts",
    });

    const id = "1";
    const email = "me@example.com";

    db.run("CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT)");
    db.run("INSERT INTO users (id, email) VALUES (?, ?)", [id, email]);

    const callable = await saveAndRun(output);

    const result = await callable.default({ id: "1" });

    expect(result).toEqual({
        id,
        email,
    });
});
