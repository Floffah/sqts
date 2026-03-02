import { inferSqliteAffinity, parseTypeArguments } from "@/parser/affinity.ts";
import {
    ForeignKeyDeferrableMode,
    ForeignKeyInitiallyMode,
    ReferentialAction,
} from "@/parser/ast.ts";
import type {
    ColumnConstraintNode,
    ColumnDefinition,
    ConstraintNameNode,
    CreateTableStatement,
    ForeignKeyReferenceNode,
    IdentifierNode,
    IndexedColumnNode,
    TableConstraintNode,
    TypeNameNode,
} from "@/parser/ast.ts";
import { ParseErrorCode } from "@/parser/errors.ts";
import type { Token } from "@/parser/lexer.ts";
import {
    consumeToken,
    createParserState,
    currentToken,
    expectKeyword,
    expectSymbol,
    isEof,
    isKeyword,
    matchKeyword,
    matchSymbol,
    parseIdentifierNode,
    skipOptionalSemicolon,
    spanFromOffsets,
    tokenAt,
    tokenSliceRaw,
    unexpectedTokenError,
    type ParseContext,
    type ParserState,
} from "@/parser/utils.ts";

const COLUMN_CONSTRAINT_KEYWORDS = new Set([
    "CONSTRAINT",
    "PRIMARY",
    "NOT",
    "NULL",
    "UNIQUE",
    "CHECK",
    "DEFAULT",
    "COLLATE",
    "REFERENCES",
]);

export function parseCreateTableStatement(
    tokens: Token[],
    context: ParseContext,
): CreateTableStatement {
    const state = createParserState(tokens, context);

    const createToken = expectKeyword(
        state,
        "CREATE",
        "Expected CREATE TABLE statement",
    );

    const temporary = Boolean(
        matchKeyword(state, "TEMP") ?? matchKeyword(state, "TEMPORARY"),
    );

    expectKeyword(state, "TABLE", "Expected TABLE after CREATE");

    let ifNotExists = false;
    if (matchKeyword(state, "IF")) {
        expectKeyword(state, "NOT", "Expected NOT after IF");
        expectKeyword(state, "EXISTS", "Expected EXISTS after IF NOT");
        ifNotExists = true;
    }

    const firstIdentifier = parseIdentifierNode(state);
    let schema: IdentifierNode | undefined;
    let tableName = firstIdentifier;

    if (matchSymbol(state, ".")) {
        schema = firstIdentifier;
        tableName = parseIdentifierNode(state);
    }

    expectSymbol(state, "(", "Expected '(' to start table definition");

    const columns: ColumnDefinition[] = [];
    const tableConstraints: TableConstraintNode[] = [];
    const seenColumnNames = new Set<string>();

    if (!matchSymbol(state, ")")) {
        while (true) {
            if (isTableConstraintStart(state)) {
                tableConstraints.push(parseTableConstraint(state));
            } else {
                const column = parseColumnDefinition(state);
                if (seenColumnNames.has(column.name.normalized)) {
                    throw unexpectedTokenError(
                        state,
                        ParseErrorCode.DuplicateColumnName,
                        `Duplicate column definition for '${column.name.raw}'`,
                        tokenAt(state, -1),
                    );
                }
                seenColumnNames.add(column.name.normalized);
                columns.push(column);
            }

            if (!matchSymbol(state, ",")) {
                break;
            }
        }

        expectSymbol(state, ")", "Expected ')' to close table definition");
    }

    let withoutRowid = false;
    let strict = false;

    while (!isEof(state)) {
        if (matchKeyword(state, "WITHOUT")) {
            expectKeyword(state, "ROWID", "Expected ROWID after WITHOUT");
            withoutRowid = true;
            continue;
        }

        if (matchKeyword(state, "STRICT")) {
            strict = true;
            continue;
        }

        if (matchSymbol(state, ";")) {
            break;
        }

        throw unexpectedTokenError(
            state,
            ParseErrorCode.InvalidCreateTableForm,
            "Unexpected token after CREATE TABLE definition",
        );
    }

    skipOptionalSemicolon(state);

    if (!isEof(state)) {
        throw unexpectedTokenError(
            state,
            ParseErrorCode.InvalidCreateTableForm,
            "Unexpected trailing tokens after CREATE TABLE statement",
        );
    }

    const statementEnd = lastConsumedEnd(state, createToken.end);

    return {
        kind: "create_table",
        schema,
        name: tableName,
        temporary,
        ifNotExists,
        columns,
        tableConstraints,
        withoutRowid,
        strict,
        span: spanFromOffsets(state, createToken.start, statementEnd),
    };
}

