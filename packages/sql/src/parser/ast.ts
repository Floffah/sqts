export type Dialect = "sqlite";

export interface SourcePosition {
    offset: number;
    line: number;
    column: number;
}

export interface SourceSpan {
    start: SourcePosition;
    end: SourcePosition;
}

export interface IdentifierNode {
    normalized: string;
    raw: string;
    quoted: boolean;
    span: SourceSpan;
}

export enum SqliteAffinity {
    Integer = "INTEGER",
    Text = "TEXT",
    Blob = "BLOB",
    Real = "REAL",
    Numeric = "NUMERIC",
    Unknown = "UNKNOWN",
}

export interface TypeNameNode {
    declared: string;
    baseName: string;
    args?: number[];
    affinity: SqliteAffinity;
    span: SourceSpan;
}

export type SortOrder = "asc" | "desc";

export interface IndexedColumnNode {
    column: IdentifierNode;
    collation?: IdentifierNode;
    order?: SortOrder;
    span: SourceSpan;
}

export type ReferentialAction =
    | "set_null"
    | "set_default"
    | "cascade"
    | "restrict"
    | "no_action";

export interface ForeignKeyReferenceNode {
    table: IdentifierNode;
    columns: IdentifierNode[];
    onDelete?: ReferentialAction;
    onUpdate?: ReferentialAction;
    match?: string;
    deferrable?: "deferrable" | "not_deferrable";
    initially?: "deferred" | "immediate";
    span: SourceSpan;
}

export interface ConstraintNameNode {
    name: IdentifierNode;
    span: SourceSpan;
}

export type ColumnConstraintNode =
    | {
          kind: "null";
          name?: ConstraintNameNode;
          span: SourceSpan;
      }
    | {
          kind: "not_null";
          name?: ConstraintNameNode;
          span: SourceSpan;
          conflictClause?: string;
      }
    | {
          kind: "primary_key";
          name?: ConstraintNameNode;
          span: SourceSpan;
          order?: SortOrder;
          autoincrement: boolean;
          conflictClause?: string;
      }
    | {
          kind: "unique";
          name?: ConstraintNameNode;
          span: SourceSpan;
          conflictClause?: string;
      }
    | {
          kind: "check";
          name?: ConstraintNameNode;
          span: SourceSpan;
          rawExpression: string;
      }
    | {
          kind: "default";
          name?: ConstraintNameNode;
          span: SourceSpan;
          rawExpression: string;
      }
    | {
          kind: "collate";
          name?: ConstraintNameNode;
          span: SourceSpan;
          collation: IdentifierNode;
      }
    | {
          kind: "references";
          name?: ConstraintNameNode;
          span: SourceSpan;
          references: ForeignKeyReferenceNode;
      };

export interface ColumnDefinition {
    name: IdentifierNode;
    type?: TypeNameNode;
    constraints: ColumnConstraintNode[];
    span: SourceSpan;
}

export type TableConstraintNode =
    | {
          kind: "primary_key";
          name?: ConstraintNameNode;
          columns: IndexedColumnNode[];
          conflictClause?: string;
          span: SourceSpan;
      }
    | {
          kind: "unique";
          name?: ConstraintNameNode;
          columns: IndexedColumnNode[];
          conflictClause?: string;
          span: SourceSpan;
      }
    | {
          kind: "check";
          name?: ConstraintNameNode;
          rawExpression: string;
          span: SourceSpan;
      }
    | {
          kind: "foreign_key";
          name?: ConstraintNameNode;
          columns: IdentifierNode[];
          references: ForeignKeyReferenceNode;
          span: SourceSpan;
      };

export interface CreateTableStatement {
    kind: "create_table";
    schema?: IdentifierNode;
    name: IdentifierNode;
    temporary: boolean;
    ifNotExists: boolean;
    columns: ColumnDefinition[];
    tableConstraints: TableConstraintNode[];
    withoutRowid: boolean;
    strict: boolean;
    span: SourceSpan;
}

export type ExpressionNode =
    | {
          kind: "identifier";
          path: IdentifierNode[];
          span: SourceSpan;
      }
    | {
          kind: "placeholder";
          name: string;
          span: SourceSpan;
      }
    | {
          kind: "literal";
          value: string | number | boolean | null;
          raw: string;
          span: SourceSpan;
      }
    | {
          kind: "binary";
          operator: string;
          left: ExpressionNode;
          right: ExpressionNode;
          span: SourceSpan;
      }
    | {
          kind: "unary";
          operator: string;
          operand: ExpressionNode;
          span: SourceSpan;
      }
    | {
          kind: "paren";
          expression: ExpressionNode;
          span: SourceSpan;
      }
    | {
          kind: "raw";
          raw: string;
          span: SourceSpan;
      };

export interface SelectItem {
    expression: ExpressionNode;
    rawExpression: string;
    alias?: IdentifierNode;
    span: SourceSpan;
}

export interface TableRef {
    schema?: IdentifierNode;
    name: IdentifierNode;
    alias?: IdentifierNode;
    span: SourceSpan;
}

export interface JoinNode {
    type: "inner" | "left";
    table: TableRef;
    on: ExpressionNode;
    span: SourceSpan;
}

export interface FromClause {
    base: TableRef;
    joins: JoinNode[];
    span: SourceSpan;
}

export interface OrderByItem {
    expression: ExpressionNode;
    direction?: "asc" | "desc";
    span: SourceSpan;
}

export interface SelectMetadata {
    placeholders: string[];
    referencedTables: string[];
    outputColumns: string[];
}

export interface SelectStatement {
    kind: "select";
    distinct: boolean;
    items: SelectItem[];
    from?: FromClause;
    where?: ExpressionNode;
    orderBy: OrderByItem[];
    limit?: ExpressionNode;
    offset?: ExpressionNode;
    metadata: SelectMetadata;
    span: SourceSpan;
}

export type SqlStatement = CreateTableStatement | SelectStatement;

export interface SqlProgram {
    dialect: Dialect;
    statements: SqlStatement[];
    sourceLength: number;
}
