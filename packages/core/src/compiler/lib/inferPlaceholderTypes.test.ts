import { buildSqliteSchema, parseSql } from "@sqts/sql";
import { describe, expect, it } from "bun:test";

import { CompilerError, CompilerErrorCode } from "@/compiler/errors.ts";
import type { CompileContext } from "@/compiler/getCompileContext.ts";
import { inferPlaceholderTypes } from "@/compiler/lib/inferPlaceholderTypes.ts";
import { parseDocument, type SqtsOperation } from "@/parser";

describe("inferPlaceholderTypes", () => {
    it("infers placeholder types from supported equality expressions", () => {
        const operation = parseOperation(
            "GetUser => SELECT * FROM users u WHERE u.id = $id AND $email = u.email;",
        );
        const inferred = inferPlaceholderTypes(
            operation,
            createCompileContext(),
            "queries/get-user.sqts",
        );

        expect(inferred.get("id")).toBe("number");
        expect(inferred.get("email")).toBe("string");
    });

    it("leaves placeholders unknown when no supported inference shape exists", () => {
        const operation = parseOperation(
            "GetUser => SELECT * FROM users WHERE COALESCE(users.id, 0) = $id;",
        );
        const inferred = inferPlaceholderTypes(
            operation,
            createCompileContext(),
            "queries/get-user.sqts",
        );

        expect(inferred.has("id")).toBe(false);
    });

    it("throws on conflicting placeholder type inference", () => {
        const operation = parseOperation(
            "GetUser => SELECT * FROM users WHERE users.id = $id OR users.email = $id;",
        );

        expectCompilerErrorCode(
            () =>
                inferPlaceholderTypes(
                    operation,
                    createCompileContext(),
                    "queries/get-user.sqts",
                ),
            CompilerErrorCode.ConflictingPlaceholderType,
        );
    });
});

function parseOperation(input: string): SqtsOperation {
    return parseDocument(input).operations[0]!;
}

function createCompileContext(): CompileContext {
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
        schema: buildSqliteSchema([
            parseSql(`
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
