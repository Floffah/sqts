import {
    buildSqliteSchema,
    parseSql,
    type SelectStatement,
    type SqliteSchema,
} from "@sqts/sql";
import { expect } from "bun:test";

import { CompilerError, type CompilerErrorCode } from "@/compiler/errors.ts";
import type { CompileContext } from "@/compiler/getCompileContext.ts";
import { parseDocument, type SqtsOperation } from "@/parser";

interface CreateTestCompileContextOptions {
    modelTypes?: boolean;
    executorModule?: string;
    schemaDir?: string;
    outDir?: string;
    tsCompilerOptions?: CompileContext["tsCompilerOptions"];
}

export function createTestCompileContext(
    schema: SqliteSchema,
    options: CreateTestCompileContextOptions = {},
): CompileContext {
    return {
        schema,
        tsCompilerOptions: options.tsCompilerOptions,
        config: {
            executor: {
                module:
                    options.executorModule ?? "@sqts/core/adapters/bun-sqlite",
            },
            compiler: {
                schemaDir: options.schemaDir ?? "migrations",
                outDir: options.outDir ?? ".sqts",
                modelTypes: options.modelTypes ?? true,
            },
        },
    };
}

export function createTestCompileContextFromSql(
    schemaSql: string | string[],
    options: CreateTestCompileContextOptions = {},
): CompileContext {
    const sqlPrograms = Array.isArray(schemaSql) ? schemaSql : [schemaSql];
    const schema = buildSqliteSchema(sqlPrograms.map((sql) => parseSql(sql)));
    return createTestCompileContext(schema, options);
}

export function parseSingleOperation(input: string): SqtsOperation {
    return parseDocument(input).operations[0]!;
}

export function parseSqlExpectSelect(input: string): SelectStatement {
    const statement = parseSql(input).statements[0];
    if (!statement || statement.kind !== "select") {
        throw new Error("Expected select statement");
    }
    return statement;
}

export async function expectCompilerErrorCode(
    run: (() => unknown | Promise<unknown>) | Promise<unknown>,
    code: CompilerErrorCode,
): Promise<void> {
    try {
        if (typeof run === "function") {
            await run();
        } else {
            await run;
        }
        throw new Error(`Expected CompilerError(${code})`);
    } catch (error) {
        if (!(error instanceof CompilerError)) {
            throw error;
        }
        expect(error.code).toBe(code);
    }
}
