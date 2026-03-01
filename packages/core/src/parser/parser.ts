import { lexSqts, SqtsTokenKind, type SqtsToken } from "./lexer.ts";

export type SqtsOperationBodyKind = "single" | "block";

export interface SqtsSourcePosition {
    offset: number;
    line: number;
    column: number;
}

export interface SqtsSourceSpan {
    start: SqtsSourcePosition;
    end: SqtsSourcePosition;
}

export interface SqtsStatement {
    sql: string;
    startOffset: number;
    endOffset: number;
    span: SqtsSourceSpan;
}

export interface SqtsOperation {
    name: string;
    bodyKind: SqtsOperationBodyKind;
    statements: SqtsStatement[];
    placeholders: string[];
    startOffset: number;
    endOffset: number;
    span: SqtsSourceSpan;
}

export interface SqtsDocument {
    operations: SqtsOperation[];
    operationNames: string[];
}

export enum SqtsParseErrorCode {
    UnexpectedToken = "ERR_UNEXPECTED_TOKEN",
    ExpectedIdentifier = "ERR_EXPECTED_IDENTIFIER",
    ExpectedArrow = "ERR_EXPECTED_ARROW",
    ExpectedStatement = "ERR_EXPECTED_STATEMENT",
    ExpectedSemicolon = "ERR_EXPECTED_SEMICOLON",
    ExpectedBlockClose = "ERR_EXPECTED_BLOCK_CLOSE",
    DuplicateOperationName = "ERR_DUPLICATE_OPERATION_NAME",
    UnterminatedString = "ERR_UNTERMINATED_STRING",
    UnterminatedComment = "ERR_UNTERMINATED_COMMENT",
    InvalidTopLevelContent = "ERR_INVALID_TOP_LEVEL_CONTENT",
}

export class SqtsParseError extends Error {
    readonly code: SqtsParseErrorCode;
    readonly offset: number;
    readonly line: number;
    readonly column: number;
    readonly snippet: string;

    constructor(options: {
        code: SqtsParseErrorCode;
        message: string;
        input: string;
        offset: number;
    }) {
        const locator = createSourceLocator(options.input);
        const { line, column } = locator.locate(options.offset);
        const snippet = createSnippet(
            options.input,
            locator.lineStarts,
            line,
            column,
        );

        super(`${options.message} (line ${line}, column ${column})`);
        this.name = "SqtsParseError";
        this.code = options.code;
        this.offset = options.offset;
        this.line = line;
        this.column = column;
        this.snippet = snippet;
    }
}

interface SourceLocator {
    lineStarts: number[];
    locate: (offset: number) => { line: number; column: number };
}

interface ParserState {
    input: string;
    tokens: SqtsToken[];
    cursor: number;
    locator: SourceLocator;
}

interface ParsedBody {
    bodyKind: SqtsOperationBodyKind;
    statements: SqtsStatement[];
    endOffset: number;
}

interface ScanSingleResult {
    statement: SqtsStatement;
    semicolonOffset: number;
}

