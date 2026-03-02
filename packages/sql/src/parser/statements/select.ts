import type {
    ExpressionNode,
    FromClause,
    IdentifierNode,
    JoinNode,
    OrderByItem,
    SelectItem,
    SelectMetadata,
    SelectStatement,
    TableRef,
} from "@/parser/ast.ts";
import { ParseError, ParseErrorCode } from "@/parser/errors.ts";
import type { Token } from "@/parser/lexer.ts";
import {
    consumeToken,
    createParserState,
    currentToken,
    expectKeyword,
    isEof,
    isKeyword,
    matchKeyword,
    matchSymbol,
    parseIdentifierNode,
    skipOptionalSemicolon,
    spanFromOffsets,
    spanFromTokenRange,
    tokenAt,
    tokenSliceRaw,
    unexpectedTokenError,
    type ParseContext,
    type ParserState,
} from "@/parser/utils.ts";

const CLAUSE_BOUNDARY_KEYWORDS = new Set([
    "FROM",
    "WHERE",
    "ORDER",
    "LIMIT",
    "OFFSET",
    "GROUP",
    "HAVING",
    "UNION",
]);

const UNSUPPORTED_CLAUSE_KEYWORDS = new Set([
    "GROUP",
    "HAVING",
    "UNION",
    "WITH",
]);

const JOIN_INTRODUCERS = new Set([
    "JOIN",
    "INNER",
    "LEFT",
    "RIGHT",
    "FULL",
    "CROSS",
    "NATURAL",
]);

export function parseSelectStatement(
    tokens: Token[],
    context: ParseContext,
): SelectStatement {
    const state = createParserState(tokens, context);

    const selectToken = expectKeyword(
        state,
        "SELECT",
        "Expected SELECT statement",
    );

    const distinct = Boolean(matchKeyword(state, "DISTINCT"));

    const items = parseSelectItems(state);
    if (items.length === 0) {
        throw unexpectedTokenError(
            state,
            ParseErrorCode.InvalidSelectForm,
            "SELECT statement must contain at least one projection item",
            tokenAt(state, -1),
        );
    }

    let from: FromClause | undefined;
    if (matchKeyword(state, "FROM")) {
        from = parseFromClause(state, tokenAt(state, -1));
    }

    throwIfUnsupportedClauseAtCursor(state);

    let where: ExpressionNode | undefined;
    if (matchKeyword(state, "WHERE")) {
        const whereStart = tokenAt(state, -1);
        const whereTokens = consumeTopLevelTokensUntil(state, (token) =>
            isClauseBoundaryToken(token),
        );

        if (whereTokens.length === 0) {
            throw unexpectedTokenError(
                state,
                ParseErrorCode.InvalidSelectForm,
                "WHERE clause requires an expression",
                whereStart,
            );
        }

        where = parseExpressionFromTokens(state, whereTokens);
    }

    throwIfUnsupportedClauseAtCursor(state);

    let orderBy: OrderByItem[] = [];
    if (matchKeyword(state, "ORDER")) {
        expectKeyword(state, "BY", "Expected BY after ORDER");
        orderBy = parseOrderByItems(state);
    }

    throwIfUnsupportedClauseAtCursor(state);

    let limit: ExpressionNode | undefined;
    if (matchKeyword(state, "LIMIT")) {
        const limitToken = tokenAt(state, -1);
        const limitTokens = consumeTopLevelTokensUntil(
            state,
            (token) =>
                isKeyword(token, "OFFSET") || isClauseBoundaryToken(token),
        );

        if (limitTokens.length === 0) {
            throw unexpectedTokenError(
                state,
                ParseErrorCode.InvalidSelectForm,
                "LIMIT clause requires an expression",
                limitToken,
            );
        }

        limit = parseExpressionFromTokens(state, limitTokens);
    }

    throwIfUnsupportedClauseAtCursor(state);

    let offset: ExpressionNode | undefined;
    if (matchKeyword(state, "OFFSET")) {
        const offsetToken = tokenAt(state, -1);
        const offsetTokens = consumeTopLevelTokensUntil(state, (token) =>
            isClauseBoundaryToken(token),
        );

        if (offsetTokens.length === 0) {
            throw unexpectedTokenError(
                state,
                ParseErrorCode.InvalidSelectForm,
                "OFFSET clause requires an expression",
                offsetToken,
            );
        }

        offset = parseExpressionFromTokens(state, offsetTokens);
    }

    throwIfUnsupportedClauseAtCursor(state);

    skipOptionalSemicolon(state);

    if (!isEof(state)) {
        throwIfUnsupportedClauseAtCursor(state);

        throw unexpectedTokenError(
            state,
            ParseErrorCode.InvalidSelectForm,
            "Unexpected trailing tokens after SELECT statement",
        );
    }

    const metadata = buildSelectMetadata(tokens, items, from);
    const statementEnd = lastConsumedEnd(state, selectToken.end);

    return {
        kind: "select",
        distinct,
        items,
        from,
        where,
        orderBy,
        limit,
        offset,
        metadata,
        span: spanFromOffsets(state, selectToken.start, statementEnd),
    };
}

