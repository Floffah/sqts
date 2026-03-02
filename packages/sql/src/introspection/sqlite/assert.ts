import {
    SchemaBuildError,
    SchemaBuildErrorCode,
    type SQLiteWorkingColumn,
} from "@/introspection";

export function assertNever(value: never): never {
    throw new SchemaBuildError({
        code: SchemaBuildErrorCode.InternalInvariant,
        message: `Unexpected node encountered while building schema: ${JSON.stringify(value)}`,
        programIndex: -1,
        statementIndex: -1,
    });
}

export function assertColumnsExist(
    names: string[],
    columns: Record<string, SQLiteWorkingColumn>,
    context: {
        programIndex: number;
        statementIndex: number;
        tableKey: string;
    },
    constraintKind: string,
): void {
    for (const name of names) {
        if (columns[name]) {
            continue;
        }

        throw new SchemaBuildError({
            code: SchemaBuildErrorCode.InvalidReference,
            message: `Unknown column '${name}' referenced by ${constraintKind} in table '${context.tableKey}'`,
            programIndex: context.programIndex,
            statementIndex: context.statementIndex,
            tableKey: context.tableKey,
            details: {
                column: name,
                constraint: constraintKind,
            },
        });
    }
}