interface ScanBlockResult {
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

export function parseDocument(input: string): SqtsDocument {
    const state: ParserState = {
        input,
        tokens: lexSqts(input, { includeTrivia: true }),
        cursor: 0,
        locator: createSourceLocator(input),
    };

    const operations: SqtsOperation[] = [];
    const names = new Set<string>();

    while (true) {
        skipTrivia(state);
        const token = currentToken(state);

        if (token.kind === SqtsTokenKind.Eof) {
            break;
        }

        if (token.kind !== SqtsTokenKind.Identifier) {
            throw parseError(
                state,
                SqtsParseErrorCode.InvalidTopLevelContent,
                "Expected operation declaration",
                token.start,
            );
        }

        const lookahead = nonTriviaToken(state, 1);
        if (lookahead.kind !== SqtsTokenKind.Arrow) {
            throw parseError(
                state,
                SqtsParseErrorCode.InvalidTopLevelContent,
                "Expected operation declaration",
                token.start,
            );
        }

        const operation = parseOperation(state);
        if (names.has(operation.name)) {
            throw parseError(
                state,
                SqtsParseErrorCode.DuplicateOperationName,
                `Duplicate operation name "${operation.name}"`,
                operation.startOffset,
            );
        }

        names.add(operation.name);
        operations.push(operation);
    }

    return {
        operations,
        operationNames: operations.map((operation) => operation.name),
    };
}

function parseOperation(state: ParserState): SqtsOperation {
    const nameToken = currentToken(state);
    if (nameToken.kind !== SqtsTokenKind.Identifier) {
        throw parseError(
            state,
            SqtsParseErrorCode.ExpectedIdentifier,
            "Expected operation name",
            nameToken.start,
        );
    }

    consumeToken(state);
    skipTrivia(state);

    const arrowToken = currentToken(state);
    if (arrowToken.kind !== SqtsTokenKind.Arrow) {
        throw parseError(
            state,
            SqtsParseErrorCode.ExpectedArrow,
            'Expected "=>" after operation name',
            arrowToken.start,
        );
    }
    consumeToken(state);
    skipTrivia(state);

    const body = parseOperationBody(state);
    const placeholders = extractOperationPlaceholders(body.statements);

    return {
        name: nameToken.value,
        bodyKind: body.bodyKind,
        statements: body.statements,
        placeholders,
        startOffset: nameToken.start,
        endOffset: body.endOffset,
        span: spanFromOffsets(state, nameToken.start, body.endOffset),
    };
}

function parseOperationBody(state: ParserState): ParsedBody {
    const token = currentToken(state);
    if (token.kind === SqtsTokenKind.LParen) {
        consumeToken(state);
        const block = scanBlockStatements(state, token.end);

        advanceCursorToOffset(state, block.closeParenOffset + 1);
        skipTrivia(state);

        let endOffset = block.closeParenOffset + 1;
        if (currentToken(state).kind === SqtsTokenKind.Semicolon) {
            endOffset = currentToken(state).end;
            consumeToken(state);
        }

        return {
            bodyKind: "block",
            statements: block.statements,
            endOffset,
        };
    }

    if (
        token.kind === SqtsTokenKind.Eof ||
        token.kind === SqtsTokenKind.Semicolon ||
        token.kind === SqtsTokenKind.RParen
    ) {
        throw parseError(
            state,
            SqtsParseErrorCode.ExpectedStatement,
            "Expected SQL statement body",
            token.start,
        );
    }

    const single = scanSingleStatement(state, token.start);
    advanceCursorToOffset(state, single.semicolonOffset + 1);

    return {
        bodyKind: "single",
        statements: [single.statement],
        endOffset: single.semicolonOffset + 1,
    };
}

function scanSingleStatement(
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
                throw parseError(
                    state,
                    SqtsParseErrorCode.ExpectedStatement,
                    "Expected SQL statement",
                    startOffset,
                );
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
    throw parseError(
        state,
        SqtsParseErrorCode.ExpectedSemicolon,
        'Expected ";" to terminate operation statement',
        cursor,
    );
}

function scanBlockStatements(
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
            if (!hasExecutableContent(state.input, currentStatementStart, cursor)) {
                throw parseError(
                    state,
                    SqtsParseErrorCode.ExpectedStatement,
                    "Expected SQL statement before semicolon",
                    cursor,
                );
            }

            statements.push(buildStatement(state, currentStatementStart, cursor));
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
                    throw parseError(
                        state,
                        SqtsParseErrorCode.ExpectedSemicolon,
                        'Expected ";" before closing operation block',
                        cursor,
                    );
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
    throw parseError(
        state,
        SqtsParseErrorCode.ExpectedBlockClose,
        'Expected ")" to close operation block',
        cursor,
    );
}

function extractOperationPlaceholders(statements: SqtsStatement[]): string[] {
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
        throw parseError(
            state,
            SqtsParseErrorCode.UnterminatedComment,
            "Unterminated block comment",
            scanner.blockCommentStartOffset >= 0
                ? scanner.blockCommentStartOffset
                : fallbackOffset,
        );
    }

