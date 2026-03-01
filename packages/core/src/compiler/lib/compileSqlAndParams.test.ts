import { describe, expect, it } from "bun:test";

import { compileSqlAndParams } from "@/compiler/lib/compileSqlAndParams.ts";

describe("compileSqlAndParams", () => {
    it("rewrites placeholders to positional markers in encounter order", () => {
        const compiled = compileSqlAndParams(
            "SELECT * FROM users WHERE id = $id OR owner_id = $id AND email = $email",
        );

        expect(compiled.compiledSql).toBe(
            "SELECT * FROM users WHERE id = ? OR owner_id = ? AND email = ?",
        );
        expect(compiled.placeholderOrder).toEqual(["id", "id", "email"]);
    });

    it("does not rewrite placeholders inside strings, comments, or quoted identifiers", () => {
        const compiled = compileSqlAndParams(`
SELECT "$id" AS quoted_identifier,
       '$id' AS string_literal,
       id
FROM users
WHERE id = $id
-- $id in line comment
/* $id in block comment */
        `);

        expect(compiled.compiledSql).toContain('"$id"');
        expect(compiled.compiledSql).toContain("'$id'");
        expect(compiled.compiledSql).toContain("id = ?");
        expect(compiled.compiledSql).toContain("-- $id in line comment");
        expect(compiled.compiledSql).toContain("/* $id in block comment */");
        expect(compiled.placeholderOrder).toEqual(["id"]);
    });
});
