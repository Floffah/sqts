import { describe, expect, it } from "bun:test";

import { CompilerErrorCode } from "@/compiler/errors.ts";
import { deriveSelectProjection } from "@/compiler/lib/deriveSelectProjection.ts";
import {
    createTestCompileContextFromSql,
    expectCompilerErrorCode,
    parseSingleOperation,
    parseSqlExpectSelect,
} from "@/tests/utils.ts";

describe("deriveSelectProjection", () => {
    it("derives projection fields from aliases, placeholders, and wildcards", () => {
        const operation = parseSingleOperation(
            "GetUsers => SELECT u.id AS user_id, $id AS request_id, u.* FROM users u WHERE u.id = $id;",
        );
        const select = parseSqlExpectSelect(
            "SELECT u.id AS user_id, $id AS request_id, u.* FROM users u WHERE u.id = $id;",
        );
        const ctx = createTestCompileContextFromSql(`
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL,
  bio TEXT
);
        `);

        const projection = deriveSelectProjection({
            select,
            operation,
            sourcePath: "queries/get-users.sqts",
            compileContext: ctx,
            inferredPlaceholderTypes: new Map([["id", "number"]]),
        });

        expect(projection.fields).toEqual([
            { outputKey: "user_id", propertyKey: "user_id", tsType: "number" },
            {
                outputKey: "request_id",
                propertyKey: "request_id",
                tsType: "number",
            },
            { outputKey: "id", propertyKey: "id", tsType: "number" },
            { outputKey: "email", propertyKey: "email", tsType: "string" },
            { outputKey: "bio", propertyKey: "bio", tsType: "string | null" },
        ]);
        expect(projection.rowTypeLiteral).toContain("user_id: number;");
        expect(projection.rowTypeLiteral).toContain("request_id: number;");
        expect(projection.rowTypeLiteral).toContain("bio: string | null;");
    });

    it("throws for duplicate projection output keys", async () => {
        const operation = parseSingleOperation(
            "Collision => SELECT users.id, posts.id FROM users INNER JOIN posts ON posts.user_id = users.id;",
        );
        const select = parseSqlExpectSelect(
            "SELECT users.id, posts.id FROM users INNER JOIN posts ON posts.user_id = users.id;",
        );
        const ctx = createTestCompileContextFromSql(`
CREATE TABLE users (
  id INTEGER PRIMARY KEY
);
CREATE TABLE posts (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL
);
        `);

        await expectCompilerErrorCode(
            () =>
                deriveSelectProjection({
                    select,
                    operation,
                    sourcePath: "queries/collision.sqts",
                    compileContext: ctx,
                    inferredPlaceholderTypes: new Map(),
                }),
            CompilerErrorCode.DuplicateProjectionOutputKey,
        );
    });

    it("throws for complex unaliased projection expressions", async () => {
        const operation = parseSingleOperation(
            "CountUsers => SELECT COUNT(*) FROM users;",
        );
        const select = parseSqlExpectSelect("SELECT COUNT(*) FROM users;");
        const ctx = createTestCompileContextFromSql(`
CREATE TABLE users (
  id INTEGER PRIMARY KEY
);
        `);

        await expectCompilerErrorCode(
            () =>
                deriveSelectProjection({
                    select,
                    operation,
                    sourcePath: "queries/count-users.sqts",
                    compileContext: ctx,
                    inferredPlaceholderTypes: new Map(),
                }),
            CompilerErrorCode.MissingProjectionAlias,
        );
    });
});
