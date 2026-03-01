import { mkdtemp, mkdir, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { buildSqliteSchema, parseSqlite } from "@sqts/sql";
import { describe, expect, it } from "bun:test";

import { compile } from "./compile.ts";

describe("compile", () => {
    it("emits SELECT signature with model type import when modelTypes is enabled", async () => {
        const cwd = await mkdtemp(join(tmpdir(), "sqts-core-compile-"));
        const sqtsPath = resolve(cwd, "queries/getUser.sqts");
        await mkdir(resolve(cwd, "queries"), { recursive: true });
        await writeFile(
            sqtsPath,
            "GetUser => SELECT * FROM users WHERE users.id = $id AND users.email = $email;",
        );

        const schema = buildSqliteSchema([
            parseSqlite(`
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL
);
            `),
        ]);

        const output = await compile(
            "queries/getUser.sqts",
            createCompileContext(schema, true),
            cwd,
        );

        expect(output).toContain('import type { User } from "./models";');
        expect(output).toContain(
            "export async function GetUser(params: { id: number; email: string; }): Promise<User[]> {",
        );
        expect(output).toContain('throw new Error("Not implemented: GetUser");');
    });

    it("emits SELECT signature with inline object return when modelTypes is disabled", async () => {
        const cwd = await mkdtemp(join(tmpdir(), "sqts-core-compile-"));
        const sqtsPath = resolve(cwd, "queries/getUser.sqts");
        await mkdir(resolve(cwd, "queries"), { recursive: true });
        await writeFile(
            sqtsPath,
            "GetUser => SELECT * FROM users WHERE users.id = $id;",
        );

        const schema = buildSqliteSchema([
            parseSqlite(`
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL,
  bio TEXT
);
            `),
        ]);

        const output = await compile(
            "queries/getUser.sqts",
            createCompileContext(schema, false),
            cwd,
        );

        expect(output).not.toContain('import type {');
        expect(output).toContain(
            "export async function GetUser(params: { id: number; }): Promise<Array<{",
        );
        expect(output).toContain("id: number;");
        expect(output).toContain("email: string;");
        expect(output).toContain("bio: string | null;");
    });

    it("emits non-select operation signature returning Promise<void>", async () => {
        const cwd = await mkdtemp(join(tmpdir(), "sqts-core-compile-"));
        const sqtsPath = resolve(cwd, "queries/updateUser.sqts");
        await mkdir(resolve(cwd, "queries"), { recursive: true });
        await writeFile(
            sqtsPath,
            "UpdateUser => UPDATE users SET email = $email WHERE id = $id;",
        );

        const schema = buildSqliteSchema([
            parseSqlite(`
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL
);
            `),
        ]);

        const output = await compile(
            "queries/updateUser.sqts",
            createCompileContext(schema, true),
            cwd,
        );

        expect(output).toContain(
            "export async function UpdateUser(params: { email: unknown; id: unknown; }): Promise<void> {",
        );
    });

    it("falls back to unknown for placeholders without supported inference shape", async () => {
        const cwd = await mkdtemp(join(tmpdir(), "sqts-core-compile-"));
        const sqtsPath = resolve(cwd, "queries/getUser.sqts");
        await mkdir(resolve(cwd, "queries"), { recursive: true });
        await writeFile(
            sqtsPath,
            "GetUser => SELECT * FROM users WHERE COALESCE(users.id, 0) = $id;",
        );

        const schema = buildSqliteSchema([
            parseSqlite(`
CREATE TABLE users (
  id INTEGER PRIMARY KEY
);
            `),
        ]);

        const output = await compile(
            "queries/getUser.sqts",
            createCompileContext(schema, true),
            cwd,
        );

        expect(output).toContain("params: { id: unknown; }");
    });

    it("throws when placeholder inference conflicts", async () => {
        const cwd = await mkdtemp(join(tmpdir(), "sqts-core-compile-"));
        const sqtsPath = resolve(cwd, "queries/getUser.sqts");
        await mkdir(resolve(cwd, "queries"), { recursive: true });
        await writeFile(
            sqtsPath,
            "GetUser => SELECT * FROM users WHERE users.id = $id OR users.email = $id;",
        );

        const schema = buildSqliteSchema([
            parseSqlite(`
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL
);
            `),
        ]);

        await expect(
            compile("queries/getUser.sqts", createCompileContext(schema, true), cwd),
        ).rejects.toThrow("Conflicting placeholder type inference");
    });

    it("throws when select model table is missing in schema", async () => {
        const cwd = await mkdtemp(join(tmpdir(), "sqts-core-compile-"));
        const sqtsPath = resolve(cwd, "queries/getGhost.sqts");
        await mkdir(resolve(cwd, "queries"), { recursive: true });
        await writeFile(sqtsPath, "GetGhost => SELECT * FROM ghosts;");

        const schema = buildSqliteSchema([
            parseSqlite(`
CREATE TABLE users (
  id INTEGER PRIMARY KEY
);
            `),
        ]);

        await expect(
            compile("queries/getGhost.sqts", createCompileContext(schema, true), cwd),
        ).rejects.toThrow('references missing model table "main.ghosts"');
    });

    it("matches snapshot for comprehensive mixed operations output", async () => {
        const cwd = await mkdtemp(join(tmpdir(), "sqts-core-compile-"));
        const sqtsPath = resolve(cwd, "queries/mixed.sqts");
        await mkdir(resolve(cwd, "queries"), { recursive: true });
        await writeFile(
            sqtsPath,
            `
GetUser => SELECT * FROM users WHERE users.id = $id;
ListPosts => SELECT * FROM posts WHERE posts.user_id = $id;
UpdateUser => UPDATE users SET email = $email WHERE id = $id;
            `,
        );

        const schema = buildSqliteSchema([
            parseSqlite(`
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL
);
            `),
            parseSqlite(`
CREATE TABLE posts (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  title TEXT NOT NULL
);
            `),
        ]);

        const output = await compile(
            "queries/mixed.sqts",
            createCompileContext(schema, false),
            cwd,
        );

        expect(output).toMatchSnapshot();
    });
});

function createCompileContext(
    schema: ReturnType<typeof buildSqliteSchema>,
    modelTypes: boolean,
): Parameters<typeof compile>[1] {
    return {
        schema,
        config: {
            executor: {
                module: "@sqts/core/adapters/bun-sqlite",
            },
            compiler: {
                schemaDir: "migrations",
                outDir: ".sqts",
                modelTypes,
            },
        },
    };
}
