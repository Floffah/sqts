import { Database } from "bun:sqlite";
import { afterEach, expect, test } from "bun:test";

import {
    clearDefaultDatabase,
    execute,
    setDefaultDatabase,
} from "@/adapters/bun-sqlite.ts";

afterEach(() => {
    clearDefaultDatabase();
});

test("bun-sqlite execute returns normalized rows", async () => {
    const db = new Database(":memory:");
    db.run("CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT NOT NULL)");
    db.run("INSERT INTO users (id, email) VALUES (1, 'alice@example.com')");

    setDefaultDatabase(db);

    const result = await execute(
        "SELECT id, email FROM users WHERE id = ?",
        [1],
        { queryName: "getUser", sourceFile: "get-user.tsql" },
    );

    expect(result.rows).toEqual([{ id: 1, email: "alice@example.com" }]);
    db.close();
});

test("bun-sqlite execute errors for non-object rows", async () => {
    setDefaultDatabase({
        query() {
            return {
                all() {
                    return [123];
                },
            };
        },
    });

    await expect(
        execute("SELECT 1", [], {
            queryName: "bad",
            sourceFile: "bad.tsql",
        }),
    ).rejects.toThrow("Expected object row");
});