function parseSelectItems(state: ParserState): SelectItem[] {
    const items: SelectItem[] = [];

    while (true) {
        const tokens = consumeTopLevelTokensUntil(state, (token) =>
            isSelectItemBoundary(token),
        );

        if (tokens.length === 0) {
            if (items.length === 0) {
                return items;
            }

            throw unexpectedTokenError(
                state,
                ParseErrorCode.InvalidSelectForm,
                "Expected select expression",
            );
        }

        items.push(parseSelectItemFromTokens(state, tokens));

        if (!matchSymbol(state, ",")) {
            break;
        }
    }

    return items;
}

function parseSelectItemFromTokens(
    state: ParserState,
    tokens: Token[],
): SelectItem {
    const aliasExtraction = extractAliasFromItemTokens(state, tokens);
    const expressionTokens = aliasExtraction.expressionTokens;

    if (expressionTokens.length === 0) {
        throw unexpectedTokenError(
            state,
            ParseErrorCode.InvalidSelectForm,
            "Select item expression cannot be empty",
            tokens[0],
        );
    }

    const expression = parseExpressionFromTokens(state, expressionTokens);
    const rawExpression = tokenSliceRaw(
        state,
        expressionTokens[0]!.start,
        expressionTokens[expressionTokens.length - 1]!.end,
    ).trim();

    return {
        expression,
        rawExpression,
        alias: aliasExtraction.alias,
        span: spanFromTokenRange(state, tokens[0]!, tokens[tokens.length - 1]!),
    };
}

function extractAliasFromItemTokens(
    state: ParserState,
    tokens: Token[],
): {
    expressionTokens: Token[];
    alias?: IdentifierNode;
} {
    if (tokens.length >= 3) {
        const maybeAs = tokens[tokens.length - 2]!;
        const maybeAlias = tokens[tokens.length - 1]!;

        if (isKeyword(maybeAs, "AS") && isWordLikeToken(maybeAlias)) {
            return {
                expressionTokens: tokens.slice(0, -2),
                alias: identifierFromToken(state, maybeAlias),
            };
        }
    }

    if (tokens.length >= 2) {
        const last = tokens[tokens.length - 1]!;
        const previous = tokens[tokens.length - 2]!;

        if (
            isWordLikeToken(last) &&
            !isSymbol(previous, ".") &&
            !isSymbol(previous, ":") &&
            !isOperatorToken(previous)
        ) {
            return {
                expressionTokens: tokens.slice(0, -1),
                alias: identifierFromToken(state, last),
            };
        }
    }

    return { expressionTokens: tokens };
}

