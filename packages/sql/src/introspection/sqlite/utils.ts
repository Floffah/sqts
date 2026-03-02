import type { SchemaProvenance, SqliteForeignKey } from "@/introspection";
import { DEFAULT_SCHEMA_NAME } from "@/introspection/sqlite/index.ts";
import type { ForeignKeyReferenceNode, SourceSpan } from "@/parser";

export function toForeignKey(
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

export function toProvenance(
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
