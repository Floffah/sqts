import { type SourceLocator } from "./errors.ts";
import { SqtsTokenKind, type SqtsToken } from "./lexer.ts";

export interface ParserState {
    input: string;
    tokens: SqtsToken[];
    cursor: number;
    locator: SourceLocator;
}

export function currentToken(state: ParserState): SqtsToken {
    return state.tokens[state.cursor] ?? state.tokens[state.tokens.length - 1]!;
}

export function consumeToken(state: ParserState): SqtsToken {
    const token = currentToken(state);
    if (token.kind !== SqtsTokenKind.Eof) {
        state.cursor += 1;
    }
    return token;
}

export function skipTrivia(state: ParserState): void {
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

export function nonTriviaToken(state: ParserState, startAt: number): SqtsToken {
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

export function advanceCursorToOffset(state: ParserState, offset: number): void {
    while (state.cursor < state.tokens.length) {
        const token = currentToken(state);
        if (token.start >= offset || token.kind === SqtsTokenKind.Eof) {
            return;
        }
        state.cursor += 1;
    }
}