function parseFromClause(state: ParserState, fromToken: Token): FromClause {
    const base = parseTableRef(state);
    const joins: JoinNode[] = [];

    while (true) {
        const token = currentToken(state);
        if (token.kind !== "word") {
            break;
        }

        const keyword = token.value.toUpperCase();
        if (!JOIN_INTRODUCERS.has(keyword)) {
            break;
        }

        const joinStart = token;
        let joinType: "inner" | "left";

        if (matchKeyword(state, "INNER")) {
            joinType = "inner";
            expectKeyword(state, "JOIN", "Expected JOIN after INNER");
        } else if (matchKeyword(state, "LEFT")) {
            joinType = "left";
            matchKeyword(state, "OUTER");
            expectKeyword(state, "JOIN", "Expected JOIN after LEFT");
        } else if (matchKeyword(state, "JOIN")) {
            joinType = "inner";
        } else {
            throw unsupportedJoinTypeError(state, token);
        }

        const table = parseTableRef(state);
        expectKeyword(state, "ON", "Expected ON in JOIN clause");

        const onTokens = consumeTopLevelTokensUntil(state, (current) =>
            isJoinBoundaryToken(current),
        );

        if (onTokens.length === 0) {
            throw unexpectedTokenError(
                state,
                ParseErrorCode.InvalidSelectForm,
                "JOIN ON clause requires an expression",
                joinStart,
            );
        }

        const on = parseExpressionFromTokens(state, onTokens);

        joins.push({
            type: joinType,
            table,
            on,
            span: spanFromOffsets(state, joinStart.start, on.span.end.offset),
        });
    }

    const fromEnd =
        joins.length > 0
            ? joins[joins.length - 1]!.span.end.offset
            : base.span.end.offset;

    return {
        base,
        joins,
        span: spanFromOffsets(state, fromToken.start, fromEnd),
    };
}

function parseTableRef(state: ParserState): TableRef {
    const first = parseIdentifierNode(state);
    let schema: IdentifierNode | undefined;
    let name = first;

    if (matchSymbol(state, ".")) {
        schema = first;
        name = parseIdentifierNode(state);
    }

    let alias: IdentifierNode | undefined;
    if (matchKeyword(state, "AS")) {
        alias = parseIdentifierNode(state);
    } else if (canStartAlias(currentToken(state))) {
        alias = parseIdentifierNode(state);
    }

    const end = alias?.span.end.offset ?? name.span.end.offset;

    return {
        schema,
        name,
        alias,
        span: spanFromOffsets(state, first.span.start.offset, end),
    };
}

function parseOrderByItems(state: ParserState): OrderByItem[] {
    const items: OrderByItem[] = [];

    while (true) {
        const itemTokens = consumeTopLevelTokensUntil(state, (token) =>
            isOrderByItemBoundary(token),
        );

        if (itemTokens.length === 0) {
            throw unexpectedTokenError(
                state,
                ParseErrorCode.InvalidSelectForm,
                "ORDER BY item cannot be empty",
            );
        }

        let direction: "asc" | "desc" | undefined;
        let expressionTokens = itemTokens;

        const lastToken = itemTokens[itemTokens.length - 1]!;
        if (isKeyword(lastToken, "ASC")) {
            direction = "asc";
            expressionTokens = itemTokens.slice(0, -1);
        } else if (isKeyword(lastToken, "DESC")) {
            direction = "desc";
            expressionTokens = itemTokens.slice(0, -1);
        }

        if (expressionTokens.length === 0) {
            throw unexpectedTokenError(
                state,
                ParseErrorCode.InvalidSelectForm,
                "ORDER BY item expression cannot be empty",
                itemTokens[0],
            );
        }

        const expression = parseExpressionFromTokens(state, expressionTokens);
        const endToken = itemTokens[itemTokens.length - 1]!;

        items.push({
            expression,
            direction,
            span: spanFromTokenRange(state, itemTokens[0]!, endToken),
        });

        if (!matchSymbol(state, ",")) {
            break;
        }
    }

    return items;
}

