import { ParseError, ParseErrorCode } from "@/parser/errors.ts";

export type TokenKind =
    | "word"
    | "identifier"
    | "string"
    | "number"
    | "placeholder"
    | "symbol"
    | "eof";

export interface Token {
    kind: TokenKind;
    value: string;
    raw: string;
    start: number;
    end: number;
    quoted: boolean;
}

export interface TokenizeOptions {
    source: string;
    statementStart: number;
    statementText: string;
    statementIndex: number;
}

export function tokenizeSqlStatement(options: TokenizeOptions): Token[] {
    const tokens: Token[] = [];
    const text = options.statementText;

    let i = 0;

    while (i < text.length) {
        const char = text[i] ?? "";
        const next = text[i + 1] ?? "";

        if (/\s/.test(char)) {
            i += 1;
            continue;
        }

        if (char === "-" && next === "-") {
            i += 2;
            while (i < text.length && text[i] !== "\n") {
                i += 1;
            }
            continue;
        }

        if (char === "/" && next === "*") {
            const blockStart = i;
            i += 2;
            let closed = false;

            while (i < text.length) {
                if (text[i] === "*" && text[i + 1] === "/") {
                    i += 2;
                    closed = true;
                    break;
                }
                i += 1;
            }

            if (!closed) {
                throw new ParseError({
                    code: ParseErrorCode.UnterminatedComment,
                    message: "Unterminated block comment",
                    source: options.source,
                    offset: options.statementStart + blockStart,
                    statementIndex: options.statementIndex,
                });
            }

            continue;
        }

        if (char === "'") {
            const start = i;
            i += 1;

            while (i < text.length) {
                if (text[i] === "'" && text[i + 1] === "'") {
                    i += 2;
                    continue;
                }

                if (text[i] === "'") {
                    i += 1;
                    break;
                }

                i += 1;
            }

            if ((text[i - 1] ?? "") !== "'") {
                throw new ParseError({
                    code: ParseErrorCode.UnterminatedString,
                    message: "Unterminated string literal",
                    source: options.source,
                    offset: options.statementStart + start,
                    statementIndex: options.statementIndex,
                });
            }

            tokens.push({
                kind: "string",
                value: text.slice(start + 1, i - 1).replaceAll("''", "'"),
                raw: text.slice(start, i),
                start: options.statementStart + start,
                end: options.statementStart + i,
                quoted: false,
            });
            continue;
        }

        if (char === '"' || char === "`" || char === "[") {
            const start = i;
            const quote = char;
            const endQuote = quote === "[" ? "]" : quote;
            i += 1;
            let inner = "";
            let closed = false;

            while (i < text.length) {
                const current = text[i] ?? "";
                const lookahead = text[i + 1] ?? "";

                if (quote === '"' && current === '"' && lookahead === '"') {
                    inner += '"';
                    i += 2;
                    continue;
                }

                if (quote === "`" && current === "`" && lookahead === "`") {
                    inner += "`";
                    i += 2;
                    continue;
                }

                if (current === endQuote) {
                    i += 1;
                    closed = true;
                    break;
                }

                inner += current;
                i += 1;
            }

            if (!closed) {
                throw new ParseError({
                    code: ParseErrorCode.UnterminatedString,
                    message: "Unterminated quoted identifier",
                    source: options.source,
                    offset: options.statementStart + start,
                    statementIndex: options.statementIndex,
                });
            }

            tokens.push({
                kind: "identifier",
                value: inner,
                raw: text.slice(start, i),
                start: options.statementStart + start,
                end: options.statementStart + i,
                quoted: true,
            });
            continue;
        }

        if (char === "$" && isIdentifierStart(next)) {
            const start = i;
            i += 2;

            while (i < text.length && isIdentifierPart(text[i] ?? "")) {
                i += 1;
            }

            const raw = text.slice(start, i);
            tokens.push({
                kind: "placeholder",
                value: raw.slice(1),
                raw,
                start: options.statementStart + start,
                end: options.statementStart + i,
                quoted: false,
            });
            continue;
        }

        if (isIdentifierStart(char)) {
            const start = i;
            i += 1;

            while (i < text.length && isIdentifierPart(text[i] ?? "")) {
                i += 1;
            }

            const raw = text.slice(start, i);
            tokens.push({
                kind: "word",
                value: raw,
                raw,
                start: options.statementStart + start,
                end: options.statementStart + i,
                quoted: false,
            });
            continue;
        }

        if (/[0-9]/.test(char)) {
            const start = i;
            i += 1;

            while (i < text.length && /[0-9_]/.test(text[i] ?? "")) {
                i += 1;
            }

            if (text[i] === ".") {
                i += 1;
                while (i < text.length && /[0-9_]/.test(text[i] ?? "")) {
                    i += 1;
                }
            }

            const raw = text.slice(start, i);
            tokens.push({
                kind: "number",
                value: raw,
                raw,
                start: options.statementStart + start,
                end: options.statementStart + i,
                quoted: false,
            });
            continue;
        }

        tokens.push({
            kind: "symbol",
            value: char,
            raw: char,
            start: options.statementStart + i,
            end: options.statementStart + i + 1,
            quoted: false,
        });
        i += 1;
    }

    const eofOffset = options.statementStart + text.length;
    tokens.push({
        kind: "eof",
        value: "",
        raw: "",
        start: eofOffset,
        end: eofOffset,
        quoted: false,
    });

    return tokens;
}

function isIdentifierStart(char: string): boolean {
    return /[A-Za-z_]/.test(char);
}

function isIdentifierPart(char: string): boolean {
    return /[A-Za-z0-9_$]/.test(char);
}
