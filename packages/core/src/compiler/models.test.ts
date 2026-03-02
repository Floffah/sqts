import { mkdtemp } from "fs/promises";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { buildSqliteSchema, parseSql } from "@sqts/sql";
import { describe, expect, it } from "bun:test";
import { Project } from "ts-morph";

import { compileModelTypes } from "./models.ts";

describe("compileModelTypes", () => {
    it("generates exported row interfaces for main-schema tables", async () => {
        const { fileText } = await compileAndReadModels([
            `
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL
);
            `,
            `
CREATE TABLE blog_posts (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  title TEXT NOT NULL
);
            `,
        ]);

        expect(fileText).toContain("export interface User");
        expect(fileText).toContain("export interface BlogPost");
        expect(fileText).toContain("id: number;");
        expect(fileText).toContain("email: string;");
    });

    it("respects deterministic table and column order", async () => {
        const { fileText } = await compileAndReadModels([
            `
CREATE TABLE users (
  z_col TEXT,
  a_col TEXT
);
            `,
            `
CREATE TABLE posts (
  title TEXT,
  created_at TEXT
);
            `,
        ]);

        const userInterfaceIndex = fileText.indexOf("export interface User");
        const postInterfaceIndex = fileText.indexOf("export interface Post");
        expect(userInterfaceIndex).toBeGreaterThanOrEqual(0);
        expect(postInterfaceIndex).toBeGreaterThan(userInterfaceIndex);

        const zColIndex = fileText.indexOf("z_col: string | null;");
        const aColIndex = fileText.indexOf("a_col: string | null;");
        expect(zColIndex).toBeGreaterThanOrEqual(0);
        expect(aColIndex).toBeGreaterThan(zColIndex);
    });

    it("maps nullable and non-nullable columns correctly", async () => {
        const { fileText } = await compileAndReadModels([
            `
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  nickname TEXT,
  email TEXT NOT NULL
);
            `,
        ]);

        expect(fileText).toContain("id: number;");
        expect(fileText).toContain("nickname: string | null;");
        expect(fileText).toContain("email: string;");
    });

    it("maps sqlite affinity types conservatively", async () => {
        const { fileText } = await compileAndReadModels([
            `
CREATE TABLE metrics (
  int_col INTEGER,
  real_col REAL,
  numeric_col NUMERIC,
  text_col TEXT,
  blob_col BLOB,
  unknown_col
);
            `,
        ]);

        expect(fileText).toContain("int_col: number | null;");
        expect(fileText).toContain("real_col: number | null;");
        expect(fileText).toContain("numeric_col: number | null;");
        expect(fileText).toContain("text_col: string | null;");
        expect(fileText).toContain(
            "blob_col: Uint8Array | string | unknown | null;",
        );
        expect(fileText).toContain("unknown_col: unknown | null;");
    });

    it("throws for non-main schema tables", async () => {
        const project = new Project({});
        const outdir = await mkdtemp(join(tmpdir(), "sqts-core-models-"));
        const schema = buildSqliteSchema([
            parseSql("CREATE TABLE auth.users (id INTEGER PRIMARY KEY);"),
        ]);

        await expect(
            compileModelTypes(project, outdir, createCompileContext(schema)),
        ).rejects.toThrow('supports only the "main" schema');
    });

    it("throws for type-name collisions after singularization", async () => {
        const project = new Project({});
        const outdir = await mkdtemp(join(tmpdir(), "sqts-core-models-"));
        const schema = buildSqliteSchema([
            parseSql("CREATE TABLE users (id INTEGER PRIMARY KEY);"),
            parseSql("CREATE TABLE user (id INTEGER PRIMARY KEY);"),
        ]);

        await expect(
            compileModelTypes(project, outdir, createCompileContext(schema)),
        ).rejects.toThrow("Model type name collision");
    });

    it("throws for schema invariant violations", async () => {
        const project = new Project({});
        const outdir = await mkdtemp(join(tmpdir(), "sqts-core-models-"));
        const schema = buildSqliteSchema([
            parseSql("CREATE TABLE users (id INTEGER PRIMARY KEY);"),
        ]);

        schema.tableOrder.push("main.missing_table");

        await expect(
            compileModelTypes(project, outdir, createCompileContext(schema)),
        ).rejects.toThrow("Schema invariant violation");
    });

    it("matches snapshot for comprehensive models output", async () => {
        const { fileText } = await compileAndReadModels([
            `
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  bio TEXT,
  avatar BLOB,
  points NUMERIC
);
            `,
            `
CREATE TABLE blog_posts (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  body TEXT
);
            `,
        ]);

        expect(fileText).toMatchSnapshot();
    });
});

async function compileAndReadModels(sqlPrograms: string[]): Promise<{
    fileText: string;
    outputPath: string;
}> {
    const schema = buildSqliteSchema(sqlPrograms.map((sql) => parseSql(sql)));
    const project = new Project({});
    const outdir = await mkdtemp(join(tmpdir(), "sqts-core-models-"));

    await compileModelTypes(project, outdir, createCompileContext(schema));

    const outputPath = resolve(outdir, "types.ts");
    const outputFile = project.getSourceFile(outputPath);
    if (!outputFile) {
        throw new Error(
            `Expected generated types file at "${outputPath}", but it was not found in ts-morph project.`,
        );
    }

    return {
        fileText: outputFile.getFullText(),
        outputPath,
    };
}

function createCompileContext(
    schema: ReturnType<typeof buildSqliteSchema>,
): Parameters<typeof compileModelTypes>[2] {
    return {
        schema,
        config: {
            executor: {
                module: "@sqts/core/adapters/bun-sqlite",
            },
            compiler: {
                schemaDir: "migrations",
                outDir: ".sqts",
                modelTypes: true,
            },
        },
    };
}
