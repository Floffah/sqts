import type { IdentifierNode, SelectStatement } from "@sqts/sql";

import type { CompileContext } from "@/compiler/context.ts";
import {
    CompilerError,
    CompilerErrorCode,
} from "@/compiler/errors.ts";
import { schemaColumnToType } from "@/compiler/models.ts";
import type { SqtsOperation } from "@/parser";

export function resolveIdentifierType(
    path: IdentifierNode[],
    operation: SqtsOperation,
    sourcePath: string,
    ctx: CompileContext,
    aliasMap: Map<string, string>,
    select: SelectStatement,
): string {
    const normalizedParts = path.map((part) => part.normalized);

    let tableKey: string;
    let columnName: string;

    if (normalizedParts.length === 1) {
        if (!select.from) {
            throw new CompilerError({
                code: CompilerErrorCode.AmbiguousIdentifier,
                message: `Unable to resolve identifier "${normalizedParts.join(".")}" for type inference in operation "${operation.name}" (${sourcePath}).`,
                sourcePath,
                operationName: operation.name,
            });
        }

        const totalTables = 1 + select.from.joins.length;
        if (totalTables !== 1) {
            throw new CompilerError({
                code: CompilerErrorCode.AmbiguousIdentifier,
                message: `Ambiguous unqualified identifier "${normalizedParts[0]}" in operation "${operation.name}" (${sourcePath}). Qualify with table alias for inference.`,
                sourcePath,
                operationName: operation.name,
            });
        }

        tableKey = toTableKeyFromRef(
            select.from.base.schema?.normalized,
            select.from.base.name.normalized,
        );
        columnName = normalizedParts[0]!;
    } else if (normalizedParts.length === 2) {
        const tableAlias = normalizedParts[0]!;
        const resolvedTableKey = aliasMap.get(tableAlias);
        if (!resolvedTableKey) {
            throw new CompilerError({
                code: CompilerErrorCode.UnresolvedTableAlias,
                message: `Unable to resolve table/alias "${tableAlias}" in operation "${operation.name}" (${sourcePath}) for placeholder inference.`,
                sourcePath,
                operationName: operation.name,
            });
        }

        tableKey = resolvedTableKey;
        columnName = normalizedParts[1]!;
    } else if (normalizedParts.length === 3) {
        tableKey = `${normalizedParts[0]}.${normalizedParts[1]}`;
        columnName = normalizedParts[2]!;
    } else {
        throw new CompilerError({
            code: CompilerErrorCode.UnsupportedIdentifierPath,
            message: `Unsupported identifier path "${normalizedParts.join(".")}" in operation "${operation.name}" (${sourcePath}) for placeholder inference.`,
            sourcePath,
            operationName: operation.name,
        });
    }

    const table = ctx.schema.tables[tableKey];
    if (!table) {
        throw new CompilerError({
            code: CompilerErrorCode.UnresolvedTable,
            message: `Unable to resolve table "${tableKey}" from identifier "${normalizedParts.join(".")}" in operation "${operation.name}" (${sourcePath}).`,
            sourcePath,
            operationName: operation.name,
        });
    }

    const column = table.columns[columnName];
    if (!column) {
        throw new CompilerError({
            code: CompilerErrorCode.UnresolvedColumn,
            message: `Unable to resolve column "${columnName}" on table "${tableKey}" from identifier "${normalizedParts.join(".")}" in operation "${operation.name}" (${sourcePath}).`,
            sourcePath,
            operationName: operation.name,
        });
    }

    return schemaColumnToType(column.affinity, column.nullable);
}

export function buildTableAliasMap(select: SelectStatement): Map<string, string> {
    const aliasMap = new Map<string, string>();
    if (!select.from) {
        return aliasMap;
    }

    const refs = [select.from.base, ...select.from.joins.map((join) => join.table)];

    for (const ref of refs) {
        const tableKey = toTableKeyFromRef(
            ref.schema?.normalized,
            ref.name.normalized,
        );

        aliasMap.set(ref.name.normalized, tableKey);
        if (ref.alias) {
            aliasMap.set(ref.alias.normalized, tableKey);
        }
    }

    return aliasMap;
}

export function toTableKeyFromRef(
    schema: string | undefined,
    table: string,
): string {
    return `${schema ?? "main"}.${table}`;
}

export function stripPlaceholderPrefix(value: string): string {
    return value.startsWith("$") ? value.slice(1) : value;
}
