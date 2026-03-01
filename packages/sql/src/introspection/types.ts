import type {
    ForeignKeyDeferrableMode,
    ForeignKeyInitiallyMode,
    ReferentialAction,
    SqliteAffinity,
} from "@/parser/ast.ts";

export type SqliteTableKey = string;

export type SqliteForeignKeyAction = ReferentialAction;

export type BuildSchemaOptions = Record<string, never>;

export interface SchemaProvenance {
    programIndex: number;
    statementIndex: number;
    spanStartOffset: number;
    spanEndOffset: number;
}

export interface SqliteForeignKey {
    columns: string[];
    references: {
        schema: string;
        table: string;
        columns: string[];
    };
    onDelete?: SqliteForeignKeyAction;
    onUpdate?: SqliteForeignKeyAction;
    match?: string;
    deferrable?: ForeignKeyDeferrableMode;
    initially?: ForeignKeyInitiallyMode;
    name?: string;
}

export interface SqliteTablePrimaryKey {
    columns: string[];
    source: "column" | "table";
}

export interface SqliteUniqueConstraint {
    name?: string;
    columns: string[];
}

export interface SqliteCheckConstraint {
    name?: string;
    expression: string;
}

export type SqliteTableConstraint =
    | {
          kind: "primary_key";
          name?: string;
          columns: string[];
          source: "column" | "table";
      }
    | {
          kind: "unique";
          name?: string;
          columns: string[];
      }
    | {
          kind: "check";
          name?: string;
          expression: string;
      }
    | {
          kind: "foreign_key";
          name?: string;
          foreignKey: SqliteForeignKey;
      };

export interface SqliteSchemaColumn {
    name: string;
    rawName: string;
    declaredType?: string;
    typeBaseName?: string;
    affinity: SqliteAffinity;
    typeArgs?: number[];
    nullable: boolean;
    defaultExpression?: string;
    collation?: string;
    primaryKey: boolean;
    autoincrement: boolean;
    unique: boolean;
    checks: string[];
    references?: SqliteForeignKey;
    provenance: SchemaProvenance;
}

export interface SqliteSchemaTable {
    key: SqliteTableKey;
    schema: string;
    name: string;
    temporary: boolean;
    strict: boolean;
    withoutRowid: boolean;
    ifNotExists: boolean;
    columns: Record<string, SqliteSchemaColumn>;
    columnOrder: string[];
    primaryKey: SqliteTablePrimaryKey | null;
    uniqueConstraints: SqliteUniqueConstraint[];
    checkConstraints: SqliteCheckConstraint[];
    foreignKeys: SqliteForeignKey[];
    provenance: SchemaProvenance;
}

export interface SqliteSchema {
    dialect: "sqlite";
    tables: Record<SqliteTableKey, SqliteSchemaTable>;
    tableOrder: SqliteTableKey[];
}
