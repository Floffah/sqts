import { describe, expect, it } from "bun:test";

import {
    ParseError,
    ParseErrorCode,
    parseSql,
    ReferentialAction,
    SqliteAffinity,
} from "@/index.ts";

describe("parseSqlite", () => {
    it("parses CREATE TABLE statements with column and table constraints", () => {
        const sql = `
CREATE TABLE IF NOT EXISTS main.users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  role TEXT DEFAULT 'member',
  profile_id INTEGER REFERENCES profiles(id) ON DELETE SET NULL,
  CONSTRAINT users_email_unique UNIQUE (email),
  FOREIGN KEY (profile_id) REFERENCES profiles(id) ON UPDATE CASCADE,
  CHECK (length(email) > 3)
) STRICT;
        `;

        const program = parseSql(sql);
        expect(program.dialect).toBe("sqlite");
        expect(program.statements).toHaveLength(1);

        const statement = program.statements[0]!;
        expect(statement.kind).toBe("create_table");

        if (statement.kind !== "create_table") {
            throw new Error("Expected create_table statement");
        }

        expect(statement.schema?.normalized).toBe("main");
        expect(statement.name.normalized).toBe("users");
        expect(statement.ifNotExists).toBe(true);
        expect(statement.strict).toBe(true);

        expect(statement.columns).toHaveLength(4);
        expect(statement.columns[0]?.name.normalized).toBe("id");
        expect(statement.columns[0]?.type?.affinity).toBe(
            SqliteAffinity.Integer,
        );

        expect(
            statement.columns[1]?.constraints.some(
                (c) => c.kind === "not_null",
            ),
        ).toBe(true);
        expect(
            statement.columns[1]?.constraints.some((c) => c.kind === "unique"),
        ).toBe(true);

        expect(statement.columns[2]?.constraints[0]).toMatchObject({
            kind: "default",
            rawExpression: "'member'",
        });

        const referencesConstraint = statement.columns[3]?.constraints.find(
            (constraint) => constraint.kind === "references",
        );
        expect(referencesConstraint).toBeDefined();
        if (
            referencesConstraint &&
            referencesConstraint.kind === "references"
        ) {
            expect(referencesConstraint.references.table.normalized).toBe(
                "profiles",
            );
            expect(referencesConstraint.references.onDelete).toBe(
                ReferentialAction.SetNull,
            );
        }

        expect(
            statement.tableConstraints.some((c) => c.kind === "unique"),
        ).toBe(true);
        expect(
            statement.tableConstraints.some((c) => c.kind === "foreign_key"),
        ).toBe(true);
        expect(statement.tableConstraints.some((c) => c.kind === "check")).toBe(
            true,
        );
    });

    it("matches snapshot for a comprehensive CREATE TABLE parse", () => {
        const sql = `
CREATE TABLE IF NOT EXISTS main.users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  role TEXT DEFAULT 'member',
  profile_id INTEGER REFERENCES profiles(id) ON DELETE SET NULL,
  CONSTRAINT users_email_unique UNIQUE (email),
  FOREIGN KEY (profile_id) REFERENCES profiles(id) ON UPDATE CASCADE,
  CHECK (length(email) > 3)
) STRICT;
        `;

        const program = parseSql(sql);
        expect(program).toMatchSnapshot();
    });

    it("parses basic SELECT with FROM, WHERE, ORDER BY, LIMIT and OFFSET", () => {
        const sql = `
SELECT u.id, u.email AS user_email
FROM users u
WHERE u.id = $id
ORDER BY u.created_at DESC
LIMIT 10 OFFSET 5;
        `;

        const program = parseSql(sql);
        expect(program.statements).toHaveLength(1);

        const statement = program.statements[0]!;
        expect(statement.kind).toBe("select");
        if (statement.kind !== "select") {
            throw new Error("Expected select statement");
        }

        expect(statement.items).toHaveLength(2);
        expect(statement.items[1]?.alias?.normalized).toBe("user_email");
        expect(statement.from?.base.name.normalized).toBe("users");
        expect(statement.from?.base.alias?.normalized).toBe("u");
        expect(statement.where?.kind).toBe("binary");
        expect(statement.orderBy).toHaveLength(1);
        expect(statement.orderBy[0]?.direction).toBe("desc");
        expect(statement.limit?.kind).toBe("literal");
        expect(statement.offset?.kind).toBe("literal");
    });

    it("parses SELECT without FROM", () => {
        const program = parseSql("SELECT 1 AS one;");
        const statement = program.statements[0]!;

        expect(statement.kind).toBe("select");
        if (statement.kind !== "select") {
            throw new Error("Expected select statement");
        }

        expect(statement.from).toBeUndefined();
        expect(statement.items[0]?.alias?.normalized).toBe("one");
    });

    it("parses DISTINCT and mixed alias styles", () => {
        const program = parseSql(
            "SELECT DISTINCT u.id uid, u.email AS email_alias FROM users u;",
        );

        const statement = program.statements[0]!;
        expect(statement.kind).toBe("select");
        if (statement.kind !== "select") {
            throw new Error("Expected select statement");
        }

        expect(statement.distinct).toBe(true);
        expect(statement.items[0]?.alias?.normalized).toBe("uid");
        expect(statement.items[1]?.alias?.normalized).toBe("email_alias");
    });

    it("parses INNER and LEFT joins", () => {
        const sql = `
SELECT u.id, p.id AS post_id
FROM users u
INNER JOIN posts p ON p.user_id = u.id
LEFT JOIN comments c ON c.post_id = p.id;
        `;

        const statement = parseSql(sql).statements[0]!;
        expect(statement.kind).toBe("select");
        if (statement.kind !== "select") {
            throw new Error("Expected select statement");
        }

        expect(statement.from?.joins).toHaveLength(2);
        expect(statement.from?.joins[0]?.type).toBe("inner");
        expect(statement.from?.joins[1]?.type).toBe("left");
    });

    it("extracts SELECT metadata", () => {
        const sql = `
SELECT u.id AS uid, p.title
FROM users u
LEFT JOIN posts p ON p.user_id = u.id
WHERE u.id = $id OR p.author_id = $id;
        `;

        const statement = parseSql(sql).statements[0]!;
        expect(statement.kind).toBe("select");
        if (statement.kind !== "select") {
            throw new Error("Expected select statement");
        }

        expect(statement.metadata.placeholders).toEqual(["id"]);
        expect(statement.metadata.referencedTables).toEqual([
            "main.users",
            "main.posts",
        ]);
        expect(statement.metadata.outputColumns).toEqual(["uid", "title"]);
    });

    it("throws on unsupported SELECT clauses", () => {
        expect(() => parseSql("SELECT id FROM users GROUP BY id;")).toThrow(
            ParseError,
        );

        try {
            parseSql("SELECT id FROM users GROUP BY id;");
        } catch (error) {
            const parseError = error as ParseError;
            expect(parseError.code).toBe(
                ParseErrorCode.UnsupportedSelectClause,
            );
        }

        expect(() =>
            parseSql("WITH cte AS (SELECT 1) SELECT * FROM cte;"),
        ).toThrow(ParseError);
    });

    it("throws on unsupported join types", () => {
        expect(() =>
            parseSql(
                "SELECT u.id FROM users u RIGHT JOIN posts p ON p.user_id = u.id;",
            ),
        ).toThrow(ParseError);

        try {
            parseSql(
                "SELECT u.id FROM users u RIGHT JOIN posts p ON p.user_id = u.id;",
            );
        } catch (error) {
            const parseError = error as ParseError;
            expect(parseError.code).toBe(ParseErrorCode.UnsupportedJoinType);
        }
    });

    it("parses mixed scripts and skips non-target statements", () => {
        const sql = `
INSERT INTO logs (message) VALUES ('x');
CREATE TABLE users (id INTEGER PRIMARY KEY);
SELECT id FROM users;
UPDATE users SET id = 1;
        `;

        const program = parseSql(sql);
        expect(program.statements).toHaveLength(2);
        expect(program.statements[0]?.kind).toBe("create_table");
        expect(program.statements[1]?.kind).toBe("select");
    });

    it("matches snapshot for a comprehensive SELECT parse", () => {
        const sql = `
SELECT DISTINCT
    u.id AS user_id,
    u.email,
    p.title AS post_title
FROM users u
INNER JOIN posts p ON p.user_id = u.id
LEFT JOIN comments c ON c.post_id = p.id
WHERE u.id = $id AND p.is_published = 1
ORDER BY p.created_at DESC, u.id ASC
LIMIT 25 OFFSET 5;
        `;

        const program = parseSql(sql);
        expect(program).toMatchSnapshot();
    });

    it("throws ParseError with location/snippet on invalid CREATE TABLE", () => {
        const sql = `
CREATE TABLE users (
  id INTEGER,
  email TEXT
;
        `;

        expect(() => parseSql(sql)).toThrow(ParseError);

        try {
            parseSql(sql);
        } catch (error) {
            const parseError = error as ParseError;
            expect(parseError.code).toBe(ParseErrorCode.UnexpectedToken);
            expect(parseError.line).toBeGreaterThan(0);
            expect(parseError.column).toBeGreaterThan(0);
            expect(parseError.snippet).toContain("^");
        }
    });

    it("throws on duplicate columns", () => {
        const sql = `
CREATE TABLE users (
  id INTEGER,
  id TEXT
);
        `;

        expect(() => parseSql(sql)).toThrow(ParseError);

        try {
            parseSql(sql);
        } catch (error) {
            const parseError = error as ParseError;
            expect(parseError.code).toBe(ParseErrorCode.DuplicateColumnName);
        }
    });
});
