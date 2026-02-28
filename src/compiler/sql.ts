import { compilerError } from "@/compiler/errors.ts";
import type { MappingDescriptor, OutputDeclaration } from "@/compiler/types.ts";

interface SelectBounds {
    selectStart: number;
    selectEnd: number;
    fromStart: number;
}

function isWordBoundary(char: string | undefined) {
    if (!char) {
        return true;
    }
    return !/[A-Za-z0-9_]/.test(char);
}

function matchesKeyword(sql: string, index: number, keyword: string) {
    const slice = sql.slice(index, index + keyword.length);
    if (slice.toLowerCase() !== keyword) {
        return false;
    }
    return (
        isWordBoundary(sql[index - 1]) &&
        isWordBoundary(sql[index + keyword.length])
    );
}

function findTopLevelSelectBounds(sql: string): SelectBounds | null {
    let depth = 0;
    let inSingleQuote = false;
    let inDoubleQuote = false;
    let inLineComment = false;
    let inBlockComment = false;
    let selectStart = -1;
    let fromStart = -1;

    for (let i = 0; i < sql.length; i++) {
        const ch = sql[i]!;
        const next = sql[i + 1] ?? "";

        if (inLineComment) {
            if (ch === "\n") {
                inLineComment = false;
            }
            continue;
        }

        if (inBlockComment) {
            if (ch === "*" && next === "/") {
                inBlockComment = false;
                i++;
            }
            continue;
        }

        if (!inDoubleQuote && ch === "'") {
            inSingleQuote = !inSingleQuote;
            continue;
        }

        if (!inSingleQuote && ch === '"') {
            inDoubleQuote = !inDoubleQuote;
            continue;
        }

        if (inSingleQuote || inDoubleQuote) {
            continue;
        }

        if (ch === "-" && next === "-") {
            inLineComment = true;
            i++;
            continue;
        }

        if (ch === "/" && next === "*") {
            inBlockComment = true;
            i++;
            continue;
        }

        if (ch === "(") {
            depth++;
            continue;
        }
        if (ch === ")") {
            depth = Math.max(0, depth - 1);
            continue;
        }

        if (depth !== 0) {
            continue;
        }

        if (selectStart === -1 && matchesKeyword(sql, i, "select")) {
            selectStart = i;
            i += "select".length - 1;
            continue;
        }

        if (selectStart !== -1 && matchesKeyword(sql, i, "from")) {
            fromStart = i;
            break;
        }
    }

    if (selectStart === -1 || fromStart === -1) {
        return null;
    }

    return {
        selectStart,
        selectEnd: selectStart + "select".length,
        fromStart,
    };
}

export function hasTopLevelSelectQuery(sql: string) {
    return findTopLevelSelectBounds(sql) !== null;
}

function splitTopLevelSelectItems(selectList: string) {
    const items: string[] = [];
    let start = 0;
    let depth = 0;
    let inSingleQuote = false;
    let inDoubleQuote = false;

    for (let i = 0; i < selectList.length; i++) {
        const ch = selectList[i]!;

        if (!inDoubleQuote && ch === "'") {
            inSingleQuote = !inSingleQuote;
            continue;
        }
        if (!inSingleQuote && ch === '"') {
            inDoubleQuote = !inDoubleQuote;
            continue;
        }
        if (inSingleQuote || inDoubleQuote) {
            continue;
        }
        if (ch === "(") {
            depth++;
            continue;
        }
        if (ch === ")") {
            depth = Math.max(0, depth - 1);
            continue;
        }
        if (ch === "," && depth === 0) {
            items.push(selectList.slice(start, i).trim());
            start = i + 1;
        }
    }

    const finalItem = selectList.slice(start).trim();
    if (finalItem) {
        items.push(finalItem);
    }

    return items.filter(Boolean);
}

function findLastTopLevelAs(item: string) {
    let lastAs = -1;
    let depth = 0;
    let inSingleQuote = false;
    let inDoubleQuote = false;

    for (let i = 0; i < item.length; i++) {
        const ch = item[i]!;
        if (!inDoubleQuote && ch === "'") {
            inSingleQuote = !inSingleQuote;
            continue;
        }
        if (!inSingleQuote && ch === '"') {
            inDoubleQuote = !inDoubleQuote;
            continue;
        }
        if (inSingleQuote || inDoubleQuote) {
            continue;
        }
        if (ch === "(") {
            depth++;
            continue;
        }
        if (ch === ")") {
            depth = Math.max(0, depth - 1);
            continue;
        }
        if (depth === 0 && matchesKeyword(item, i, "as")) {
            lastAs = i;
            i += 1;
        }
    }

    return lastAs;
}

function parseAliasToken(aliasToken: string) {
    const trimmed = aliasToken.trim();
    if (!trimmed) {
        return null;
    }

    const quoteStart = trimmed[0]!;
    if (
        (quoteStart === '"' || quoteStart === "'" || quoteStart === "`") &&
        trimmed[trimmed.length - 1] === quoteStart
    ) {
        return trimmed.slice(1, -1);
    }

    if (quoteStart === "[" && trimmed[trimmed.length - 1] === "]") {
        return trimmed.slice(1, -1);
    }

    if (/^[A-Za-z_][A-Za-z0-9_.[\]]*$/.test(trimmed)) {
        return trimmed;
    }

    return null;
}

