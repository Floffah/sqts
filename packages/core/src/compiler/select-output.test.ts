import { buildSqliteSchema, parseSqlite } from "@sqts/sql";
import { describe, expect, it } from "bun:test";

import { CompilerError, CompilerErrorCode } from "@/compiler/errors.ts";
import type { CompileContext } from "@/compiler/getCompileContext.ts";
import { resolveSelectOutputInfo } from "@/compiler/select-output.ts";
import { parseDocument, type SqtsOperation } from "@/parser";

describe("resolveSelectOutputInfo", () => {
    it("uses model type imports when modelTypes is enabled", () => {
        const info = resolveSelectOutputInfo(
            parseOperation("GetUser => SELECT * FROM users;"),
            createCompileContext(true),
            "queries/get-user.sqts",
        );

        expect(info).toEqual({
            returnType: "User[]",
            modelImport: "User",
        });
    });

    it("uses inline row type when modelTypes is disabled", () => {
        const info = resolveSelectOutputInfo(
            parseOperation("GetUser => SELECT * FROM users;"),
            createCompileContext(false),
            "queries/get-user.sqts",
        );

        expect(info).toBeTruthy();
        expect(info?.modelImport).toBeUndefined();
        expect(info?.returnType).toContain("Array<{");
        expect(info?.returnType).toContain("id: number;");
        expect(info?.returnType).toContain("email: string;");
    });

    it("throws when a SELECT operation has no FROM clause", () => {
        expectCompilerErrorCode(
            () =>
                resolveSelectOutputInfo(
                    parseOperation("GetOne => SELECT 1;"),
                    createCompileContext(true),
                    "queries/get-one.sqts",
                ),
            CompilerErrorCode.MissingSelectFromClause,
        );
    });

    it("throws when the model table is missing from schema", () => {
        expectCompilerErrorCode(
            () =>
                resolveSelectOutputInfo(
                    parseOperation("GetGhost => SELECT * FROM ghosts;"),
                    createCompileContext(true),
                    "queries/get-ghost.sqts",
                ),
            CompilerErrorCode.MissingModelTable,
        );
    });
});

function parseOperation(input: string): SqtsOperation {
    return parseDocument(input).operations[0]!;
}

function createCompileContext(modelTypes: boolean): CompileContext {
    return {
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
        schema: buildSqliteSchema([
            parseSqlite(`
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL
);
            `),
        ]),
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