function parseExpressionFromTokens(
    state: ParserState,
    tokens: Token[],
): ExpressionNode {
    if (tokens.length === 0) {
        const token = currentToken(state);
        return {
            kind: "raw",
            raw: "",
            span: spanFromOffsets(state, token.start, token.end),
        };
    }

    const wrapped = unwrapParenthesizedTokens(tokens);
    if (wrapped) {
        return {
            kind: "paren",
            expression: parseExpressionFromTokens(state, wrapped.inner),
            span: spanFromTokenRange(state, wrapped.open, wrapped.close),
        };
    }

    const binary = parseBinaryExpression(state, tokens);
    if (binary) {
        return binary;
    }

    const unary = parseUnaryExpression(state, tokens);
    if (unary) {
        return unary;
    }

    const literal = parseLiteralExpression(state, tokens);
    if (literal) {
        return literal;
    }

    const placeholder = parsePlaceholderExpression(state, tokens);
    if (placeholder) {
        return placeholder;
    }

    const identifier = parseIdentifierExpression(state, tokens);
    if (identifier) {
        return identifier;
    }

    return {
        kind: "raw",
        raw: tokenSliceRaw(
            state,
            tokens[0]!.start,
            tokens[tokens.length - 1]!.end,
        ),
        span: spanFromTokenRange(state, tokens[0]!, tokens[tokens.length - 1]!),
    };
}

function parseBinaryExpression(
    state: ParserState,
    tokens: Token[],
): ExpressionNode | undefined {
    const precedenceGroups: string[][] = [
        ["OR"],
        ["AND"],
        ["=", "==", "!=", "<>", "<", "<=", ">", ">=", "IS", "LIKE", "IN"],
        ["+", "-"],
        ["*", "/", "%"],
    ];

    for (const operators of precedenceGroups) {
        const index = findTopLevelOperator(tokens, operators);
        if (index <= 0 || index >= tokens.length - 1) {
            continue;
        }

        const operatorToken = tokens[index]!;
        const leftTokens = tokens.slice(0, index);
        const rightTokens = tokens.slice(index + 1);

        if (leftTokens.length === 0 || rightTokens.length === 0) {
            continue;
        }

        return {
            kind: "binary",
            operator: operatorToken.raw.toUpperCase(),
            left: parseExpressionFromTokens(state, leftTokens),
            right: parseExpressionFromTokens(state, rightTokens),
            span: spanFromTokenRange(
                state,
                tokens[0]!,
                tokens[tokens.length - 1]!,
            ),
        };
    }

    return undefined;
}

function parseUnaryExpression(
    state: ParserState,
    tokens: Token[],
): ExpressionNode | undefined {
    if (tokens.length < 2) {
        return undefined;
    }

    const first = tokens[0]!;
    if (
        (first.kind === "symbol" &&
            (first.value === "+" || first.value === "-")) ||
        isKeyword(first, "NOT")
    ) {
        return {
            kind: "unary",
            operator: first.raw.toUpperCase(),
            operand: parseExpressionFromTokens(state, tokens.slice(1)),
            span: spanFromTokenRange(state, first, tokens[tokens.length - 1]!),
        };
    }

    return undefined;
}

function parseLiteralExpression(
    state: ParserState,
    tokens: Token[],
): ExpressionNode | undefined {
    if (tokens.length !== 1) {
        return undefined;
    }

    const token = tokens[0]!;

    if (token.kind === "string") {
        return {
            kind: "literal",
            value: token.value,
            raw: token.raw,
            span: spanFromTokenRange(state, token, token),
        };
    }

    if (token.kind === "number") {
        return {
            kind: "literal",
            value: Number(token.value),
            raw: token.raw,
            span: spanFromTokenRange(state, token, token),
        };
    }

    if (token.kind === "word" && token.value.toUpperCase() === "NULL") {
        return {
            kind: "literal",
            value: null,
            raw: token.raw,
            span: spanFromTokenRange(state, token, token),
        };
    }

    if (token.kind === "word" && token.value.toUpperCase() === "TRUE") {
        return {
            kind: "literal",
            value: true,
            raw: token.raw,
            span: spanFromTokenRange(state, token, token),
        };
    }

    if (token.kind === "word" && token.value.toUpperCase() === "FALSE") {
        return {
            kind: "literal",
            value: false,
            raw: token.raw,
            span: spanFromTokenRange(state, token, token),
        };
    }

    return undefined;
}

function parsePlaceholderExpression(
    state: ParserState,
    tokens: Token[],
): ExpressionNode | undefined {
    if (tokens.length !== 1) {
        return undefined;
    }

    const token = tokens[0]!;
    if (token.kind !== "placeholder") {
        return undefined;
    }

    return {
        kind: "placeholder",
        name: token.value,
        span: spanFromTokenRange(state, token, token),
    };
}

