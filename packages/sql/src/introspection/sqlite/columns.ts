import {
    type SqliteSchemaColumn,
    type SqliteTablePrimaryKey,
    type SQLiteWorkingColumn,
} from "@/introspection";
import { assertNever } from "@/introspection/sqlite/assert.ts";
import { toForeignKey, toProvenance } from "@/introspection/sqlite/utils.ts";
import {
    SqliteAffinity,
    type ColumnConstraintNode,
    type ColumnDefinition,
} from "@/parser";

export function createWorkingColumn(
    column: ColumnDefinition,
    programIndex: number,
    statementIndex: number,
): SQLiteWorkingColumn {
    const state: SQLiteWorkingColumn = {
        name: column.name.normalized,
        rawName: column.name.raw,
        declaredType: column.type?.declared,
        typeBaseName: column.type?.baseName,
        affinity: column.type?.affinity ?? SqliteAffinity.Unknown,
        typeArgs: column.type?.args,
        defaultExpression: undefined,
        collation: undefined,
        explicitNullable: undefined,
        primaryKey: false,
        autoincrement: false,
        unique: false,
        checks: [],
        references: undefined,
        provenance: toProvenance(programIndex, statementIndex, column.span),
    };

    for (const constraint of column.constraints) {
        applyColumnConstraint(state, constraint);
    }

    return state;
}

function applyColumnConstraint(
    column: SQLiteWorkingColumn,
    constraint: ColumnConstraintNode,
): void {
    if (constraint.kind === "null") {
        column.explicitNullable = true;
        return;
    }

    if (constraint.kind === "not_null") {
        column.explicitNullable = false;
        return;
    }

    if (constraint.kind === "primary_key") {
        column.primaryKey = true;
        column.autoincrement = column.autoincrement || constraint.autoincrement;
        return;
    }

    if (constraint.kind === "unique") {
        column.unique = true;
        return;
    }

    if (constraint.kind === "default") {
        column.defaultExpression = constraint.rawExpression;
        return;
    }

    if (constraint.kind === "check") {
        column.checks.push(constraint.rawExpression);
        return;
    }

    if (constraint.kind === "collate") {
        column.collation = constraint.collation.normalized;
        return;
    }

    if (constraint.kind === "references") {
        column.references = toForeignKey(
            constraint.references,
            [column.name],
            constraint.name?.name.normalized,
        );
        return;
    }

    assertNever(constraint);
}

export function finalizeColumns(
    columns: Record<string, SQLiteWorkingColumn>,
    columnOrder: string[],
    primaryKey: SqliteTablePrimaryKey | null,
): Record<string, SqliteSchemaColumn> {
    const primaryKeyColumns = new Set(primaryKey?.columns ?? []);
    const normalizedColumns: Record<string, SqliteSchemaColumn> = {};

    for (const columnName of columnOrder) {
        const working = columns[columnName]!;

        let nullable = true;
        if (working.explicitNullable === false) {
            nullable = false;
        } else if (working.explicitNullable === true) {
            nullable = true;
        }

        if (working.primaryKey || primaryKeyColumns.has(columnName)) {
            nullable = false;
        }

        normalizedColumns[columnName] = {
            name: working.name,
            rawName: working.rawName,
            declaredType: working.declaredType,
            typeBaseName: working.typeBaseName,
            affinity: working.affinity,
            typeArgs: working.typeArgs,
            nullable,
            defaultExpression: working.defaultExpression,
            collation: working.collation,
            primaryKey: working.primaryKey || primaryKeyColumns.has(columnName),
            autoincrement: working.autoincrement,
            unique: working.unique,
            checks: working.checks,
            references: working.references,
            provenance: working.provenance,
        };
    }

    return normalizedColumns;
}
