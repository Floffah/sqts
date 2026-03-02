import { describe, expect, it } from "bun:test";

import { CompilerErrorCode } from "@/compiler/errors.ts";
import { resolveSelectOutputInfo } from "@/compiler/lib/resolveSelectOutputInfo.ts";
import {
    createTestCompileContextFromSql,
    expectCompilerErrorCode,
    parseSingleOperation,
} from "@/tests/utils.ts";

describe("resolveSelectOutputInfo", () => {
    it("uses model type imports when modelTypes is enabled", () => {
        const info = resolveSelectOutputInfo(
            parseSingleOperation("GetUser => SELECT * FROM users;"),
            createTestCompileContextFromSql(
                `
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL
);
            `,
                { modelTypes: true },
            ),
            "queries/get-user.sqts",
        );

        expect(info).toEqual({
            returnType: "User[]",
            modelImport: "User",
        });
    });

    it("uses inline row type when modelTypes is disabled", () => {
        const info = resolveSelectOutputInfo(
            parseSingleOperation("GetUser => SELECT * FROM users;"),
            createTestCompileContextFromSql(
                `
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL
);
            `,
                { modelTypes: false },
            ),
            "queries/get-user.sqts",
        );

        expect(info).toBeTruthy();
        expect(info?.modelImport).toBeUndefined();
        expect(info?.returnType).toContain("Array<{");
        expect(info?.returnType).toContain("id: number;");
        expect(info?.returnType).toContain("email: string;");
    });

    it("throws when a SELECT operation has no FROM clause", async () => {
        await expectCompilerErrorCode(
            () =>
                resolveSelectOutputInfo(
                    parseSingleOperation("GetOne => SELECT 1;"),
                    createTestCompileContextFromSql(
                        `
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL
);
            `,
                        { modelTypes: true },
                    ),
                    "queries/get-one.sqts",
                ),
            CompilerErrorCode.MissingSelectFromClause,
        );
    });

    it("throws when the model table is missing from schema", async () => {
        await expectCompilerErrorCode(
            () =>
                resolveSelectOutputInfo(
                    parseSingleOperation("GetGhost => SELECT * FROM ghosts;"),
                    createTestCompileContextFromSql(
                        `
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL
);
            `,
                        { modelTypes: true },
                    ),
                    "queries/get-ghost.sqts",
                ),
            CompilerErrorCode.MissingModelTable,
        );
    });
});