function parseIdentifierExpression(
    state: ParserState,
    tokens: Token[],
): ExpressionNode | undefined {
    if (!isIdentifierPath(tokens)) {
        return undefined;
    }

    const path = tokens
        .filter((token) => token.kind !== "symbol")
        .map((token) => identifierFromToken(state, token));

    return {
        kind: "identifier",
        path,
        span: spanFromTokenRange(state, tokens[0]!, tokens[tokens.length - 1]!),
    };
}

function buildSelectMetadata(
    tokens: Token[],
    items: SelectItem[],
    from?: FromClause,
): SelectMetadata {
    const placeholders = dedupe(
        tokens
            .filter((token) => token.kind === "placeholder")
            .map((token) => token.value),
    );

    const referencedTables = from
        ? dedupe(
              [from.base, ...from.joins.map((join) => join.table)].map(
                  tableRefToCanonical,
              ),
          )
        : [];

    const outputColumns = items.map((item, index) => {
        if (item.alias) {
            return item.alias.normalized;
        }

        const inferred = inferOutputColumnName(item.expression);
        return inferred ?? `column${index + 1}`;
    });

    return {
        placeholders,
        referencedTables,
        outputColumns,
    };
}

function inferOutputColumnName(expression: ExpressionNode): string | undefined {
    if (expression.kind === "identifier") {
        return expression.path[expression.path.length - 1]?.normalized;
    }

    if (expression.kind === "placeholder") {
        return expression.name;
    }

    if (expression.kind === "literal") {
        return expression.raw;
    }

    if (expression.kind === "paren") {
        return inferOutputColumnName(expression.expression);
    }

    return undefined;
}

function tableRefToCanonical(table: TableRef): string {
    const schema = table.schema?.normalized ?? "main";
    return `${schema}.${table.name.normalized}`;
}

function dedupe(values: string[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];

    for (const value of values) {
        if (seen.has(value)) {
            continue;
        }
        seen.add(value);
        out.push(value);
    }

    return out;
}

function consumeTopLevelTokensUntil(
    state: ParserState,
    isBoundary: (token: Token, state: ParserState) => boolean,
): Token[] {
    const tokens: Token[] = [];
    let depth = 0;

    while (!isEof(state)) {
        const token = currentToken(state);

        if (token.kind === "symbol" && token.value === "(") {
            depth += 1;
            tokens.push(consumeToken(state));
            continue;
        }

        if (token.kind === "symbol" && token.value === ")") {
            if (depth === 0) {
                break;
            }
            depth -= 1;
            tokens.push(consumeToken(state));
            continue;
        }

        if (depth === 0 && isBoundary(token, state)) {
            break;
        }

        tokens.push(consumeToken(state));
    }

    return tokens;
}

function findTopLevelOperator(tokens: Token[], operators: string[]): number {
    let depth = 0;

    for (let i = tokens.length - 1; i >= 0; i -= 1) {
        const token = tokens[i]!;

        if (token.kind === "symbol" && token.value === ")") {
            depth += 1;
            continue;
        }

        if (token.kind === "symbol" && token.value === "(") {
            depth -= 1;
            continue;
        }

        if (depth !== 0) {
            continue;
        }

        const value =
            token.kind === "word"
                ? token.value.toUpperCase()
                : token.value.toUpperCase();

        if (operators.includes(value)) {
            return i;
        }
    }

    return -1;
}

function unwrapParenthesizedTokens(tokens: Token[]):
    | {
          open: Token;
          close: Token;
          inner: Token[];
      }
    | undefined {
    if (tokens.length < 2) {
        return undefined;
    }

    const first = tokens[0]!;
    const last = tokens[tokens.length - 1]!;
    if (!isSymbol(first, "(") || !isSymbol(last, ")")) {
        return undefined;
    }

    let depth = 0;
    for (let i = 0; i < tokens.length; i += 1) {
        const token = tokens[i]!;
        if (isSymbol(token, "(")) {
            depth += 1;
        } else if (isSymbol(token, ")")) {
            depth -= 1;
            if (depth === 0 && i !== tokens.length - 1) {
                return undefined;
            }
        }
    }

    return {
        open: first,
        close: last,
        inner: tokens.slice(1, -1),
    };
}

