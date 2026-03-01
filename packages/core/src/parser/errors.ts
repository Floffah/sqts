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

export interface SourceLocator {
    lineStarts: number[];
    locate: (offset: number) => { line: number; column: number };
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

export function createSourceLocator(input: string): SourceLocator {
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
