import type { SqtsStatement } from "@/parser/types.ts";

export function extractOperationPlaceholders(
    statements: SqtsStatement[],
): string[] {
    const placeholders: string[] = [];
    const seen = new Set<string>();

    for (const statement of statements) {
        const extracted = extractPlaceholders(statement.sql);
        for (const placeholder of extracted) {
            if (!seen.has(placeholder)) {
                seen.add(placeholder);
                placeholders.push(placeholder);
            }
        }
    }

    return placeholders;
}

function extractPlaceholders(sql: string): string[] {
    const placeholders: string[] = [];
    const seen = new Set<string>();

    let cursor = 0;
    let quote: "'" | '"' | "`" | "[" | null = null;
    let inLineComment = false;
    let inBlockComment = false;

    while (cursor < sql.length) {
        const char = sql[cursor]!;
        const next = sql[cursor + 1];

        if (inLineComment) {
            if (char === "\n") {
                inLineComment = false;
            }
            cursor += 1;
            continue;
        }

        if (inBlockComment) {
            if (char === "*" && next === "/") {
                inBlockComment = false;
                cursor += 2;
                continue;
            }
            cursor += 1;
            continue;
        }

        if (quote !== null) {
            if (quote === "[") {
                if (char === "]") {
                    quote = null;
                }
                cursor += 1;
                continue;
            }

            if (char === quote) {
                const escaped = next === quote;
                if (escaped) {
                    cursor += 2;
                    continue;
                }
                quote = null;
                cursor += 1;
                continue;
            }

            cursor += 1;
            continue;
        }

        if (char === "-" && next === "-") {
            inLineComment = true;
            cursor += 2;
            continue;
        }

        if (char === "/" && next === "*") {
            inBlockComment = true;
            cursor += 2;
            continue;
        }

        if (char === "'" || char === '"' || char === "`") {
            quote = char;
            cursor += 1;
            continue;
        }

        if (char === "[") {
            quote = char;
            cursor += 1;
            continue;
        }

        if (char === "$" && isIdentifierStart(sql[cursor + 1])) {
            let end = cursor + 2;
            while (end < sql.length && isIdentifierPart(sql[end]!)) {
                end += 1;
            }

            const placeholder = sql.slice(cursor, end);
            if (!seen.has(placeholder)) {
                seen.add(placeholder);
                placeholders.push(placeholder);
            }

            cursor = end;
            continue;
        }

        cursor += 1;
    }

    return placeholders;
}

function isIdentifierStart(char: string | undefined): boolean {
    if (!char) {
        return false;
    }
    return /[A-Za-z_]/.test(char);
}

function isIdentifierPart(char: string): boolean {
    return /[A-Za-z0-9_]/.test(char);
}
