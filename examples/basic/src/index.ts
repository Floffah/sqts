import { readdir, readFile } from "fs/promises";
import { resolve } from "path";
import { executorWithBunSqlite } from "@sqts/core/adapters/bun-sqlite";
import { Database } from "bun:sqlite";

import { GetUser } from "../.sqts";

const db = new Database(":memory:");

export const execute = executorWithBunSqlite(db);

const migrationsDir = readdir(resolve(process.cwd(), "migrations"));

for await (const file of await migrationsDir) {
    if (file.endsWith(".sql")) {
        const migration = await readFile(
            resolve(process.cwd(), "migrations", file),
            "utf-8",
        );

        db.run(migration);
    }
}

db.run("INSERT INTO users (id, name, email) VALUES (?, ?, ?)", [
    1,
    "Example",
    "example@example.com",
]);

const users = await GetUser({ id: 1 });
const user = users[0];

if (!user || user.name !== "Example" || user.email !== "example@example.com") {
    throw new Error("Test failed: User data does not match expected values.");
}

console.log("Test passed: User data matches expected values.");
