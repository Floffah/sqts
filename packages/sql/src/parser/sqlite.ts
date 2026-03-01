import type { SqlProgram, SqlStatement } from "@/parser/ast.ts";
import { parseCreateTableStatement } from "@/parser/create-table.ts";
import {
    createSourceLocator,
    ParseError,
    ParseErrorCode,
} from "@/parser/errors.ts";
import { tokenizeSqlStatement } from "@/parser/lexer.ts";
import {
    isCreateTableStatement,
    isSelectStatement,
    isWithStatement,
    splitSqlStatements,
} from "@/parser/script.ts";
import { parseSelectStatement } from "@/parser/select.ts";

export interface ParseOptions {
    dialect?: "sqlite";
}

export function parseSqlite(
    source: string,
    options: ParseOptions = {},
): SqlProgram {
    void options;

    const locator = createSourceLocator(source);
    const rawStatements = splitSqlStatements(source);
    const statements: SqlStatement[] = [];

    for (const statement of rawStatements) {
        const tokens = tokenizeSqlStatement({
            source,
            statementStart: statement.start,
            statementText: statement.text,
            statementIndex: statement.index,
        });

        if (isCreateTableStatement(statement.text)) {
            statements.push(
                parseCreateTableStatement(tokens, {
                    source,
                    statementIndex: statement.index,
                    statementStart: statement.start,
                    statementEnd: statement.end,
                    locate: locator.locate,
                }),
            );
            continue;
        }

        if (isSelectStatement(statement.text)) {
            statements.push(
                parseSelectStatement(tokens, {
                    source,
                    statementIndex: statement.index,
                    statementStart: statement.start,
                    statementEnd: statement.end,
                    locate: locator.locate,
                }),
            );
            continue;
        }

        if (isWithStatement(statement.text)) {
            throw new ParseError({
                code: ParseErrorCode.UnsupportedSelectClause,
                message:
                    "CTE queries (WITH ...) are not supported in V1 parser",
                source,
                offset: statement.start,
                statementIndex: statement.index,
            });
        }
    }

    return {
        dialect: "sqlite",
        statements,
        sourceLength: source.length,
    };
}
