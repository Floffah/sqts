import type {
    IdentifierNode,
    SourcePosition,
    SourceSpan,
} from "@/parser/ast.ts";
import { ParseError, ParseErrorCode } from "@/parser/errors.ts";
import type { Token } from "@/parser/lexer.ts";

export interface ParseContext {
    source: string;
    statementIndex: number;
    statementStart: number;
    statementEnd: number;
    locate: (offset: number) => { line: number; column: number };
}

export interface ParserState {
    tokens: Token[];
    cursor: number;
    context: ParseContext;
}

export function createParserState(
    tokens: Token[],
    context: ParseContext,
): ParserState {
    return {
        tokens,
        cursor: 0,
        context,
    };
}

export function currentToken(state: ParserState): Token {
    return tokenAt(state, 0);
}

export function tokenAt(state: ParserState, lookahead: number): Token {
    const index = state.cursor + lookahead;
    if (index < 0) {
        return state.tokens[0]!;
    }
    return state.tokens[index] ?? state.tokens[state.tokens.length - 1]!;
}

export function consumeToken(state: ParserState): Token {
    const token = currentToken(state);
    if (token.kind !== "eof") {
        state.cursor += 1;
    }
    return token;
}

export function matchSymbol(
    state: ParserState,
    symbol: string,
): Token | undefined {
    const token = currentToken(state);
    if (token.kind === "symbol" && token.value === symbol) {
        consumeToken(state);
        return token;
    }
    return undefined;
}

export function expectSymbol(
    state: ParserState,
    symbol: string,
    message: string,
): Token {
    const token = matchSymbol(state, symbol);
    if (!token) {
        throw unexpectedTokenError(
            state,
            ParseErrorCode.UnexpectedToken,
            message,
        );
    }
    return token;
}

export function matchKeyword(
    state: ParserState,
    keyword: string,
): Token | undefined {
    const token = currentToken(state);
    if (isKeyword(token, keyword)) {
        consumeToken(state);
        return token;
    }
    return undefined;
}

export function expectKeyword(
    state: ParserState,
    keyword: string,
    message: string,
): Token {
    const token = matchKeyword(state, keyword);
    if (!token) {
        throw unexpectedTokenError(
            state,
            ParseErrorCode.UnexpectedToken,
            message,
        );
    }
    return token;
}

export function isKeyword(token: Token, keyword: string): boolean {
    if (token.kind !== "word") {
        return false;
    }

    return token.value.toUpperCase() === keyword.toUpperCase();
}

export function isWordLike(token: Token): boolean {
    return token.kind === "word" || token.kind === "identifier";
}

export function spanFromTokenRange(
    state: ParserState,
    startToken: Token,
    endToken: Token,
): SourceSpan {
    return spanFromOffsets(state, startToken.start, endToken.end);
}

export function parseIdentifierNode(state: ParserState): IdentifierNode {
    const token = currentToken(state);

    if (!isWordLike(token)) {
        throw unexpectedTokenError(
            state,
            ParseErrorCode.ExpectedIdentifier,
            "Expected identifier",
        );
    }

    consumeToken(state);

    return {
        normalized: normalizeIdentifier(token),
        raw: token.raw,
        quoted: token.quoted,
        span: spanFromOffsets(state, token.start, token.end),
    };
}

export function normalizeIdentifier(token: Token): string {
    const raw = token.kind === "identifier" ? token.value : token.raw;
    return raw.toLowerCase();
}

export function spanFromOffsets(
    state: ParserState,
    startOffset: number,
    endOffset: number,
): SourceSpan {
    return {
        start: positionFromOffset(state, startOffset),
        end: positionFromOffset(state, endOffset),
    };
}

export function positionFromOffset(
    state: ParserState,
    offset: number,
): SourcePosition {
    const located = state.context.locate(offset);
    return {
        offset,
        line: located.line,
        column: located.column,
    };
}

export function tokenSliceRaw(
    state: ParserState,
    startOffset: number,
    endOffset: number,
): string {
    return state.context.source.slice(startOffset, endOffset);
}

export function unexpectedTokenError(
    state: ParserState,
    code: ParseErrorCode,
    message: string,
    token: Token = currentToken(state),
): Error {
    return new ParseError({
        code,
        message,
        source: state.context.source,
        offset: token.start,
        statementIndex: state.context.statementIndex,
    });
}

export function skipOptionalSemicolon(state: ParserState): void {
    matchSymbol(state, ";");
}

export function isEof(state: ParserState): boolean {
    return currentToken(state).kind === "eof";
}
