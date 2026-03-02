export enum SqtsOperationBodyKind {
    Single = "single",
    Block = "block",
}

export interface SqtsSourcePosition {
    offset: number;
    line: number;
    column: number;
}

export interface SqtsSourceSpan {
    start: SqtsSourcePosition;
    end: SqtsSourcePosition;
}

export interface SqtsStatement {
    sql: string;
    startOffset: number;
    endOffset: number;
    span: SqtsSourceSpan;
}

export interface SqtsOperation {
    name: string;
    bodyKind: SqtsOperationBodyKind;
    statements: SqtsStatement[];
    placeholders: string[];
    startOffset: number;
    endOffset: number;
    span: SqtsSourceSpan;
}

export interface SqtsDocument {
    operations: SqtsOperation[];
    operationNames: string[];
}
