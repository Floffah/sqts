import { SqtsParseError, SqtsParseErrorCode } from "@/parser/errors.ts";
import { spanFromOffsets } from "@/parser/spanFromOffsets.ts";
import type { ParserState } from "@/parser/state.ts";
import type { SqtsStatement } from "@/parser/types.ts";

export interface ScanSingleResult {
    statement: SqtsStatement;
    semicolonOffset: number;
}

export interface ScanBlockResult {
    statements: SqtsStatement[];
    closeParenOffset: number;
}

interface ScannerContext {
    quote: "'" | '"' | "`" | "[" | null;
    quoteStartOffset: number;
    inLineComment: boolean;
    inBlockComment: boolean;
    blockCommentStartOffset: number;
    parenDepth: number;
}

export function scanSingleStatement(
    state: ParserState,
    startOffset: number,
): ScanSingleResult {
    const scanner = createScannerContext();
    let cursor = startOffset;

    while (cursor < state.input.length) {
        const nextCursor = advanceScanner(state, scanner, cursor);
        if (nextCursor !== cursor) {
            cursor = nextCursor;
            continue;
        }

        const char = state.input[cursor]!;
        if (char === ";" && scanner.parenDepth === 0) {
            const statement = buildStatement(state, startOffset, cursor);

            if (!hasExecutableContent(state.input, startOffset, cursor)) {
                throw new SqtsParseError({
                    code: SqtsParseErrorCode.ExpectedStatement,
                    message: "Expected SQL statement",
                    input: state.input,
                    offset: startOffset,
                });
            }

            return { statement, semicolonOffset: cursor };
        }

        if (char === "(") {
            scanner.parenDepth += 1;
        } else if (char === ")" && scanner.parenDepth > 0) {
            scanner.parenDepth -= 1;
        }

        cursor += 1;
    }

    throwUnterminatedErrorIfNeeded(state, scanner, cursor);
    throw new SqtsParseError({
        code: SqtsParseErrorCode.ExpectedSemicolon,
        message: 'Expected ";" to terminate operation statement',
        input: state.input,
        offset: cursor,
    });
}

export function scanBlockStatements(
    state: ParserState,
    contentStartOffset: number,
): ScanBlockResult {
    const statements: SqtsStatement[] = [];
    const scanner = createScannerContext();
    let cursor = contentStartOffset;
    let currentStatementStart = contentStartOffset;

    while (cursor < state.input.length) {
        const nextCursor = advanceScanner(state, scanner, cursor);
        if (nextCursor !== cursor) {
            cursor = nextCursor;
            continue;
        }

        const char = state.input[cursor]!;
        if (char === ";" && scanner.parenDepth === 0) {
            if (
                !hasExecutableContent(
                    state.input,
                    currentStatementStart,
                    cursor,
                )
            ) {
                throw new SqtsParseError({
                    code: SqtsParseErrorCode.ExpectedStatement,
                    message: "Expected SQL statement before semicolon",
                    input: state.input,
                    offset: cursor,
                });
            }

            statements.push(
                buildStatement(state, currentStatementStart, cursor),
            );
            cursor += 1;
            currentStatementStart = cursor;
            continue;
        }

        if (char === ")") {
            if (scanner.parenDepth === 0) {
                if (
                    hasExecutableContent(
                        state.input,
                        currentStatementStart,
                        cursor,
                    )
                ) {
                    throw new SqtsParseError({
                        code: SqtsParseErrorCode.ExpectedSemicolon,
                        message: 'Expected ";" before closing operation block',
                        input: state.input,
                        offset: cursor,
                    });
                }

                return {
                    statements,
                    closeParenOffset: cursor,
                };
            }

            scanner.parenDepth -= 1;
            cursor += 1;
            continue;
        }

        if (char === "(") {
            scanner.parenDepth += 1;
        }

        cursor += 1;
    }

    throwUnterminatedErrorIfNeeded(state, scanner, cursor);
    throw new SqtsParseError({
        code: SqtsParseErrorCode.ExpectedBlockClose,
        message: 'Expected ")" to close operation block',
        input: state.input,
        offset: cursor,
    });
}

