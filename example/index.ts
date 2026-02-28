import { Database } from "bun:sqlite";
import { defineExecutor } from "sqts";
import { normalizeRows } from "sqts/adapters/bun-sqlite";

import execGetUserQuery from "./getUser.sqts.ts";

const db = new Database(":memory:");

export const execute = defineExecutor(async (query, params, meta) => {
    const statement = db.query(query);
    const rows = statement.all(...params);

    return {
        rows: normalizeRows(rows, meta),
    };
});

export interface User {
    id: string;
    email: string;
}

db.run("CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT)");
db.run("INSERT INTO users (id, email) VALUES (?, ?)", [
    "123",
    "me@example.com",
]);

const user = await execGetUserQuery({ id: "123" });

console.log("Got user", user);
