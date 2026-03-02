import {
    createNormalizedTable,
    SchemaBuildError,
    SchemaBuildErrorCode,
    type SqliteSchema,
} from "@/introspection";
import { DEFAULT_SCHEMA_NAME } from "@/introspection/sqlite/index.ts";
import type { SqlProgram } from "@/parser";

export function buildSqliteSchema(programs: SqlProgram[]): SqliteSchema {
    const schema: SqliteSchema = {
        dialect: "sqlite",
        tables: {},
        tableOrder: [],
    };

    for (
        let programIndex = 0;
        programIndex < programs.length;
        programIndex += 1
    ) {
        const program = programs[programIndex]!;

        if (program.dialect !== "sqlite") {
            throw new SchemaBuildError({
                code: SchemaBuildErrorCode.UnsupportedDialect,
                message: `Unsupported dialect '${String(program.dialect)}' while building SQLite schema`,
                programIndex,
                statementIndex: -1,
                details: {
                    expected: "sqlite",
                    received: program.dialect,
                },
            });
        }

        for (
            let statementIndex = 0;
            statementIndex < program.statements.length;
            statementIndex += 1
        ) {
            const statement = program.statements[statementIndex]!;
            if (statement.kind !== "create_table") {
                continue;
            }

            if (statement.temporary) {
                continue;
            }

            const schemaName =
                statement.schema?.normalized ?? DEFAULT_SCHEMA_NAME;
            const tableName = statement.name.normalized;
            const tableKey = schemaName + "." + tableName;

            if (schema.tables[tableKey]) {
                if (statement.ifNotExists) {
                    continue;
                }

                throw new SchemaBuildError({
                    code: SchemaBuildErrorCode.DuplicateTable,
                    message: `Table '${tableKey}' already exists`,
                    programIndex,
                    statementIndex,
                    tableKey,
                });
            }

            schema.tables[tableKey] = createNormalizedTable(
                statement,
                tableKey,
                schemaName,
                tableName,
                programIndex,
                statementIndex,
            );
            schema.tableOrder.push(tableKey);
        }
    }

    return schema;
}
