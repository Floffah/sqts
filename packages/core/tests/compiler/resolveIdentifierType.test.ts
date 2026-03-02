import type { IdentifierNode } from "@sqts/sql";
import { describe, expect, it } from "bun:test";

import { CompilerErrorCode } from "@/compiler/errors.ts";
import { buildTableAliasMap } from "@/compiler/lib/buildTableAliasMap.ts";
import { resolveIdentifierType } from "@/compiler/lib/resolveIdentifierType.ts";
import {
    createTestCompileContextFromSql,
    expectCompilerErrorCode,
    parseSingleOperation,
    parseSqlExpectSelect,
} from "@/tests/utils.ts";

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
        const operation = parseSingleOperation(
            "GetUser => SELECT * FROM users u INNER JOIN posts p ON p.user_id = u.id WHERE u.id = $id;",
        );
        const select = parseSqlExpectSelect(
            "SELECT * FROM users u INNER JOIN posts p ON p.user_id = u.id WHERE u.id = $id;",
        );
        const aliasMap = buildTableAliasMap(select);
        const ctx = createTestCompileContextFromSql(`
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

    it("throws for unresolved aliases, tables, and columns", async () => {
        const operation = parseSingleOperation(
            "GetUser => SELECT * FROM users u WHERE u.id = $id;",
        );
        const select = parseSqlExpectSelect(
            "SELECT * FROM users u WHERE u.id = $id;",
        );
        const aliasMap = buildTableAliasMap(select);
        const ctx = createTestCompileContextFromSql(`
CREATE TABLE users (
  id INTEGER PRIMARY KEY
);
        `);

        await expectCompilerErrorCode(
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

        await expectCompilerErrorCode(
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

        await expectCompilerErrorCode(
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

    it("throws for ambiguous unqualified identifiers", async () => {
        const operation = parseSingleOperation(
            "GetUser => SELECT * FROM users u INNER JOIN posts p ON p.user_id = u.id WHERE id = $id;",
        );
        const select = parseSqlExpectSelect(
            "SELECT * FROM users u INNER JOIN posts p ON p.user_id = u.id WHERE id = $id;",
        );
        const aliasMap = buildTableAliasMap(select);
        const ctx = createTestCompileContextFromSql(`
CREATE TABLE users (
  id INTEGER PRIMARY KEY
);
CREATE TABLE posts (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL
);
        `);

        await expectCompilerErrorCode(
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

function createIdentifier(value: string): IdentifierNode {
    return {
        normalized: value,
        raw: value,
        quoted: false,
        span: DUMMY_SPAN,
    };
}
