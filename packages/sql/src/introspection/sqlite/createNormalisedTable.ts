import {
    SchemaBuildError,
    SchemaBuildErrorCode,
    type SqliteSchemaTable,
    type SqliteTablePrimaryKey,
    type SQLiteWorkingColumn,
} from "@/introspection";
import {
    assertColumnsExist,
    assertNever,
} from "@/introspection/sqlite/assert.ts";
import {
    createWorkingColumn,
    finalizeColumns,
} from "@/introspection/sqlite/columns.ts";
import { toForeignKey, toProvenance } from "@/introspection/sqlite/utils.ts";
import type { CreateTableStatement } from "@/parser";

export function createNormalizedTable(
    statement: CreateTableStatement,
    tableKey: string,
    schemaName: string,
    tableName: string,
    programIndex: number,
    statementIndex: number,
): SqliteSchemaTable {
    const columns: Record<string, SQLiteWorkingColumn> = {};
    const columnOrder: string[] = [];
    const uniqueConstraints: SqliteSchemaTable["uniqueConstraints"] = [];
    const checkConstraints: SqliteSchemaTable["checkConstraints"] = [];
    const foreignKeys: SqliteSchemaTable["foreignKeys"] = [];

    for (const columnNode of statement.columns) {
        const columnName = columnNode.name.normalized;

        if (columns[columnName]) {
            throw new SchemaBuildError({
                code: SchemaBuildErrorCode.InternalInvariant,
                message: `Duplicate column '${columnName}' found while building table '${tableKey}'`,
                programIndex,
                statementIndex,
                tableKey,
            });
        }

        const workingColumn = createWorkingColumn(
            columnNode,
            programIndex,
            statementIndex,
        );

        columns[columnName] = workingColumn;
        columnOrder.push(columnName);

        if (workingColumn.references) {
            foreignKeys.push(workingColumn.references);
        }
    }

    let primaryKey: SqliteTablePrimaryKey | null = null;

    for (const tableConstraint of statement.tableConstraints) {
        if (tableConstraint.kind === "primary_key") {
            const primaryKeyColumns = tableConstraint.columns.map(
                (column) => column.column.normalized,
            );

            assertColumnsExist(
                primaryKeyColumns,
                columns,
                {
                    programIndex,
                    statementIndex,
                    tableKey,
                },
                "primary key",
            );

            primaryKey = {
                columns: primaryKeyColumns,
                source: "table",
            };

            for (const columnName of primaryKeyColumns) {
                const column = columns[columnName]!;
                column.primaryKey = true;
            }

            continue;
        }

        if (tableConstraint.kind === "unique") {
            const uniqueColumns = tableConstraint.columns.map(
                (column) => column.column.normalized,
            );

            assertColumnsExist(
                uniqueColumns,
                columns,
                {
                    programIndex,
                    statementIndex,
                    tableKey,
                },
                "unique constraint",
            );

            uniqueConstraints.push({
                name: tableConstraint.name?.name.normalized,
                columns: uniqueColumns,
            });
            continue;
        }

        if (tableConstraint.kind === "check") {
            checkConstraints.push({
                name: tableConstraint.name?.name.normalized,
                expression: tableConstraint.rawExpression,
            });
            continue;
        }

        if (tableConstraint.kind === "foreign_key") {
            const localColumns = tableConstraint.columns.map(
                (column) => column.normalized,
            );

            assertColumnsExist(
                localColumns,
                columns,
                {
                    programIndex,
                    statementIndex,
                    tableKey,
                },
                "foreign key",
            );

            foreignKeys.push(
                toForeignKey(
                    tableConstraint.references,
                    localColumns,
                    tableConstraint.name?.name.normalized,
                ),
            );
            continue;
        }

        assertNever(tableConstraint);
    }

    if (!primaryKey) {
        const primaryKeyColumns = columnOrder.filter(
            (columnName) => columns[columnName]!.primaryKey,
        );

        if (primaryKeyColumns.length > 0) {
            primaryKey = {
                columns: primaryKeyColumns,
                source: "column",
            };
        }
    }

    const normalizedColumns = finalizeColumns(columns, columnOrder, primaryKey);

    return {
        key: tableKey,
        schema: schemaName,
        name: tableName,
        temporary: false,
        strict: statement.strict,
        withoutRowid: statement.withoutRowid,
        ifNotExists: statement.ifNotExists,
        columns: normalizedColumns,
        columnOrder,
        primaryKey,
        uniqueConstraints,
        checkConstraints,
        foreignKeys,
        provenance: toProvenance(programIndex, statementIndex, statement.span),
    };
}
