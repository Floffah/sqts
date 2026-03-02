import { SqliteAffinity } from "@/parser/ast.ts";

export function inferSqliteAffinity(declaredType: string): SqliteAffinity {
    const upper = declaredType.trim().toUpperCase();

    if (upper.length === 0) {
        return SqliteAffinity.Unknown;
    }

    if (upper.includes("INT")) {
        return SqliteAffinity.Integer;
    }

    if (
        upper.includes("CHAR") ||
        upper.includes("CLOB") ||
        upper.includes("TEXT")
    ) {
        return SqliteAffinity.Text;
    }

    if (upper.includes("BLOB") || upper.length === 0) {
        return SqliteAffinity.Blob;
    }

    if (
        upper.includes("REAL") ||
        upper.includes("FLOA") ||
        upper.includes("DOUB")
    ) {
        return SqliteAffinity.Real;
    }

    if (
        upper.includes("NUM") ||
        upper.includes("DEC") ||
        upper.includes("BOOL") ||
        upper.includes("DATE") ||
        upper.includes("TIME")
    ) {
        return SqliteAffinity.Numeric;
    }

    return SqliteAffinity.Numeric;
}

export function parseTypeArguments(typeText: string): number[] | undefined {
    const match = /\(([^)]*)\)/.exec(typeText);
    if (!match) {
        return undefined;
    }

    const values = match[1]
        ?.split(",")
        .map((part) => part.trim())
        .filter((part) => part.length > 0)
        .map((part) => Number(part));

    if (
        !values ||
        values.length === 0 ||
        values.some((value) => Number.isNaN(value))
    ) {
        return undefined;
    }

    return values;
}
