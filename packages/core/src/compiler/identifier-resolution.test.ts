import {
    buildSqliteSchema,
    parseSqlite,
    type IdentifierNode,
    type SelectStatement,
} from "@sqts/sql";
import { describe, expect, it } from "bun:test";

import { CompilerError, CompilerErrorCode } from "@/compiler/errors.ts";
import type { CompileContext } from "@/compiler/getCompileContext.ts";
import { resolveIdentifierType } from "@/compiler/identifier-resolution.ts";
import { buildTableAliasMap } from "@/compiler/lib/buildTableAliasMap.ts";
import { parseDocument, type SqtsOperation } from "@/parser";

const DUMMY_POSITION = {
    offset: 0,
    line: 1,
    column: 1,
};

const DUMMY_SPAN = {
    start: DUMMY_POSITION,
    end: DUMMY_POSITION,
};

describe("resolveIdentifierType", () => {
    it("resolves aliased and schema-qualified identifiers", () => {
        const operation = parseOperation(
            "GetUser => SELECT * FROM users u INNER JOIN posts p ON p.user_id = u.id WHERE u.id = $id;",
        );
        const select = parseSelect(
            "SELECT * FROM users u INNER JOIN posts p ON p.user_id = u.id WHERE u.id = $id;",
        );
        const aliasMap = buildTableAliasMap(select);
        const ctx = createCompileContext(`
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL
);
CREATE TABLE posts (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL
);
        `);

        const aliasedType = resolveIdentifierType(
            [createIdentifier("u"), createIdentifier("id")],
            operation,
            "queries/get.sqts",
            ctx,
            aliasMap,
            select,
        );

        const qualifiedType = resolveIdentifierType(
            [
                createIdentifier("main"),
                createIdentifier("users"),
                createIdentifier("email"),
            ],
            operation,
            "queries/get.sqts",
            ctx,
            aliasMap,
            select,
        );

        expect(aliasedType).toBe("number");
        expect(qualifiedType).toBe("string");
    });

    it("throws for unresolved aliases, tables, and columns", () => {
        const operation = parseOperation(
            "GetUser => SELECT * FROM users u WHERE u.id = $id;",
        );
        const select = parseSelect("SELECT * FROM users u WHERE u.id = $id;");
        const aliasMap = buildTableAliasMap(select);
        const ctx = createCompileContext(`
CREATE TABLE users (
  id INTEGER PRIMARY KEY
);
        `);

        expectCompilerErrorCode(
            () =>
                resolveIdentifierType(
                    [createIdentifier("x"), createIdentifier("id")],
                    operation,
                    "queries/get.sqts",
                    ctx,
                    aliasMap,
                    select,
                ),
            CompilerErrorCode.UnresolvedTableAlias,
        );

        expectCompilerErrorCode(
            () =>
                resolveIdentifierType(
                    [
                        createIdentifier("other"),
                        createIdentifier("users"),
                        createIdentifier("id"),
                    ],
                    operation,
                    "queries/get.sqts",
                    ctx,
                    aliasMap,
                    select,
                ),
            CompilerErrorCode.UnresolvedTable,
        );

        expectCompilerErrorCode(
            () =>
                resolveIdentifierType(
                    [createIdentifier("u"), createIdentifier("missing")],
                    operation,
                    "queries/get.sqts",
                    ctx,
                    aliasMap,
                    select,
                ),
            CompilerErrorCode.UnresolvedColumn,
        );
    });

    it("throws for ambiguous unqualified identifiers", () => {
        const operation = parseOperation(
            "GetUser => SELECT * FROM users u INNER JOIN posts p ON p.user_id = u.id WHERE id = $id;",
        );
        const select = parseSelect(
            "SELECT * FROM users u INNER JOIN posts p ON p.user_id = u.id WHERE id = $id;",
        );
        const aliasMap = buildTableAliasMap(select);
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
                resolveIdentifierType(
                    [createIdentifier("id")],
                    operation,
                    "queries/get.sqts",
                    ctx,
                    aliasMap,
                    select,
                ),
            CompilerErrorCode.AmbiguousIdentifier,
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

function createIdentifier(value: string): IdentifierNode {
    return {
        normalized: value,
        raw: value,
        quoted: false,
        span: DUMMY_SPAN,
    };
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
