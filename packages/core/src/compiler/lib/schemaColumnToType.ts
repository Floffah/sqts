import { SqliteAffinity } from "@sqts/sql";

export function schemaColumnToType(
    affinity: SqliteAffinity,
    nullable: boolean,
): string {
    const baseType = sqliteAffinityToType(affinity);
    if (!nullable) {
        return baseType;
    }
    return `${baseType} | null`;
}

function sqliteAffinityToType(affinity: SqliteAffinity): string {
    switch (affinity) {
        case SqliteAffinity.Integer:
        case SqliteAffinity.Real:
        case SqliteAffinity.Numeric:
            return "number";
        case SqliteAffinity.Text:
            return "string";
        case SqliteAffinity.Blob:
            return "Uint8Array | string | unknown";
        case SqliteAffinity.Unknown:
            return "unknown";
    }
}
