export interface ScriptStatement {
    text: string;
    start: number;
    end: number;
    index: number;
}

export function splitSqlStatements(source: string): ScriptStatement[] {
    const statements: ScriptStatement[] = [];

    let start = 0;
    let inSingle = false;
    let inDouble = false;
    let inBacktick = false;
    let inBracket = false;
    let inLineComment = false;
    let inBlockComment = false;

    for (let i = 0; i < source.length; i += 1) {
        const char = source[i] ?? "";
        const next = source[i + 1] ?? "";

        if (inLineComment) {
            if (char === "\n") {
                inLineComment = false;
            }
            continue;
        }

        if (inBlockComment) {
            if (char === "*" && next === "/") {
                inBlockComment = false;
                i += 1;
            }
            continue;
        }

        if (inSingle) {
            if (char === "'" && next === "'") {
                i += 1;
                continue;
            }

            if (char === "'") {
                inSingle = false;
            }
            continue;
        }

        if (inDouble) {
            if (char === '"') {
                inDouble = false;
            }
            continue;
        }

        if (inBacktick) {
            if (char === "`") {
                inBacktick = false;
            }
            continue;
        }

        if (inBracket) {
            if (char === "]") {
                inBracket = false;
            }
            continue;
        }

        if (char === "-" && next === "-") {
            inLineComment = true;
            i += 1;
            continue;
        }

        if (char === "/" && next === "*") {
            inBlockComment = true;
            i += 1;
            continue;
        }

        if (char === "'") {
            inSingle = true;
            continue;
        }

        if (char === '"') {
            inDouble = true;
            continue;
        }

        if (char === "`") {
            inBacktick = true;
            continue;
        }

        if (char === "[") {
            inBracket = true;
            continue;
        }

        if (char === ";") {
            const end = i + 1;
            const text = source.slice(start, end);
            if (text.trim().length > 0) {
                statements.push({
                    text,
                    start,
                    end,
                    index: statements.length,
                });
            }
            start = end;
        }
    }

    if (start < source.length) {
        const text = source.slice(start, source.length);
        if (text.trim().length > 0) {
            statements.push({
                text,
                start,
                end: source.length,
                index: statements.length,
            });
        }
    }

    return statements;
}

export function isCreateTableStatement(statementText: string): boolean {
    const cleaned = stripLeadingTrivia(statementText);
    return /^CREATE\s+(TEMP|TEMPORARY\s+)?TABLE\b/i.test(cleaned);
}

export function isSelectStatement(statementText: string): boolean {
    const keyword = getLeadingKeyword(statementText);
    return keyword === "SELECT";
}

export function isWithStatement(statementText: string): boolean {
    const keyword = getLeadingKeyword(statementText);
    return keyword === "WITH";
}

export function stripLeadingTrivia(text: string): string {
    let cursor = 0;

    while (cursor < text.length) {
        const char = text[cursor] ?? "";
        const next = text[cursor + 1] ?? "";

        if (/\s/.test(char)) {
            cursor += 1;
            continue;
        }

        if (char === "-" && next === "-") {
            cursor += 2;
            while (cursor < text.length && text[cursor] !== "\n") {
                cursor += 1;
            }
            continue;
        }

        if (char === "/" && next === "*") {
            cursor += 2;
            while (cursor < text.length) {
                if (text[cursor] === "*" && text[cursor + 1] === "/") {
                    cursor += 2;
                    break;
                }
                cursor += 1;
            }
            continue;
        }

        break;
    }

    return text.slice(cursor);
}

export function getLeadingKeyword(text: string): string | undefined {
    const cleaned = stripLeadingTrivia(text);
    const match = /^([A-Za-z_]+)/.exec(cleaned);
    return match?.[1]?.toUpperCase();
}