function validateAliasPath(
    aliasPath: string,
    output: OutputDeclaration,
    filename: string,
): string[] {
    const expectedPrefix =
        output.mode === "many"
            ? `${output.rootName}[].`
            : `${output.rootName}.`;

    if (!aliasPath.startsWith(expectedPrefix)) {
        compilerError(
            filename,
            `Alias "${aliasPath}" must start with "${expectedPrefix}"`,
        );
    }

    const relativePath = aliasPath.slice(expectedPrefix.length);
    if (!relativePath) {
        compilerError(filename, `Alias "${aliasPath}" is missing a field path`);
    }

    const segments = relativePath.split(".");
    if (segments.some((segment) => segment.length === 0)) {
        compilerError(
            filename,
            `Alias "${aliasPath}" contains an empty segment`,
        );
    }
    if (segments.some((segment) => segment.includes("[]"))) {
        compilerError(
            filename,
            `Alias "${aliasPath}" contains unsupported nested array paths`,
        );
    }
    if (
        segments.some(
            (segment) => segment.includes("[") || segment.includes("]"),
        )
    ) {
        compilerError(filename, `Alias "${aliasPath}" has invalid path syntax`);
    }

    return segments;
}

function escapeSqlAlias(aliasPath: string) {
    return aliasPath.replace(/"/g, `""`);
}

export function parseSqlVariables(sql: string) {
    let output = "";
    const variableNames: string[] = [];
    let i = 0;
    let inSingleQuote = false;
    let inDoubleQuote = false;
    let inlineComment = false;
    let inBlockComment = false;

    while (i < sql.length) {
        const char = sql[i]!;
        const next = sql[i + 1] ?? "";

        if (inlineComment) {
            output += char;
            if (char === "\n") {
                inlineComment = false;
            }
            i++;
            continue;
        }

        if (inBlockComment) {
            output += char;
            if (char === "*" && next === "/") {
                output += "/";
                i += 2;
                inBlockComment = false;
            } else {
                i++;
            }
            continue;
        }

        if (!inDoubleQuote && char === "'") {
            inSingleQuote = !inSingleQuote;
            output += char;
            i++;
            continue;
        }

        if (!inSingleQuote && char === '"') {
            inDoubleQuote = !inDoubleQuote;
            output += char;
            i++;
            continue;
        }

        if (!inSingleQuote && !inDoubleQuote && char === "-" && next === "-") {
            inlineComment = true;
            output += "--";
            i += 2;
            continue;
        }

        if (!inSingleQuote && !inDoubleQuote && char === "/" && next === "*") {
            inBlockComment = true;
            output += "/*";
            i += 2;
            continue;
        }

        if (
            !inSingleQuote &&
            !inDoubleQuote &&
            char === "$" &&
            /[A-Za-z_]/.test(next)
        ) {
            let end = i + 2;
            while (end < sql.length && /[A-Za-z0-9_]/.test(sql[end]!)) {
                end++;
            }
            variableNames.push(sql.slice(i + 1, end));
            output += "?";
            i = end;
            continue;
        }

        output += char;
        i++;
    }

    return {
        sql: output,
        variableNames,
    };
}

export function normalizeSelectAliases(
    sql: string,
    output: OutputDeclaration,
    filename: string,
) {
    const bounds = findTopLevelSelectBounds(sql);
    if (!bounds) {
        compilerError(
            filename,
            "Missing top-level SELECT ... FROM in SQL block",
        );
    }

    const selectList = sql.slice(bounds.selectEnd, bounds.fromStart);
    const items = splitTopLevelSelectItems(selectList);
    if (items.length === 0) {
        compilerError(filename, "SELECT list is empty");
    }

    const normalizedItems: string[] = [];
    const mappings: MappingDescriptor[] = [];

    for (const item of items) {
        const asIndex = findLastTopLevelAs(item);
        if (asIndex === -1) {
            compilerError(
                filename,
                `SELECT item is missing an AS alias: "${item.trim()}"`,
            );
        }

        const expression = item.slice(0, asIndex).trim();
        const aliasToken = item.slice(asIndex + 2).trim();
        if (!expression) {
            compilerError(
                filename,
                `SELECT item has no expression: "${item.trim()}"`,
            );
        }

        const aliasPath = parseAliasToken(aliasToken);
        if (!aliasPath) {
            compilerError(
                filename,
                `Unsupported alias syntax in SELECT item: "${item.trim()}"`,
            );
        }

        const targetPath = validateAliasPath(aliasPath, output, filename);
        const normalizedAlias = `"${escapeSqlAlias(aliasPath)}"`;

        normalizedItems.push(`${expression} AS ${normalizedAlias}`);
        mappings.push({
            aliasKey: aliasPath,
            targetPath,
        });
    }

    const normalizedSql =
        sql.slice(0, bounds.selectEnd) +
        " " +
        normalizedItems.join(", ") +
        " " +
        sql.slice(bounds.fromStart);

    return {
        sql: normalizedSql,
        mappings,
    };
}