function isIdentifierPath(tokens: Token[]): boolean {
    if (tokens.length === 0) {
        return false;
    }

    for (let i = 0; i < tokens.length; i += 1) {
        const token = tokens[i]!;
        if (i % 2 === 0) {
            if (!isWordLikeToken(token)) {
                return false;
            }
        } else if (!isSymbol(token, ".")) {
            return false;
        }
    }

    return true;
}

function identifierFromToken(state: ParserState, token: Token): IdentifierNode {
    const start = state.context.locate(token.start);
    const end = state.context.locate(token.end);
    const raw = token.kind === "identifier" ? token.value : token.raw;
    return {
        normalized: raw.toLowerCase(),
        raw: token.raw,
        quoted: token.quoted,
        span: {
            start: {
                offset: token.start,
                line: start.line,
                column: start.column,
            },
            end: {
                offset: token.end,
                line: end.line,
                column: end.column,
            },
        },
    };
}

function isWordLikeToken(token: Token): boolean {
    return token.kind === "word" || token.kind === "identifier";
}

function isOperatorToken(token: Token): boolean {
    if (token.kind === "symbol") {
        return ["+", "-", "*", "/", "%", "=", "<", ">", "!"].includes(
            token.value,
        );
    }

    if (token.kind === "word") {
        const upper = token.value.toUpperCase();
        return ["AND", "OR", "NOT", "IS", "LIKE", "IN"].includes(upper);
    }

    return false;
}

function isSymbol(token: Token, symbol: string): boolean {
    return token.kind === "symbol" && token.value === symbol;
}

function isClauseBoundaryToken(token: Token): boolean {
    if (token.kind === "eof") {
        return true;
    }

    if (isSymbol(token, ";")) {
        return true;
    }

    return (
        token.kind === "word" &&
        CLAUSE_BOUNDARY_KEYWORDS.has(token.value.toUpperCase())
    );
}

function isSelectItemBoundary(token: Token): boolean {
    if (isSymbol(token, ",")) {
        return true;
    }

    return isClauseBoundaryToken(token);
}

function isOrderByItemBoundary(token: Token): boolean {
    if (isSymbol(token, ",")) {
        return true;
    }

    return isClauseBoundaryToken(token);
}

function isJoinBoundaryToken(token: Token): boolean {
    if (isClauseBoundaryToken(token)) {
        return true;
    }

    return (
        token.kind === "word" && JOIN_INTRODUCERS.has(token.value.toUpperCase())
    );
}

function canStartAlias(token: Token): boolean {
    if (!isWordLikeToken(token)) {
        return false;
    }

    if (token.kind !== "word") {
        return true;
    }

    const upper = token.value.toUpperCase();
    return (
        !CLAUSE_BOUNDARY_KEYWORDS.has(upper) &&
        !JOIN_INTRODUCERS.has(upper) &&
        upper !== "ON"
    );
}

function throwIfUnsupportedClauseAtCursor(state: ParserState): void {
    const token = currentToken(state);

    if (token.kind !== "word") {
        return;
    }

    const upper = token.value.toUpperCase();
    if (!UNSUPPORTED_CLAUSE_KEYWORDS.has(upper)) {
        return;
    }

    throw new ParseError({
        code: ParseErrorCode.UnsupportedSelectClause,
        message: `Unsupported SELECT clause '${upper}' in V1 parser`,
        source: state.context.source,
        offset: token.start,
        statementIndex: state.context.statementIndex,
    });
}

function unsupportedJoinTypeError(
    state: ParserState,
    token: Token,
): ParseError {
    return new ParseError({
        code: ParseErrorCode.UnsupportedJoinType,
        message: `Unsupported join type '${token.raw.toUpperCase()}' in V1 parser`,
        source: state.context.source,
        offset: token.start,
        statementIndex: state.context.statementIndex,
    });
}

function lastConsumedEnd(state: ParserState, fallback: number): number {
    const index = state.cursor - 1;
    if (index < 0) {
        return fallback;
    }

    return state.tokens[index]?.end ?? fallback;
}
