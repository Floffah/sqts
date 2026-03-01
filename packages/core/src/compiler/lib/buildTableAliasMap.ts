import type { SelectStatement } from "@sqts/sql";

import { toTableKeyFromRef } from "@/compiler/lib/toTableKeyFromRef.ts";

export function buildTableAliasMap(
    select: SelectStatement,
): Map<string, string> {
    const aliasMap = new Map<string, string>();
    if (!select.from) {
        return aliasMap;
    }

    const refs = [
        select.from.base,
        ...select.from.joins.map((join) => join.table),
    ];

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