    if (scanner.quote !== null) {
        throw parseError(
            state,
            SqtsParseErrorCode.UnterminatedString,
            "Unterminated string or quoted identifier",
            scanner.quoteStartOffset >= 0
                ? scanner.quoteStartOffset
                : fallbackOffset,
        );
    }
}

function createSourceLocator(input: string): SourceLocator {
    const lineStarts: number[] = [0];

    for (let i = 0; i < input.length; i += 1) {
        if (input[i] === "\n") {
            lineStarts.push(i + 1);
        }
    }

    const locate = (offset: number): { line: number; column: number } => {
        let low = 0;
        let high = lineStarts.length - 1;

        while (low <= high) {
            const mid = Math.floor((low + high) / 2);
            const start = lineStarts[mid] ?? 0;
            const next = lineStarts[mid + 1] ?? Number.POSITIVE_INFINITY;

            if (offset < start) {
                high = mid - 1;
            } else if (offset >= next) {
                low = mid + 1;
            } else {
                return {
                    line: mid + 1,
                    column: offset - start + 1,
                };
            }
        }

        const lastStart = lineStarts[lineStarts.length - 1] ?? 0;
        return {
            line: lineStarts.length,
            column: Math.max(1, offset - lastStart + 1),
        };
    };

    return { lineStarts, locate };
}

function createSnippet(
    input: string,
    lineStarts: number[],
    line: number,
    column: number,
): string {
    const lineIndex = line - 1;
    const lineStart = lineStarts[lineIndex] ?? 0;
    const lineEnd = input.indexOf("\n", lineStart);
    const lineText = input.slice(
        lineStart,
        lineEnd === -1 ? input.length : lineEnd,
    );
    const caretPadding = " ".repeat(Math.max(0, column - 1));

    return `${lineText}\n${caretPadding}^`;
}

function parseError(
    state: ParserState,
    code: SqtsParseErrorCode,
    message: string,
    offset: number,
): SqtsParseError {
    return new SqtsParseError({
        code,
        message,
        input: state.input,
        offset,
    });
}

function spanFromOffsets(
    state: ParserState,
    startOffset: number,
    endOffset: number,
): SqtsSourceSpan {
    return {
        start: positionFromOffset(state, startOffset),
        end: positionFromOffset(state, endOffset),
    };
}

function positionFromOffset(
    state: ParserState,
    offset: number,
): SqtsSourcePosition {
    const located = state.locator.locate(offset);
    return {
        offset,
        line: located.line,
        column: located.column,
    };
}

function advanceCursorToOffset(state: ParserState, offset: number): void {
    while (state.cursor < state.tokens.length) {
        const token = currentToken(state);
        if (token.start >= offset || token.kind === SqtsTokenKind.Eof) {
            return;
        }
        state.cursor += 1;
    }
}

function consumeToken(state: ParserState): SqtsToken {
    const token = currentToken(state);
    if (token.kind !== SqtsTokenKind.Eof) {
        state.cursor += 1;
    }
    return token;
}

function currentToken(state: ParserState): SqtsToken {
    return state.tokens[state.cursor] ?? state.tokens[state.tokens.length - 1]!;
}

function skipTrivia(state: ParserState): void {
    while (true) {
        const token = currentToken(state);
        if (
            token.kind !== SqtsTokenKind.Whitespace &&
            token.kind !== SqtsTokenKind.Comment
        ) {
            return;
        }
        consumeToken(state);
    }
}

function nonTriviaToken(state: ParserState, startAt: number): SqtsToken {
    let offset = startAt;

    while (true) {
        const token =
            state.tokens[state.cursor + offset] ??
            state.tokens[state.tokens.length - 1]!;
        if (
            token.kind !== SqtsTokenKind.Whitespace &&
            token.kind !== SqtsTokenKind.Comment
        ) {
            return token;
        }
        offset += 1;
    }
}

function isWhitespace(char: string): boolean {
    return /\s/.test(char);
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
