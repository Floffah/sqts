import { describe, expect, it } from "bun:test";

import {
    parseDocument,
    SqtsParseError,
    SqtsParseErrorCode,
    SqtsOperationBodyKind,
} from "./index.ts";

describe("parseDocument", () => {
    it("parses a single statement operation", () => {
        const input = `GetUser => SELECT id, email FROM users WHERE id = $id;`;
        const document = parseDocument(input);

        expect(document.operationNames).toEqual(["GetUser"]);
        expect(document.operations).toHaveLength(1);
        expect(document.operations[0]?.bodyKind).toBe(
            SqtsOperationBodyKind.Single,
        );
        expect(document.operations[0]?.statements[0]?.sql).toBe(
            "SELECT id, email FROM users WHERE id = $id",
        );
        expect(document.operations[0]?.placeholders).toEqual(["$id"]);
    });

    it("parses a block operation with multiple statements", () => {
        const input = `
UpdateUser => (
    UPDATE users SET name = $name WHERE id = $id;
    UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = $id;
)
        `;

        const document = parseDocument(input);
        const operation = document.operations[0]!;

        expect(operation.bodyKind).toBe(SqtsOperationBodyKind.Block);
        expect(operation.statements).toHaveLength(2);
        expect(operation.placeholders).toEqual(["$name", "$id"]);
    });

    it("accepts an empty block", () => {
        const document = parseDocument("Noop => ()");
        const operation = document.operations[0]!;

        expect(operation.bodyKind).toBe(SqtsOperationBodyKind.Block);
        expect(operation.statements).toEqual([]);
        expect(operation.placeholders).toEqual([]);
    });

    it("accepts an optional trailing semicolon after block close", () => {
        const document = parseDocument("Noop => ();");
        expect(document.operations).toHaveLength(1);
        expect(document.operations[0]?.statements).toHaveLength(0);
    });

    it("does not split statements on semicolons inside strings and comments", () => {
        const input = `
Complex => (
    SELECT ';' AS semi, "a;b" AS dquoted, \`x;y\` AS bt, [m;n] AS br;
    SELECT 1 -- comment ; ignored
    ;
    SELECT 2 /* block ; comment */ + 3;
)
        `;

        const document = parseDocument(input);
        const statements = document.operations[0]!.statements;

        expect(statements).toHaveLength(3);
        expect(statements[0]?.sql).toContain("';' AS semi");
        expect(statements[1]?.sql).toContain("SELECT 1");
        expect(statements[2]?.sql).toContain("SELECT 2");
    });

    it("throws on duplicate operation names", () => {
        const input = `
GetUser => SELECT * FROM users;
GetUser => SELECT * FROM users WHERE id = $id;
        `;

        expect(() => parseDocument(input)).toThrow(SqtsParseError);

        try {
            parseDocument(input);
        } catch (error) {
            const parseError = error as SqtsParseError;
            expect(parseError.code).toBe(
                SqtsParseErrorCode.DuplicateOperationName,
            );
        }
    });

    it("throws ExpectedSemicolon for single variant missing semicolon", () => {
        const input = `GetUser => SELECT * FROM users`;
        expect(() => parseDocument(input)).toThrow(SqtsParseError);

        try {
            parseDocument(input);
        } catch (error) {
            const parseError = error as SqtsParseError;
            expect(parseError.code).toBe(SqtsParseErrorCode.ExpectedSemicolon);
        }
    });

    it("throws InvalidTopLevelContent for stray top-level SQL", () => {
        const input = `SELECT * FROM users;`;
        expect(() => parseDocument(input)).toThrow(SqtsParseError);

        try {
            parseDocument(input);
        } catch (error) {
            const parseError = error as SqtsParseError;
            expect(parseError.code).toBe(
                SqtsParseErrorCode.InvalidTopLevelContent,
            );
        }
    });

    it("extracts placeholders in encounter order and ignores strings/comments", () => {
        const input = `
GetData => (
    SELECT $id, $name, $id;
    SELECT '$ignored', "-- $ignored2", col FROM table_name WHERE key = $key;
    SELECT 1 /* $ignored3 */ + $name;
);
        `;

        const document = parseDocument(input);
        expect(document.operations[0]?.placeholders).toEqual([
            "$id",
            "$name",
            "$key",
        ]);
    });

    it("matches snapshot for a comprehensive mixed document", () => {
        const input = `
GetUser => SELECT u.id, u.email FROM users u WHERE u.id = $id;

UpdateUser => (
    UPDATE users SET name = $name WHERE id = $id;
    UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = $id;
);

Audit => (
    INSERT INTO audit_logs(user_id, detail) VALUES($id, 'updated; user');
    SELECT 1; -- trailing marker;
);
        `;

        const document = parseDocument(input);
        expect(document).toMatchSnapshot();
    });
});