function parseColumnDefinition(state: ParserState): ColumnDefinition {
    const startToken = currentToken(state);
    const name = parseIdentifierNode(state);
    const type = parseOptionalTypeName(state);
    const constraints: ColumnConstraintNode[] = [];

    while (!isColumnItemTerminator(currentToken(state))) {
        constraints.push(parseColumnConstraint(state));
    }

    const endOffset = lastConsumedEnd(state, startToken.end);

    return {
        name,
        type,
        constraints,
        span: spanFromOffsets(state, startToken.start, endOffset),
    };
}

function parseOptionalTypeName(state: ParserState): TypeNameNode | undefined {
    const start = currentToken(state);

    if (isColumnItemTerminator(start) || isColumnConstraintStart(start)) {
        return undefined;
    }

    const first = consumeToken(state);
    const collected: Token[] = [first];
    let depth = 0;

    while (true) {
        const token = currentToken(state);

        if (token.kind === "symbol" && token.value === "(") {
            depth += 1;
            collected.push(consumeToken(state));
            continue;
        }

        if (token.kind === "symbol" && token.value === ")") {
            if (depth === 0) {
                break;
            }
            depth -= 1;
            collected.push(consumeToken(state));
            continue;
        }

        if (
            depth === 0 &&
            (isColumnItemTerminator(token) || isColumnConstraintStart(token))
        ) {
            break;
        }

        if (token.kind === "eof") {
            break;
        }

        collected.push(consumeToken(state));
    }

    const startOffset = collected[0]!.start;
    const endOffset = collected[collected.length - 1]!.end;
    const declared = tokenSliceRaw(state, startOffset, endOffset).trim();
    const baseName = first.raw;

    return {
        declared,
        baseName,
        args: parseTypeArguments(declared),
        affinity: inferSqliteAffinity(declared),
        span: spanFromOffsets(state, startOffset, endOffset),
    };
}

function parseColumnConstraint(state: ParserState): ColumnConstraintNode {
    const startToken = currentToken(state);
    const name = parseOptionalConstraintName(state);
    const token = currentToken(state);

    if (isKeyword(token, "NULL")) {
        const nullToken = consumeToken(state);
        return {
            kind: "null",
            name,
            span: spanFromOffsets(state, startToken.start, nullToken.end),
        };
    }

    if (isKeyword(token, "NOT")) {
        consumeToken(state);
        const nullToken = expectKeyword(
            state,
            "NULL",
            "Expected NULL after NOT",
        );
        const conflictClause = parseOptionalConflictClause(state);

        return {
            kind: "not_null",
            name,
            conflictClause,
            span: spanFromOffsets(
                state,
                startToken.start,
                clauseEndOffset(state, nullToken.end),
            ),
        };
    }

    if (isKeyword(token, "PRIMARY")) {
        consumeToken(state);
        const keyToken = expectKeyword(
            state,
            "KEY",
            "Expected KEY after PRIMARY",
        );
        const order = parseOptionalSortOrder(state);
        const conflictClause = parseOptionalConflictClause(state);
        const autoincrement = Boolean(matchKeyword(state, "AUTOINCREMENT"));

        return {
            kind: "primary_key",
            name,
            order,
            autoincrement,
            conflictClause,
            span: spanFromOffsets(
                state,
                startToken.start,
                clauseEndOffset(state, keyToken.end),
            ),
        };
    }

    if (isKeyword(token, "UNIQUE")) {
        const uniqueToken = consumeToken(state);
        const conflictClause = parseOptionalConflictClause(state);

        return {
            kind: "unique",
            name,
            conflictClause,
            span: spanFromOffsets(
                state,
                startToken.start,
                clauseEndOffset(state, uniqueToken.end),
            ),
        };
    }

    if (isKeyword(token, "CHECK")) {
        consumeToken(state);
        const expression = parseParenthesizedRaw(state);

        return {
            kind: "check",
            name,
            rawExpression: expression.raw,
            span: spanFromOffsets(
                state,
                startToken.start,
                expression.endOffset,
            ),
        };
    }

    if (isKeyword(token, "DEFAULT")) {
        consumeToken(state);
        const defaultValue = parseDefaultExpression(state);

        return {
            kind: "default",
            name,
            rawExpression: defaultValue.raw,
            span: spanFromOffsets(
                state,
                startToken.start,
                defaultValue.endOffset,
            ),
        };
    }

    if (isKeyword(token, "COLLATE")) {
        consumeToken(state);
        const collation = parseIdentifierNode(state);

        return {
            kind: "collate",
            name,
            collation,
            span: spanFromOffsets(
                state,
                startToken.start,
                collation.span.end.offset,
            ),
        };
    }

    if (isKeyword(token, "REFERENCES")) {
        const references = parseReferencesClause(state);
        return {
            kind: "references",
            name,
            references,
            span: spanFromOffsets(
                state,
                startToken.start,
                references.span.end.offset,
            ),
        };
    }

    throw unexpectedTokenError(
        state,
        ParseErrorCode.UnexpectedToken,
        "Unsupported or invalid column constraint",
    );
}

