import { SqliteAffinity } from "@sqts/sql";

import { schemaColumnToType } from "@/compiler/lib/schemaColumnToType.ts";

export function schemaTableToTypeLiteral(table: {
    key: string;
    columnOrder: string[];
    columns: Record<
        string,
        {
            name: string;
            affinity: SqliteAffinity;
            nullable: boolean;
        }
    >;
}): string {
    const lines = table.columnOrder.map((columnName) => {
        const column = table.columns[columnName];
        if (!column) {
            throw new Error(
                `Schema invariant violation: column "${columnName}" was not found in table "${table.key}".`,
            );
        }

        return `    ${column.name}: ${schemaColumnToType(column.affinity, column.nullable)};`;
    });

    if (lines.length === 0) {
        return "{}";
    }

    return `{\n${lines.join("\n")}\n}`;
}
