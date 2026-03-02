import { describe, expect, it } from "bun:test";

import {
    buildSqliteSchema,
    parseSql,
    SchemaBuildError,
    SchemaBuildErrorCode,
    SqliteAffinity,
} from "@/index.ts";
import type { SqlProgram } from "@/parser/ast.ts";

describe("buildSqliteSchema", () => {
    it("builds schema from multiple programs in order", () => {
        const programs = [
            parseSql(
                "CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT);",
            ),
            parseSql(
                "CREATE TABLE posts (id INTEGER PRIMARY KEY, user_id INTEGER);",
            ),
        ];

        const schema = buildSqliteSchema(programs);

        expect(schema.tableOrder).toEqual(["main.users", "main.posts"]);
        expect(Object.keys(schema.tables)).toEqual([
            "main.users",
            "main.posts",
        ]);
    });

    it("throws duplicate-table error without IF NOT EXISTS", () => {
        const programs = [
            parseSql("CREATE TABLE users (id INTEGER PRIMARY KEY);"),
            parseSql("CREATE TABLE main.users (id INTEGER PRIMARY KEY);"),
        ];

        expect(() => buildSqliteSchema(programs)).toThrow(SchemaBuildError);

        try {
            buildSqliteSchema(programs);
        } catch (error) {
            const schemaError = error as SchemaBuildError;
            expect(schemaError.code).toBe(SchemaBuildErrorCode.DuplicateTable);
            expect(schemaError.tableKey).toBe("main.users");
        }
    });

    it("matches snapshot for comprehensive schema output", () => {
        const programs = [
            parseSql(`
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  role TEXT DEFAULT 'member',
  profile_id INTEGER REFERENCES profiles(id) ON DELETE SET NULL,
  CONSTRAINT users_email_unique UNIQUE (email),
  FOREIGN KEY (profile_id) REFERENCES profiles(id) ON UPDATE CASCADE,
  CHECK (length(email) > 3)
) STRICT;
            `),
            parseSql(`
CREATE TABLE posts (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  title TEXT
);
            `),
        ];

        const schema = buildSqliteSchema(programs);
        expect(schema).toMatchSnapshot();
    });

    it("treats IF NOT EXISTS duplicate as no-op", () => {
        const programs = [
            parseSql(
                "CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT);",
            ),
            parseSql(
                "CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, email TEXT, extra TEXT);",
            ),
        ];

        const schema = buildSqliteSchema(programs);
        const users = schema.tables["main.users"]!;

        expect(users.columnOrder).toEqual(["id", "email"]);
        expect(users.columns.extra).toBeUndefined();
        expect(users.ifNotExists).toBe(false);
    });

    it("excludes TEMP/TEMPORARY tables", () => {
        const program = parseSql(`
CREATE TEMP TABLE cache (id INTEGER);
CREATE TABLE users (id INTEGER PRIMARY KEY);
        `);

        const schema = buildSqliteSchema([program]);

        expect(schema.tableOrder).toEqual(["main.users"]);
        expect(schema.tables["main.cache"]).toBeUndefined();
    });

    it("uses composite schema.table identity", () => {
        const schema = buildSqliteSchema([
            parseSql("CREATE TABLE users (id INTEGER PRIMARY KEY);"),
            parseSql("CREATE TABLE analytics.users (id INTEGER PRIMARY KEY);"),
        ]);

        expect(schema.tables["main.users"]).toBeDefined();
        expect(schema.tables["analytics.users"]).toBeDefined();
    });

    it("ignores SELECT statements when building schema", () => {
        const schema = buildSqliteSchema([
            parseSql(`
CREATE TABLE users (id INTEGER PRIMARY KEY);
SELECT id FROM users;
            `),
            parseSql(`
SELECT 1;
CREATE TABLE posts (id INTEGER PRIMARY KEY, user_id INTEGER);
            `),
        ]);

        expect(schema.tableOrder).toEqual(["main.users", "main.posts"]);
        expect(schema.tables["main.users"]).toBeDefined();
        expect(schema.tables["main.posts"]).toBeDefined();
    });

    it("maps column metadata and constraint details", () => {
        const schema = buildSqliteSchema([
            parseSql(`
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email VARCHAR(255) COLLATE NOCASE NOT NULL UNIQUE CHECK (length(email) > 3) DEFAULT 'x'
);
            `),
        ]);

        const email = schema.tables["main.users"]!.columns.email!;
        const id = schema.tables["main.users"]!.columns.id!;

        expect(email.declaredType).toBe("VARCHAR(255)");
        expect(email.typeBaseName).toBe("VARCHAR");
        expect(email.typeArgs).toEqual([255]);
        expect(email.affinity).toBe(SqliteAffinity.Text);
        expect(email.collation).toBe("nocase");
        expect(email.defaultExpression).toBe("'x'");
        expect(email.checks).toEqual(["length(email) > 3"]);
        expect(email.unique).toBe(true);

        expect(id.primaryKey).toBe(true);
        expect(id.autoincrement).toBe(true);
    });

    it("derives nullability with explicit constraints and primary keys", () => {
        const schema = buildSqliteSchema([
            parseSql(`
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  optional TEXT NULL,
  required TEXT NOT NULL,
  plain TEXT
);
            `),
            parseSql(`
CREATE TABLE posts (
  id INTEGER,
  slug TEXT,
  PRIMARY KEY (id, slug)
);
            `),
        ]);

        const users = schema.tables["main.users"]!;
        expect(users.columns.id!.nullable).toBe(false);
        expect(users.columns.optional!.nullable).toBe(true);
        expect(users.columns.required!.nullable).toBe(false);
        expect(users.columns.plain!.nullable).toBe(true);

        const posts = schema.tables["main.posts"]!;
        expect(posts.columns.id!.nullable).toBe(false);
        expect(posts.columns.slug!.nullable).toBe(false);
    });

    it("captures column-level and table-level foreign keys", () => {
        const schema = buildSqliteSchema([
            parseSql(`
CREATE TABLE orders (
  id INTEGER PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  product_id INTEGER,
  FOREIGN KEY (product_id) REFERENCES products(id) ON UPDATE SET NULL
);
            `),
        ]);

        const orders = schema.tables["main.orders"]!;

        expect(orders.foreignKeys).toHaveLength(2);
        expect(orders.foreignKeys[0]).toMatchObject({
            columns: ["user_id"],
            onDelete: "cascade",
            references: {
                schema: "main",
                table: "users",
                columns: ["id"],
            },
        });
        expect(orders.foreignKeys[1]).toMatchObject({
            columns: ["product_id"],
            onUpdate: "set_null",
            references: {
                schema: "main",
                table: "products",
                columns: ["id"],
            },
        });

        expect(orders.columns.user_id!.references).toBeDefined();
        expect(orders.columns.product_id!.references).toBeUndefined();
    });

    it("throws on unsupported dialect", () => {
        const invalidProgram = {
            dialect: "postgres",
            statements: [],
            sourceLength: 0,
        } as unknown as SqlProgram;

        expect(() => buildSqliteSchema([invalidProgram])).toThrow(
            SchemaBuildError,
        );

        try {
            buildSqliteSchema([invalidProgram]);
        } catch (error) {
            const schemaError = error as SchemaBuildError;
            expect(schemaError.code).toBe(
                SchemaBuildErrorCode.UnsupportedDialect,
            );
        }
    });

    it("returns empty schema for empty input", () => {
        const schema = buildSqliteSchema([]);
        expect(schema.tableOrder).toEqual([]);
        expect(schema.tables).toEqual({});
    });
});