function parseTableConstraint(state: ParserState): TableConstraintNode {
    const startToken = currentToken(state);
    const name = parseOptionalConstraintName(state);
    const token = currentToken(state);

    if (isKeyword(token, "PRIMARY")) {
        consumeToken(state);
        const keyToken = expectKeyword(
            state,
            "KEY",
            "Expected KEY after PRIMARY",
        );
        const columns = parseIndexedColumnList(state);
        const conflictClause = parseOptionalConflictClause(state);

        return {
            kind: "primary_key",
            name,
            columns,
            conflictClause,
            span: spanFromOffsets(
                state,
                startToken.start,
                clauseEndOffset(state, keyToken.end),
            ),
        };
    }

    if (isKeyword(token, "UNIQUE")) {
        const uniqueToken = consumeToken(state);
        const columns = parseIndexedColumnList(state);
        const conflictClause = parseOptionalConflictClause(state);

        return {
            kind: "unique",
            name,
            columns,
            conflictClause,
            span: spanFromOffsets(
                state,
                startToken.start,
                clauseEndOffset(state, uniqueToken.end),
            ),
        };
    }

    if (isKeyword(token, "CHECK")) {
        consumeToken(state);
        const expression = parseParenthesizedRaw(state);

        return {
            kind: "check",
            name,
            rawExpression: expression.raw,
            span: spanFromOffsets(
                state,
                startToken.start,
                expression.endOffset,
            ),
        };
    }

    if (isKeyword(token, "FOREIGN")) {
        consumeToken(state);
        expectKeyword(state, "KEY", "Expected KEY after FOREIGN");
        const columns = parseIdentifierList(state);
        const references = parseReferencesClause(state);

        return {
            kind: "foreign_key",
            name,
            columns,
            references,
            span: spanFromOffsets(
                state,
                startToken.start,
                references.span.end.offset,
            ),
        };
    }

    throw unexpectedTokenError(
        state,
        ParseErrorCode.UnexpectedToken,
        "Expected table constraint definition",
    );
}

function parseOptionalConstraintName(
    state: ParserState,
): ConstraintNameNode | undefined {
    const constraintToken = matchKeyword(state, "CONSTRAINT");
    if (!constraintToken) {
        return undefined;
    }

    const name = parseIdentifierNode(state);

    return {
        name,
        span: spanFromOffsets(
            state,
            constraintToken.start,
            name.span.end.offset,
        ),
    };
}

function parseOptionalConflictClause(state: ParserState): string | undefined {
    const onToken = matchKeyword(state, "ON");
    if (!onToken) {
        return undefined;
    }

    expectKeyword(state, "CONFLICT", "Expected CONFLICT after ON");
    const resolutionToken = consumeToken(state);

    if (resolutionToken.kind !== "word") {
        throw unexpectedTokenError(
            state,
            ParseErrorCode.UnexpectedToken,
            "Expected conflict resolution keyword",
            resolutionToken,
        );
    }

    return tokenSliceRaw(state, onToken.start, resolutionToken.end).trim();
}

function parseOptionalSortOrder(
    state: ParserState,
): "asc" | "desc" | undefined {
    if (matchKeyword(state, "ASC")) {
        return "asc";
    }

    if (matchKeyword(state, "DESC")) {
        return "desc";
    }

    return undefined;
}

