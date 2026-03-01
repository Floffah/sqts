import { describe, expect, it } from "bun:test";

import { CompilerError, CompilerErrorCode } from "./errors.ts";

describe("CompilerError", () => {
    it("captures code and context fields", () => {
        const error = new CompilerError({
            code: CompilerErrorCode.MissingModelTable,
            message: "Model table missing",
            sourcePath: "queries/getUser.sqts",
            operationName: "GetUser",
            details: { tableKey: "main.users" },
        });

        expect(error).toBeInstanceOf(Error);
        expect(error.name).toBe("CompilerError");
        expect(error.code).toBe(CompilerErrorCode.MissingModelTable);
        expect(error.sourcePath).toBe("queries/getUser.sqts");
        expect(error.operationName).toBe("GetUser");
        expect(error.details).toEqual({ tableKey: "main.users" });
    });
});
