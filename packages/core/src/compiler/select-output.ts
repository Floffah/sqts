import { parseSqlite, type SelectStatement } from "@sqts/sql";

import type { CompileContext } from "@/compiler/context.ts";
import {
    CompilerError,
    CompilerErrorCode,
} from "@/compiler/errors.ts";
import {
    schemaTableToTypeLiteral,
    tableNameToTypeName,
} from "@/compiler/models.ts";
import { toTableKeyFromRef } from "@/compiler/identifier-resolution.ts";
import type { SqtsOperation } from "@/parser";

export function resolveSelectOutputInfo(
    operation: SqtsOperation,
    ctx: CompileContext,
    sourcePath: string,
): {
    returnType: string;
    modelImport?: string;
} | null {
    const firstSelect = parseFirstSelectFromOperation(operation, sourcePath);
    if (!firstSelect) {
        return null;
    }

    if (!firstSelect.from) {
        throw new CompilerError({
            code: CompilerErrorCode.MissingSelectFromClause,
            message: `Operation "${operation.name}" in "${sourcePath}" is SELECT-backed but has no FROM clause.`,
            sourcePath,
            operationName: operation.name,
        });
    }

    const baseTableKey = toTableKeyFromRef(
        firstSelect.from.base.schema?.normalized,
        firstSelect.from.base.name.normalized,
    );

    const table = ctx.schema.tables[baseTableKey];
    if (!table) {
        throw new CompilerError({
            code: CompilerErrorCode.MissingModelTable,
            message: `Operation "${operation.name}" in "${sourcePath}" references missing model table "${baseTableKey}".`,
            sourcePath,
            operationName: operation.name,
        });
    }

    if (ctx.config.compiler?.modelTypes) {
        const modelName = tableNameToTypeName(table.name);
        return {
            returnType: `${modelName}[]`,
            modelImport: modelName,
        };
    }

    return {
        returnType: `Array<${schemaTableToTypeLiteral(table)}>`,
    };
}

export function parseFirstSelectFromOperation(
    operation: SqtsOperation,
    sourcePath: string,
): SelectStatement | null {
    const firstStatement = operation.statements[0];
    if (!firstStatement) {
        return null;
    }

    let parsedProgram;
    try {
        parsedProgram = parseSqlite(`${firstStatement.sql};`);
    } catch (error) {
        const message = `Failed to parse first SQL statement for operation "${operation.name}" in "${sourcePath}": ${String(
            error instanceof Error ? error.message : error,
        )}`;
        throw new CompilerError({
            code: CompilerErrorCode.FailedToParseOperationSql,
            message,
            sourcePath,
            operationName: operation.name,
            cause: error,
        });
    }

    const firstParsedStatement = parsedProgram.statements[0];
    if (!firstParsedStatement || firstParsedStatement.kind !== "select") {
        return null;
    }

    return firstParsedStatement;
}