function buildStatement(
    state: ParserState,
    startOffset: number,
    endOffset: number,
): SqtsStatement {
    const trimmed = trimWhitespaceRange(state.input, startOffset, endOffset);
    return {
        sql: state.input.slice(trimmed.start, trimmed.end),
        startOffset: trimmed.start,
        endOffset: trimmed.end,
        span: spanFromOffsets(state, trimmed.start, trimmed.end),
    };
}

function hasExecutableContent(
    input: string,
    startOffset: number,
    endOffset: number,
): boolean {
    let cursor = startOffset;

    while (cursor < endOffset) {
        const char = input[cursor]!;
        const next = input[cursor + 1];

        if (isWhitespace(char)) {
            cursor += 1;
            continue;
        }

        if (char === "-" && next === "-") {
            cursor += 2;
            while (cursor < endOffset && input[cursor] !== "\n") {
                cursor += 1;
            }
            continue;
        }

        if (char === "/" && next === "*") {
            cursor += 2;
            while (cursor < endOffset) {
                if (input[cursor] === "*" && input[cursor + 1] === "/") {
                    cursor += 2;
                    break;
                }
                cursor += 1;
            }
            continue;
        }

        return true;
    }

    return false;
}

function trimWhitespaceRange(
    input: string,
    start: number,
    end: number,
): { start: number; end: number } {
    let trimmedStart = start;
    let trimmedEnd = end;

    while (trimmedStart < trimmedEnd && isWhitespace(input[trimmedStart]!)) {
        trimmedStart += 1;
    }

    while (trimmedEnd > trimmedStart && isWhitespace(input[trimmedEnd - 1]!)) {
        trimmedEnd -= 1;
    }

    return { start: trimmedStart, end: trimmedEnd };
}

function createScannerContext(): ScannerContext {
    return {
        quote: null,
        quoteStartOffset: -1,
        inLineComment: false,
        inBlockComment: false,
        blockCommentStartOffset: -1,
        parenDepth: 0,
    };
}

function advanceScanner(
    state: ParserState,
    scanner: ScannerContext,
    cursor: number,
): number {
    const char = state.input[cursor]!;
    const next = state.input[cursor + 1];

    if (scanner.inLineComment) {
        if (char === "\n") {
            scanner.inLineComment = false;
        }
        return cursor + 1;
    }

    if (scanner.inBlockComment) {
        if (char === "*" && next === "/") {
            scanner.inBlockComment = false;
            scanner.blockCommentStartOffset = -1;
            return cursor + 2;
        }
        return cursor + 1;
    }

    if (scanner.quote !== null) {
        if (scanner.quote === "[") {
            if (char === "]") {
                scanner.quote = null;
                scanner.quoteStartOffset = -1;
            }
            return cursor + 1;
        }

        if (char === scanner.quote) {
            const escaped = next === scanner.quote;
            if (escaped) {
                return cursor + 2;
            }
            scanner.quote = null;
            scanner.quoteStartOffset = -1;
            return cursor + 1;
        }

        return cursor + 1;
    }

    if (char === "-" && next === "-") {
        scanner.inLineComment = true;
        return cursor + 2;
    }

    if (char === "/" && next === "*") {
        scanner.inBlockComment = true;
        scanner.blockCommentStartOffset = cursor;
        return cursor + 2;
    }

    if (char === "'" || char === '"' || char === "`") {
        scanner.quote = char;
        scanner.quoteStartOffset = cursor;
        return cursor + 1;
    }

    if (char === "[") {
        scanner.quote = char;
        scanner.quoteStartOffset = cursor;
        return cursor + 1;
    }

    return cursor;
}

function throwUnterminatedErrorIfNeeded(
    state: ParserState,
    scanner: ScannerContext,
    fallbackOffset: number,
): void {
    if (scanner.inBlockComment) {
        throw new SqtsParseError({
            code: SqtsParseErrorCode.UnterminatedComment,
            message: "Unterminated block comment",
            input: state.input,
            offset:
                scanner.blockCommentStartOffset >= 0
                    ? scanner.blockCommentStartOffset
                    : fallbackOffset,
        });
    }

    if (scanner.quote !== null) {
        throw new SqtsParseError({
            code: SqtsParseErrorCode.UnterminatedString,
            message: "Unterminated string or quoted identifier",
            input: state.input,
            offset:
                scanner.quoteStartOffset >= 0
                    ? scanner.quoteStartOffset
                    : fallbackOffset,
        });
    }
}

function isWhitespace(char: string): boolean {
    return /\s/.test(char);
}
