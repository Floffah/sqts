import { describe, expect, it } from "bun:test";

import { CompilerErrorCode } from "@/compiler/errors.ts";
import { inferPlaceholderTypes } from "@/compiler/lib/inferPlaceholderTypes.ts";
import {
    createTestCompileContextFromSql,
    expectCompilerErrorCode,
    parseSingleOperation,
} from "@/tests/utils.ts";

describe("inferPlaceholderTypes", () => {
    it("infers placeholder types from supported equality expressions", () => {
        const operation = parseSingleOperation(
            "GetUser => SELECT * FROM users u WHERE u.id = $id AND $email = u.email;",
        );
        const inferred = inferPlaceholderTypes(
            operation,
            createTestCompileContextFromSql(`
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL
);
            `),
            "queries/get-user.sqts",
        );

        expect(inferred.get("id")).toBe("number");
        expect(inferred.get("email")).toBe("string");
    });

    it("leaves placeholders unknown when no supported inference shape exists", () => {
        const operation = parseSingleOperation(
            "GetUser => SELECT * FROM users WHERE COALESCE(users.id, 0) = $id;",
        );
        const inferred = inferPlaceholderTypes(
            operation,
            createTestCompileContextFromSql(`
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL
);
            `),
            "queries/get-user.sqts",
        );

        expect(inferred.has("id")).toBe(false);
    });

    it("throws on conflicting placeholder type inference", async () => {
        const operation = parseSingleOperation(
            "GetUser => SELECT * FROM users WHERE users.id = $id OR users.email = $id;",
        );

        await expectCompilerErrorCode(
            () =>
                inferPlaceholderTypes(
                    operation,
                    createTestCompileContextFromSql(`
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL
);
            `),
                    "queries/get-user.sqts",
                ),
            CompilerErrorCode.ConflictingPlaceholderType,
        );
    });
});
