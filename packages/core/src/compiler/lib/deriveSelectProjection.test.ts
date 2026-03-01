import { buildSqliteSchema, parseSqlite, type SelectStatement } from "@sqts/sql";
import { describe, expect, it } from "bun:test";

import { CompilerError, CompilerErrorCode } from "@/compiler/errors.ts";
import { deriveSelectProjection } from "@/compiler/lib/deriveSelectProjection.ts";
import type { CompileContext } from "@/compiler/getCompileContext.ts";
import { parseDocument, type SqtsOperation } from "@/parser";

describe("deriveSelectProjection", () => {
    it("derives projection fields from aliases, placeholders, and wildcards", () => {
        const operation = parseOperation(
            "GetUsers => SELECT u.id AS user_id, $id AS request_id, u.* FROM users u WHERE u.id = $id;",
        );
        const select = parseSelect(
            "SELECT u.id AS user_id, $id AS request_id, u.* FROM users u WHERE u.id = $id;",
        );
        const ctx = createCompileContext(`
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL,
  bio TEXT
);
        `);

        const projection = deriveSelectProjection({
            select,
            operation,
            sourcePath: "queries/get-users.sqts",
            compileContext: ctx,
            inferredPlaceholderTypes: new Map([["id", "number"]]),
        });

        expect(projection.fields).toEqual([
            { outputKey: "user_id", propertyKey: "user_id", tsType: "number" },
            {
                outputKey: "request_id",
                propertyKey: "request_id",
                tsType: "number",
            },
            { outputKey: "id", propertyKey: "id", tsType: "number" },
            { outputKey: "email", propertyKey: "email", tsType: "string" },
            { outputKey: "bio", propertyKey: "bio", tsType: "string | null" },
        ]);
        expect(projection.rowTypeLiteral).toContain("user_id: number;");
        expect(projection.rowTypeLiteral).toContain("request_id: number;");
        expect(projection.rowTypeLiteral).toContain("bio: string | null;");
    });

    it("throws for duplicate projection output keys", () => {
        const operation = parseOperation(
            "Collision => SELECT users.id, posts.id FROM users INNER JOIN posts ON posts.user_id = users.id;",
        );
        const select = parseSelect(
            "SELECT users.id, posts.id FROM users INNER JOIN posts ON posts.user_id = users.id;",
        );
        const ctx = createCompileContext(`
CREATE TABLE users (
  id INTEGER PRIMARY KEY
);
CREATE TABLE posts (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL
);
        `);

        expectCompilerErrorCode(
            () =>
                deriveSelectProjection({
                    select,
                    operation,
                    sourcePath: "queries/collision.sqts",
                    compileContext: ctx,
                    inferredPlaceholderTypes: new Map(),
                }),
            CompilerErrorCode.DuplicateProjectionOutputKey,
        );
    });

    it("throws for complex unaliased projection expressions", () => {
        const operation = parseOperation("CountUsers => SELECT COUNT(*) FROM users;");
        const select = parseSelect("SELECT COUNT(*) FROM users;");
        const ctx = createCompileContext(`
CREATE TABLE users (
  id INTEGER PRIMARY KEY
);
        `);

        expectCompilerErrorCode(
            () =>
                deriveSelectProjection({
                    select,
                    operation,
                    sourcePath: "queries/count-users.sqts",
                    compileContext: ctx,
                    inferredPlaceholderTypes: new Map(),
                }),
            CompilerErrorCode.MissingProjectionAlias,
        );
    });
});

function parseOperation(input: string): SqtsOperation {
    return parseDocument(input).operations[0]!;
}

function parseSelect(input: string): SelectStatement {
    const statement = parseSqlite(input).statements[0];
    if (!statement || statement.kind !== "select") {
        throw new Error("Expected select statement");
    }
    return statement;
}

function createCompileContext(schemaSql: string): CompileContext {
    return {
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
        schema: buildSqliteSchema([parseSqlite(schemaSql)]),
    };
}

function expectCompilerErrorCode(
    run: () => unknown,
    code: CompilerErrorCode,
): void {
    try {
        run();
        throw new Error(`Expected CompilerError(${code})`);
    } catch (error) {
        if (!(error instanceof CompilerError)) {
            throw error;
        }
        expect(error.code).toBe(code);
    }
}
