export interface CompiledSqlAndParams {
    compiledSql: string;
    placeholderOrder: string[];
}

export function compileSqlAndParams(
    statementSql: string,
): CompiledSqlAndParams {
    const placeholderOrder: string[] = [];
    let compiledSql = "";

    let cursor = 0;
    let quote: "'" | '"' | "`" | "[" | null = null;
    let inLineComment = false;
    let inBlockComment = false;

    while (cursor < statementSql.length) {
        const char = statementSql[cursor]!;
        const next = statementSql[cursor + 1];

        if (inLineComment) {
            compiledSql += char;
            if (char === "\n") {
                inLineComment = false;
            }
            cursor += 1;
            continue;
        }

        if (inBlockComment) {
            compiledSql += char;
            if (char === "*" && next === "/") {
                compiledSql += "/";
                inBlockComment = false;
                cursor += 2;
                continue;
            }
            cursor += 1;
            continue;
        }

        if (quote !== null) {
            compiledSql += char;
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
                    compiledSql += next;
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
            compiledSql += "--";
            inLineComment = true;
            cursor += 2;
            continue;
        }

        if (char === "/" && next === "*") {
            compiledSql += "/*";
            inBlockComment = true;
            cursor += 2;
            continue;
        }

        if (char === "'" || char === '"' || char === "`") {
            quote = char;
            compiledSql += char;
            cursor += 1;
            continue;
        }

        if (char === "[") {
            quote = char;
            compiledSql += char;
            cursor += 1;
            continue;
        }

        if (char === "$" && isIdentifierStart(statementSql[cursor + 1])) {
            let end = cursor + 2;
            while (
                end < statementSql.length &&
                isIdentifierPart(statementSql[end]!)
            ) {
                end += 1;
            }

            placeholderOrder.push(statementSql.slice(cursor + 1, end));
            compiledSql += "?";
            cursor = end;
            continue;
        }

        compiledSql += char;
        cursor += 1;
    }

    return {
        compiledSql,
        placeholderOrder,
    };
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