function parseDefaultExpression(state: ParserState): {
    raw: string;
    endOffset: number;
} {
    const first = currentToken(state);

    if (first.kind === "symbol" && first.value === "(") {
        const expression = parseParenthesizedRaw(state);
        return {
            raw: `(${expression.raw})`,
            endOffset: expression.endOffset,
        };
    }

    if (isColumnItemTerminator(first) || first.kind === "eof") {
        throw unexpectedTokenError(
            state,
            ParseErrorCode.UnexpectedToken,
            "Expected DEFAULT value",
        );
    }

    let depth = 0;
    const tokens: Token[] = [];

    while (true) {
        const token = currentToken(state);

        if (token.kind === "eof") {
            break;
        }

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

        if (
            depth === 0 &&
            (isColumnItemTerminator(token) || isColumnConstraintStart(token))
        ) {
            break;
        }

        tokens.push(consumeToken(state));
    }

    if (tokens.length === 0) {
        throw unexpectedTokenError(
            state,
            ParseErrorCode.UnexpectedToken,
            "Expected DEFAULT value",
            first,
        );
    }

    const start = tokens[0]!.start;
    const end = tokens[tokens.length - 1]!.end;

    return {
        raw: tokenSliceRaw(state, start, end).trim(),
        endOffset: end,
    };
}

function parseParenthesizedRaw(state: ParserState): {
    raw: string;
    endOffset: number;
} {
    const open = expectSymbol(state, "(", "Expected '(' to start expression");
    const expressionStart = currentToken(state).start;
    let depth = 1;

    while (!isEof(state)) {
        const token = consumeToken(state);

        if (token.kind === "symbol" && token.value === "(") {
            depth += 1;
            continue;
        }

        if (token.kind === "symbol" && token.value === ")") {
            depth -= 1;
            if (depth === 0) {
                const raw = tokenSliceRaw(
                    state,
                    expressionStart,
                    token.start,
                ).trim();
                return {
                    raw,
                    endOffset: token.end,
                };
            }
        }
    }

    throw unexpectedTokenError(
        state,
        ParseErrorCode.UnexpectedToken,
        "Unterminated parenthesized expression",
        open,
    );
}

function parseReferencesClause(state: ParserState): ForeignKeyReferenceNode {
    const startToken = expectKeyword(
        state,
        "REFERENCES",
        "Expected REFERENCES clause",
    );
    const table = parseIdentifierNode(state);
    const columns = peekIdentifierList(state);

    let onDelete: ReferentialAction | undefined;
    let onUpdate: ReferentialAction | undefined;
    let match: string | undefined;
    let deferrable: ForeignKeyDeferrableMode | undefined;
    let initially: ForeignKeyInitiallyMode | undefined;

    while (true) {
        if (matchKeyword(state, "ON")) {
            if (matchKeyword(state, "DELETE")) {
                onDelete = parseReferentialAction(state);
                continue;
            }

            if (matchKeyword(state, "UPDATE")) {
                onUpdate = parseReferentialAction(state);
                continue;
            }

            throw unexpectedTokenError(
                state,
                ParseErrorCode.UnexpectedToken,
                "Expected DELETE or UPDATE after ON in REFERENCES clause",
            );
        }

        if (matchKeyword(state, "MATCH")) {
            const valueToken = consumeToken(state);
            if (
                valueToken.kind !== "word" &&
                valueToken.kind !== "identifier"
            ) {
                throw unexpectedTokenError(
                    state,
                    ParseErrorCode.UnexpectedToken,
                    "Expected match name after MATCH",
                    valueToken,
                );
            }

            match =
                valueToken.kind === "identifier"
                    ? valueToken.value
                    : valueToken.raw;
            continue;
        }

        if (matchKeyword(state, "NOT")) {
            expectKeyword(state, "DEFERRABLE", "Expected DEFERRABLE after NOT");
            deferrable = ForeignKeyDeferrableMode.NotDeferrable;
            continue;
        }

        if (matchKeyword(state, "DEFERRABLE")) {
            deferrable = ForeignKeyDeferrableMode.Deferrable;
            if (matchKeyword(state, "INITIALLY")) {
                initially = parseInitiallyMode(state);
            }
            continue;
        }

        if (matchKeyword(state, "INITIALLY")) {
            initially = parseInitiallyMode(state);
            continue;
        }

        break;
    }

    return {
        table,
        columns,
        onDelete,
        onUpdate,
        match,
        deferrable,
        initially,
        span: spanFromOffsets(
            state,
            startToken.start,
            clauseEndOffset(state, table.span.end.offset),
        ),
    };
}

