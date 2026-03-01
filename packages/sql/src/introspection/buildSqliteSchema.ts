import {
    SchemaBuildError,
    SchemaBuildErrorCode,
} from "@/introspection/errors.ts";
import type {
    SchemaProvenance,
    SqliteForeignKey,
    SqliteSchema,
    SqliteSchemaColumn,
    SqliteSchemaTable,
    SqliteTablePrimaryKey,
} from "@/introspection/types.ts";
import type {
    ColumnConstraintNode,
    ColumnDefinition,
    CreateTableStatement,
    ForeignKeyReferenceNode,
    SourceSpan,
    SqlProgram,
} from "@/parser/ast.ts";
import { SqliteAffinity } from "@/parser/ast.ts";

interface WorkingColumn {
    name: string;
    rawName: string;
    declaredType?: string;
    typeBaseName?: string;
    affinity: SqliteAffinity;
    typeArgs?: number[];
    explicitNullable?: boolean;
    defaultExpression?: string;
    collation?: string;
    primaryKey: boolean;
    autoincrement: boolean;
    unique: boolean;
    checks: string[];
    references?: SqliteForeignKey;
    provenance: SchemaProvenance;
}

const DEFAULT_SCHEMA_NAME = "main";

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

            applyCreateTableStatement(
                schema,
                statement,
                programIndex,
                statementIndex,
            );
        }
    }

    return schema;
}

function applyCreateTableStatement(
    schema: SqliteSchema,
    statement: CreateTableStatement,
    programIndex: number,
    statementIndex: number,
): void {
    if (statement.temporary) {
        return;
    }

    const schemaName = statement.schema?.normalized ?? DEFAULT_SCHEMA_NAME;
    const tableName = statement.name.normalized;
    const tableKey = toTableKey(schemaName, tableName);

    if (schema.tables[tableKey]) {
        if (statement.ifNotExists) {
            return;
        }

        throw new SchemaBuildError({
            code: SchemaBuildErrorCode.DuplicateTable,
            message: `Table '${tableKey}' already exists`,
            programIndex,
            statementIndex,
            tableKey,
        });
    }

    const normalizedTable = createNormalizedTable(
        statement,
        tableKey,
        schemaName,
        tableName,
        programIndex,
        statementIndex,
    );

    schema.tables[tableKey] = normalizedTable;
    schema.tableOrder.push(tableKey);
}

function createNormalizedTable(
    statement: CreateTableStatement,
    tableKey: string,
    schemaName: string,
    tableName: string,
    programIndex: number,
    statementIndex: number,
): SqliteSchemaTable {
    const columns: Record<string, WorkingColumn> = {};
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

function createWorkingColumn(
    column: ColumnDefinition,
    programIndex: number,
    statementIndex: number,
): WorkingColumn {
    const state: WorkingColumn = {
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
    column: WorkingColumn,
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

function finalizeColumns(
    columns: Record<string, WorkingColumn>,
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

function toForeignKey(
    reference: ForeignKeyReferenceNode,
    localColumns: string[],
    name?: string,
): SqliteForeignKey {
    return {
        columns: localColumns,
        references: {
            schema: DEFAULT_SCHEMA_NAME,
            table: reference.table.normalized,
            columns: reference.columns.map((column) => column.normalized),
        },
        onDelete: reference.onDelete,
        onUpdate: reference.onUpdate,
        match: reference.match,
        deferrable: reference.deferrable,
        initially: reference.initially,
        name,
    };
}

function assertColumnsExist(
    names: string[],
    columns: Record<string, WorkingColumn>,
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

function toTableKey(schema: string, table: string): string {
    return `${schema}.${table}`;
}

function toProvenance(
    programIndex: number,
    statementIndex: number,
    span: SourceSpan,
): SchemaProvenance {
    return {
        programIndex,
        statementIndex,
        spanStartOffset: span.start.offset,
        spanEndOffset: span.end.offset,
    };
}

function assertNever(value: never): never {
    throw new SchemaBuildError({
        code: SchemaBuildErrorCode.InternalInvariant,
        message: `Unexpected node encountered while building schema: ${JSON.stringify(value)}`,
        programIndex: -1,
        statementIndex: -1,
    });
}
