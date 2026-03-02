import { parseSql, type SelectStatement } from "@sqts/sql";

import { CompilerError, CompilerErrorCode } from "@/compiler/errors.ts";
import type { SqtsOperation } from "@/parser";

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
        parsedProgram = parseSql(`${firstStatement.sql};`);
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
