import { parseSqlite, type SelectStatement } from "@sqts/sql";

import { CompilerError, CompilerErrorCode } from "@/compiler/errors.ts";

export interface ParsedOperationStatement {
    selectAst: SelectStatement | null;
    isRowProducing: boolean;
}

export function parseOperationStatement(options: {
    statementSql: string;
    operationName: string;
    sourcePath: string;
    statementIndex: number;
}): ParsedOperationStatement {
    let parsedProgram;
    try {
        parsedProgram = parseSqlite(`${options.statementSql};`);
    } catch (error) {
        throw new CompilerError({
            code: CompilerErrorCode.FailedToParseOperationSql,
            message: `Failed to parse SQL statement ${options.statementIndex} for operation "${options.operationName}" in "${options.sourcePath}": ${String(
                error instanceof Error ? error.message : error,
            )}`,
            sourcePath: options.sourcePath,
            operationName: options.operationName,
            cause: error,
            details: {
                statementIndex: options.statementIndex,
            },
        });
    }

    const parsedStatement = parsedProgram.statements[0];
    if (!parsedStatement || parsedStatement.kind !== "select") {
        return {
            selectAst: null,
            isRowProducing: false,
        };
    }

    return {
        selectAst: parsedStatement,
        isRowProducing: true,
    };
}
