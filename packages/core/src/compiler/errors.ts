export enum CompilerErrorCode {
    FailedToParseOperationSql = "ERR_FAILED_TO_PARSE_OPERATION_SQL",
    FailedToCompileStatementSql = "ERR_FAILED_TO_COMPILE_STATEMENT_SQL",
    MissingSelectFromClause = "ERR_MISSING_SELECT_FROM_CLAUSE",
    MissingModelTable = "ERR_MISSING_MODEL_TABLE",
    ConflictingPlaceholderType = "ERR_CONFLICTING_PLACEHOLDER_TYPE",
    AmbiguousIdentifier = "ERR_AMBIGUOUS_IDENTIFIER",
    UnresolvedTableAlias = "ERR_UNRESOLVED_TABLE_ALIAS",
    UnsupportedIdentifierPath = "ERR_UNSUPPORTED_IDENTIFIER_PATH",
    UnresolvedTable = "ERR_UNRESOLVED_TABLE",
    UnresolvedColumn = "ERR_UNRESOLVED_COLUMN",
    InvalidProjectionExpression = "ERR_INVALID_PROJECTION_EXPRESSION",
    MissingProjectionAlias = "ERR_MISSING_PROJECTION_ALIAS",
    DuplicateProjectionOutputKey = "ERR_DUPLICATE_PROJECTION_OUTPUT_KEY",
    UnsupportedProjectionWildcard = "ERR_UNSUPPORTED_PROJECTION_WILDCARD",
    InvalidSelectProjectionReference = "ERR_INVALID_SELECT_PROJECTION_REFERENCE",
}

export class CompilerError extends Error {
    readonly code: CompilerErrorCode;
    readonly sourcePath?: string;
    readonly operationName?: string;
    readonly details?: Record<string, unknown>;

    constructor(options: {
        code: CompilerErrorCode;
        message: string;
        sourcePath?: string;
        operationName?: string;
        details?: Record<string, unknown>;
        cause?: unknown;
    }) {
        super(options.message, { cause: options.cause });
        this.name = "CompilerError";
        this.code = options.code;
        this.sourcePath = options.sourcePath;
        this.operationName = options.operationName;
        this.details = options.details;
    }
}
