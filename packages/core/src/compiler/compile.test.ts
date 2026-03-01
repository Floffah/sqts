import { mkdtemp, mkdir, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { buildSqliteSchema, parseSqlite } from "@sqts/sql";
import { describe, expect, it } from "bun:test";

import { compile } from "@/compiler/compile.ts";
import { CompilerError, CompilerErrorCode } from "@/compiler/errors.ts";

describe("compile", () => {
    it("emits SELECT execution body with model return type import when modelTypes is enabled", async () => {
        const cwd = await mkdtemp(join(tmpdir(), "sqts-core-compile-"));
        const sqtsPath = resolve(cwd, "queries/getUser.sqts");
        await mkdir(resolve(cwd, "queries"), { recursive: true });
        await writeFile(
            sqtsPath,
            "GetUser => SELECT users.id, users.email FROM users WHERE users.id = $id AND users.email = $email;",
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

        expect(output).toContain(
            'import { execute as __sqtsExecute } from "@sqts/core/adapters/bun-sqlite";',
        );
        expect(output).toContain('import type { User } from "./types";');
        expect(output).toContain(
            "export async function GetUser(params: { id: number; email: string; }): Promise<User[]> {",
        );
        expect(output).toContain("const __sqtsQuery0 = \"SELECT users.id, users.email FROM users WHERE users.id = ? AND users.email = ?\";");
        expect(output).toContain("const __sqtsParams0 = [params.id, params.email];");
        expect(output).toContain(
            'const __sqtsResult0 = await __sqtsExecute(__sqtsQuery0, __sqtsParams0, { queryName: "GetUser", sourceFile: "queries/getUser.sqts", statementIndex: 0 });',
        );
        expect(output).toContain("id: __sqtsRow[\"id\"] as number");
        expect(output).toContain("email: __sqtsRow[\"email\"] as string");
        expect(output).toContain("}) as User);");
    });

    it("preserves duplicate placeholder appearances in params order", async () => {
        const cwd = await mkdtemp(join(tmpdir(), "sqts-core-compile-"));
        const sqtsPath = resolve(cwd, "queries/find.sqts");
        await mkdir(resolve(cwd, "queries"), { recursive: true });
        await writeFile(
            sqtsPath,
            "FindPosts => SELECT posts.id FROM posts WHERE posts.id = $id OR posts.owner_id = $id;",
        );

        const schema = buildSqliteSchema([
            parseSqlite(`
CREATE TABLE posts (
  id INTEGER PRIMARY KEY,
  owner_id INTEGER NOT NULL
);
            `),
        ]);

        const output = await compile(
            "queries/find.sqts",
            createCompileContext(schema, false),
            cwd,
        );

        expect(output).toContain("const __sqtsParams0 = [params.id, params.id];");
    });

    it("emits write-only operation bodies returning Promise<void>", async () => {
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
        expect(output).toContain(
            'await __sqtsExecute(__sqtsQuery0, __sqtsParams0, { queryName: "UpdateUser", sourceFile: "queries/updateUser.sqts", statementIndex: 0 });',
        );
        expect(output).toContain("return;");
        expect(output).not.toContain("const __sqtsRows");
    });

    it("executes block statements sequentially and returns rows from the last row-producing statement", async () => {
        const cwd = await mkdtemp(join(tmpdir(), "sqts-core-compile-"));
        const sqtsPath = resolve(cwd, "queries/upsertAndFetch.sqts");
        await mkdir(resolve(cwd, "queries"), { recursive: true });
        await writeFile(
            sqtsPath,
            `
UpsertAndFetch => (
    UPDATE users SET email = $email WHERE id = $id;
    SELECT users.id, users.email FROM users WHERE users.id = $id;
)
            `,
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
            "queries/upsertAndFetch.sqts",
            createCompileContext(schema, true),
            cwd,
        );

        expect(output).toContain('import type { User } from "./types";');
        expect(output).toContain(
            "export async function UpsertAndFetch(params: { email: unknown; id: number; }): Promise<User[]> {",
        );
        expect(output).toContain("const __sqtsQuery0 = \"UPDATE users SET email = ? WHERE id = ?\";");
        expect(output).toContain("const __sqtsParams0 = [params.email, params.id];");
        expect(output).toContain(
            'await __sqtsExecute(__sqtsQuery0, __sqtsParams0, { queryName: "UpsertAndFetch", sourceFile: "queries/upsertAndFetch.sqts", statementIndex: 0 });',
        );
        expect(output).toContain("const __sqtsQuery1 = \"SELECT users.id, users.email FROM users WHERE users.id = ?\";");
        expect(output).toContain("const __sqtsParams1 = [params.id];");
        expect(output).toContain(
            'const __sqtsResult1 = await __sqtsExecute(__sqtsQuery1, __sqtsParams1, { queryName: "UpsertAndFetch", sourceFile: "queries/upsertAndFetch.sqts", statementIndex: 1 });',
        );
        expect(output).toContain("const __sqtsRows = (__sqtsResult1.rows ?? []) as Record<string, unknown>[];");
    });

    it("throws when projection output keys collide", async () => {
        const cwd = await mkdtemp(join(tmpdir(), "sqts-core-compile-"));
        const sqtsPath = resolve(cwd, "queries/collision.sqts");
        await mkdir(resolve(cwd, "queries"), { recursive: true });
        await writeFile(
            sqtsPath,
            "Collision => SELECT users.id, posts.id FROM users INNER JOIN posts ON posts.user_id = users.id;",
        );

        const schema = buildSqliteSchema([
            parseSqlite(`
CREATE TABLE users (
  id INTEGER PRIMARY KEY
);
CREATE TABLE posts (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL
);
            `),
        ]);

        await expectCompilerErrorCode(
            compile("queries/collision.sqts", createCompileContext(schema, true), cwd),
            CompilerErrorCode.DuplicateProjectionOutputKey,
        );
    });

    it("throws when a complex projection expression is missing an alias", async () => {
        const cwd = await mkdtemp(join(tmpdir(), "sqts-core-compile-"));
        const sqtsPath = resolve(cwd, "queries/count.sqts");
        await mkdir(resolve(cwd, "queries"), { recursive: true });
        await writeFile(sqtsPath, "CountUsers => SELECT COUNT(*) FROM users;");

        const schema = buildSqliteSchema([
            parseSqlite(`
CREATE TABLE users (
  id INTEGER PRIMARY KEY
);
            `),
        ]);

        await expectCompilerErrorCode(
            compile("queries/count.sqts", createCompileContext(schema, true), cwd),
            CompilerErrorCode.MissingProjectionAlias,
        );
    });

    it("throws when wildcard projection references an unknown table", async () => {
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

        await expectCompilerErrorCode(
            compile("queries/getGhost.sqts", createCompileContext(schema, true), cwd),
            CompilerErrorCode.InvalidSelectProjectionReference,
        );
    });

    it("rewrites placeholders while ignoring strings and comments", async () => {
        const cwd = await mkdtemp(join(tmpdir(), "sqts-core-compile-"));
        const sqtsPath = resolve(cwd, "queries/comments.sqts");
        await mkdir(resolve(cwd, "queries"), { recursive: true });
        await writeFile(
            sqtsPath,
            `
Comments => SELECT users.id FROM users
WHERE users.id = $id
AND note = '$id'
-- $id
/* $id */;
            `,
        );

        const schema = buildSqliteSchema([
            parseSqlite(`
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  note TEXT
);
            `),
        ]);

        const output = await compile(
            "queries/comments.sqts",
            createCompileContext(schema, false),
            cwd,
        );

        expect(output).toContain("WHERE users.id = ?");
        expect(output).toContain("AND note = '$id'");
        expect(output).toContain("-- $id");
        expect(output).toContain("/* $id */");
        expect(output).toContain("const __sqtsParams0 = [params.id];");
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
            createCompileContext(schema, true),
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

async function expectCompilerErrorCode(
    run: Promise<unknown>,
    code: CompilerErrorCode,
): Promise<void> {
    try {
        await run;
        throw new Error(`Expected CompilerError(${code})`);
    } catch (error) {
        if (!(error instanceof CompilerError)) {
            throw error;
        }
        expect(error.code).toBe(code);
    }
}
