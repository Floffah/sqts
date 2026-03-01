export enum SchemaBuildErrorCode {
    EmptyInput = "ERR_SCHEMA_EMPTY_INPUT",
    UnsupportedDialect = "ERR_SCHEMA_UNSUPPORTED_DIALECT",
    DuplicateTable = "ERR_SCHEMA_DUPLICATE_TABLE",
    InvalidReference = "ERR_SCHEMA_INVALID_REFERENCE",
    InternalInvariant = "ERR_SCHEMA_INTERNAL_INVARIANT",
}

export interface SchemaBuildErrorOptions {
    code: SchemaBuildErrorCode;
    message: string;
    programIndex: number;
    statementIndex: number;
    tableKey?: string;
    details?: Record<string, unknown>;
}

export class SchemaBuildError extends Error {
    readonly code: SchemaBuildErrorCode;
    readonly programIndex: number;
    readonly statementIndex: number;
    readonly tableKey?: string;
    readonly details?: Record<string, unknown>;

    constructor(options: SchemaBuildErrorOptions) {
        super(options.message);

        this.name = "SchemaBuildError";
        this.code = options.code;
        this.programIndex = options.programIndex;
        this.statementIndex = options.statementIndex;
        this.tableKey = options.tableKey;
        this.details = options.details;
    }
}

export function isSchemaBuildError(value: unknown): value is SchemaBuildError {
    return value instanceof SchemaBuildError;
}
