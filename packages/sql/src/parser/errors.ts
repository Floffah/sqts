export enum ParseErrorCode {
    UnexpectedToken = "ERR_UNEXPECTED_TOKEN",
    ExpectedIdentifier = "ERR_EXPECTED_IDENTIFIER",
    ExpectedTableBody = "ERR_EXPECTED_TABLE_BODY",
    DuplicateColumnName = "ERR_DUPLICATE_COLUMN_NAME",
    InvalidCreateTableForm = "ERR_INVALID_CREATE_TABLE_FORM",
    InvalidSelectForm = "ERR_INVALID_SELECT_FORM",
    UnsupportedSelectClause = "ERR_UNSUPPORTED_SELECT_CLAUSE",
    UnsupportedJoinType = "ERR_UNSUPPORTED_JOIN_TYPE",
    UnterminatedString = "ERR_UNTERMINATED_STRING",
    UnterminatedComment = "ERR_UNTERMINATED_COMMENT",
}

export interface ParseErrorOptions {
    code: ParseErrorCode;
    message: string;
    source: string;
    offset: number;
    statementIndex: number;
}

export class ParseError extends Error {
    readonly code: ParseErrorCode;
    readonly offset: number;
    readonly line: number;
    readonly column: number;
    readonly statementIndex: number;
    readonly snippet: string;

    constructor(options: ParseErrorOptions) {
        const locator = createSourceLocator(options.source);
        const { line, column } = locator.locate(options.offset);
        const snippet = createSnippet(
            options.source,
            locator.lineStarts,
            line,
            column,
        );

        super(`${options.message} (line ${line}, column ${column})`);
        this.name = "ParseError";
        this.code = options.code;
        this.offset = options.offset;
        this.line = line;
        this.column = column;
        this.statementIndex = options.statementIndex;
        this.snippet = snippet;
    }
}

export interface SourceLocator {
    lineStarts: number[];
    locate: (offset: number) => { line: number; column: number };
}

export function createSourceLocator(source: string): SourceLocator {
    const lineStarts: number[] = [0];

    for (let i = 0; i < source.length; i += 1) {
        if (source[i] === "\n") {
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
                return { line: mid + 1, column: offset - start + 1 };
            }
        }

        const lastLineStart = lineStarts[lineStarts.length - 1] ?? 0;
        return {
            line: lineStarts.length,
            column: Math.max(1, offset - lastLineStart + 1),
        };
    };

    return { lineStarts, locate };
}

export function isParseError(value: unknown): value is ParseError {
    return value instanceof ParseError;
}

function createSnippet(
    source: string,
    lineStarts: number[],
    line: number,
    column: number,
): string {
    const lineIndex = line - 1;
    const start = lineStarts[lineIndex] ?? 0;
    const end = source.indexOf("\n", start);
    const lineText = source.slice(start, end === -1 ? source.length : end);
    const caretPadding = " ".repeat(Math.max(0, column - 1));

    return `${lineText}\n${caretPadding}^`;
}
