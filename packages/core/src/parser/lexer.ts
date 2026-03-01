export enum SqtsTokenKind {
    Identifier = "identifier",
    Arrow = "arrow",
    LParen = "l_paren",
    RParen = "r_paren",
    Semicolon = "semicolon",
    Whitespace = "whitespace",
    Comment = "comment",
    Unknown = "unknown",
    Eof = "eof",
}

export interface SqtsToken {
    kind: SqtsTokenKind;
    value: string;
    start: number;
    end: number;
}

export interface SqtsLexerOptions {
    includeTrivia?: boolean;
}

export function lexSqts(
    input: string,
    options: SqtsLexerOptions = {},
): SqtsToken[] {
    const includeTrivia = options.includeTrivia ?? true;
    const tokens: SqtsToken[] = [];
    let cursor = 0;

    while (cursor < input.length) {
        const start = cursor;
        const char = input[cursor]!;
        const next = input[cursor + 1];

        if (isWhitespace(char)) {
            cursor += 1;
            while (cursor < input.length && isWhitespace(input[cursor]!)) {
                cursor += 1;
            }

            maybePushToken(tokens, includeTrivia, {
                kind: SqtsTokenKind.Whitespace,
                value: input.slice(start, cursor),
                start,
                end: cursor,
            });
            continue;
        }

        if (char === "-" && next === "-") {
            cursor += 2;
            while (cursor < input.length && input[cursor] !== "\n") {
                cursor += 1;
            }

            maybePushToken(tokens, includeTrivia, {
                kind: SqtsTokenKind.Comment,
                value: input.slice(start, cursor),
                start,
                end: cursor,
            });
            continue;
        }

        if (char === "/" && next === "*") {
            cursor += 2;

            while (cursor < input.length) {
                if (input[cursor] === "*" && input[cursor + 1] === "/") {
                    cursor += 2;
                    break;
                }
                cursor += 1;
            }

            maybePushToken(tokens, includeTrivia, {
                kind: SqtsTokenKind.Comment,
                value: input.slice(start, cursor),
                start,
                end: cursor,
            });
            continue;
        }

        if (isIdentifierStart(char)) {
            cursor += 1;
            while (cursor < input.length && isIdentifierPart(input[cursor]!)) {
                cursor += 1;
            }

            tokens.push({
                kind: SqtsTokenKind.Identifier,
                value: input.slice(start, cursor),
                start,
                end: cursor,
            });
            continue;
        }

        if (char === "=" && next === ">") {
            cursor += 2;
            tokens.push({
                kind: SqtsTokenKind.Arrow,
                value: "=>",
                start,
                end: cursor,
            });
            continue;
        }

        if (char === "(") {
            cursor += 1;
            tokens.push({
                kind: SqtsTokenKind.LParen,
                value: "(",
                start,
                end: cursor,
            });
            continue;
        }

        if (char === ")") {
            cursor += 1;
            tokens.push({
                kind: SqtsTokenKind.RParen,
                value: ")",
                start,
                end: cursor,
            });
            continue;
        }

        if (char === ";") {
            cursor += 1;
            tokens.push({
                kind: SqtsTokenKind.Semicolon,
                value: ";",
                start,
                end: cursor,
            });
            continue;
        }

        cursor += 1;
        tokens.push({
            kind: SqtsTokenKind.Unknown,
            value: char,
            start,
            end: cursor,
        });
    }

    tokens.push({
        kind: SqtsTokenKind.Eof,
        value: "",
        start: input.length,
        end: input.length,
    });

    return tokens;
}

function maybePushToken(
    tokens: SqtsToken[],
    includeTrivia: boolean,
    token: SqtsToken,
): void {
    if (!includeTrivia && isTriviaToken(token.kind)) {
        return;
    }
    tokens.push(token);
}

function isTriviaToken(kind: SqtsTokenKind): boolean {
    return kind === SqtsTokenKind.Whitespace || kind === SqtsTokenKind.Comment;
}

function isWhitespace(char: string): boolean {
    return /\s/.test(char);
}

function isIdentifierStart(char: string): boolean {
    return /[A-Za-z_]/.test(char);
}

function isIdentifierPart(char: string): boolean {
    return /[A-Za-z0-9_]/.test(char);
}