function parseReferentialAction(state: ParserState): ReferentialAction {
    if (matchKeyword(state, "SET")) {
        if (matchKeyword(state, "NULL")) {
            return ReferentialAction.SetNull;
        }

        expectKeyword(state, "DEFAULT", "Expected NULL or DEFAULT after SET");
        return ReferentialAction.SetDefault;
    }

    if (matchKeyword(state, "CASCADE")) {
        return ReferentialAction.Cascade;
    }

    if (matchKeyword(state, "RESTRICT")) {
        return ReferentialAction.Restrict;
    }

    if (matchKeyword(state, "NO")) {
        expectKeyword(state, "ACTION", "Expected ACTION after NO");
        return ReferentialAction.NoAction;
    }

    throw unexpectedTokenError(
        state,
        ParseErrorCode.UnexpectedToken,
        "Expected referential action",
    );
}

function parseInitiallyMode(state: ParserState): ForeignKeyInitiallyMode {
    if (matchKeyword(state, "DEFERRED")) {
        return ForeignKeyInitiallyMode.Deferred;
    }

    expectKeyword(state, "IMMEDIATE", "Expected DEFERRED or IMMEDIATE");
    return ForeignKeyInitiallyMode.Immediate;
}

function parseIdentifierList(state: ParserState): IdentifierNode[] {
    expectSymbol(state, "(", "Expected '(' to start identifier list");
    const values: IdentifierNode[] = [];

    while (true) {
        values.push(parseIdentifierNode(state));
        if (!matchSymbol(state, ",")) {
            break;
        }
    }

    expectSymbol(state, ")", "Expected ')' to close identifier list");

    return values;
}

function peekIdentifierList(state: ParserState): IdentifierNode[] {
    if (!matchSymbol(state, "(")) {
        return [];
    }

    const values: IdentifierNode[] = [];

    while (true) {
        values.push(parseIdentifierNode(state));
        if (!matchSymbol(state, ",")) {
            break;
        }
    }

    expectSymbol(state, ")", "Expected ')' to close identifier list");

    return values;
}

function parseIndexedColumnList(state: ParserState): IndexedColumnNode[] {
    const openToken = expectSymbol(
        state,
        "(",
        "Expected '(' to start indexed column list",
    );
    const columns: IndexedColumnNode[] = [];

    while (true) {
        const columnStart = currentToken(state).start;
        const column = parseIdentifierNode(state);

        let collation: IdentifierNode | undefined;
        if (matchKeyword(state, "COLLATE")) {
            collation = parseIdentifierNode(state);
        }

        const order = parseOptionalSortOrder(state);
        const endOffset = clauseEndOffset(state, column.span.end.offset);

        columns.push({
            column,
            collation,
            order,
            span: spanFromOffsets(state, columnStart, endOffset),
        });

        if (!matchSymbol(state, ",")) {
            break;
        }
    }

    expectSymbol(state, ")", "Expected ')' to close indexed column list");

    if (columns.length === 0) {
        throw unexpectedTokenError(
            state,
            ParseErrorCode.UnexpectedToken,
            "Expected at least one indexed column",
            openToken,
        );
    }

    return columns;
}

function isTableConstraintStart(state: ParserState): boolean {
    const token = currentToken(state);

    return (
        isKeyword(token, "CONSTRAINT") ||
        isKeyword(token, "PRIMARY") ||
        isKeyword(token, "UNIQUE") ||
        isKeyword(token, "CHECK") ||
        isKeyword(token, "FOREIGN")
    );
}

function isColumnConstraintStart(token: Token): boolean {
    return (
        token.kind === "word" &&
        COLUMN_CONSTRAINT_KEYWORDS.has(token.value.toUpperCase())
    );
}

function isColumnItemTerminator(token: Token): boolean {
    if (token.kind === "eof") {
        return true;
    }

    if (token.kind !== "symbol") {
        return false;
    }

    return token.value === "," || token.value === ")" || token.value === ";";
}

function clauseEndOffset(state: ParserState, fallback: number): number {
    return lastConsumedEnd(state, fallback);
}

function lastConsumedEnd(state: ParserState, fallback: number): number {
    const index = state.cursor - 1;
    if (index < 0) {
        return fallback;
    }

    const token = state.tokens[index];
    return token?.end ?? fallback;
}
