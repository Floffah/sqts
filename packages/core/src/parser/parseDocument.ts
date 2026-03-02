import {
    createSourceLocator,
    SqtsParseError,
    SqtsParseErrorCode,
} from "@/parser/errors.ts";
import { extractOperationPlaceholders } from "@/parser/extractOperationPlaceholders.ts";
import { lexSqts, SqtsTokenKind } from "@/parser/lexer.ts";
import { scanBlockStatements, scanSingleStatement } from "@/parser/scanner.ts";
import { spanFromOffsets } from "@/parser/spanFromOffsets.ts";
import {
    advanceCursorToOffset,
    consumeToken,
    currentToken,
    nonTriviaToken,
    skipTrivia,
    type ParserState,
} from "@/parser/state.ts";
import {
    SqtsOperationBodyKind,
    type SqtsDocument,
    type SqtsOperation,
} from "@/parser/types.ts";

interface ParsedBody {
    bodyKind: SqtsOperationBodyKind;
    statements: SqtsOperation["statements"];
    endOffset: number;
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
            throw new SqtsParseError({
                code: SqtsParseErrorCode.InvalidTopLevelContent,
                message: "Expected operation declaration",
                input: state.input,
                offset: token.start,
            });
        }

        const lookahead = nonTriviaToken(state, 1);
        if (lookahead.kind !== SqtsTokenKind.Arrow) {
            throw new SqtsParseError({
                code: SqtsParseErrorCode.InvalidTopLevelContent,
                message: "Expected operation declaration",
                input: state.input,
                offset: token.start,
            });
        }

        const operation = parseOperation(state);
        if (names.has(operation.name)) {
            throw new SqtsParseError({
                code: SqtsParseErrorCode.DuplicateOperationName,
                message: `Duplicate operation name "${operation.name}"`,
                input: state.input,
                offset: operation.startOffset,
            });
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
        throw new SqtsParseError({
            code: SqtsParseErrorCode.ExpectedIdentifier,
            message: "Expected operation name",
            input: state.input,
            offset: nameToken.start,
        });
    }

    consumeToken(state);
    skipTrivia(state);

    const arrowToken = currentToken(state);
    if (arrowToken.kind !== SqtsTokenKind.Arrow) {
        throw new SqtsParseError({
            code: SqtsParseErrorCode.ExpectedArrow,
            message: 'Expected "=>" after operation name',
            input: state.input,
            offset: arrowToken.start,
        });
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
            bodyKind: SqtsOperationBodyKind.Block,
            statements: block.statements,
            endOffset,
        };
    }

    if (
        token.kind === SqtsTokenKind.Eof ||
        token.kind === SqtsTokenKind.Semicolon ||
        token.kind === SqtsTokenKind.RParen
    ) {
        throw new SqtsParseError({
            code: SqtsParseErrorCode.ExpectedStatement,
            message: "Expected SQL statement body",
            input: state.input,
            offset: token.start,
        });
    }

    const single = scanSingleStatement(state, token.start);
    advanceCursorToOffset(state, single.semicolonOffset + 1);

    return {
        bodyKind: SqtsOperationBodyKind.Single,
        statements: [single.statement],
        endOffset: single.semicolonOffset + 1,
    };
}
