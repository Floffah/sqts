import { resolve } from "path";
import type { CompilerOptions } from "ts-morph";
import { expect, test } from "bun:test";
import { getCompilerOptionsFromTsConfig } from "ts-morph";

import { compile } from "./index.ts";

const testFile = `
import { User } from "./";

const { id } = tsql.props as {
    id: string
}

---

SELECT id, name, email FROM users
WHERE id = $id;
`;

test("Should compile without errors", async () => {
    const compilerOptions = getCompilerOptionsFromTsConfig(
        resolve(process.cwd(), "tsconfig.json"),
    );

    const output = compile(testFile.trim(), "getUser", {
        compilerOptions: compilerOptions as unknown as CompilerOptions,
    });

    console.log(output);
    expect(output).toMatchSnapshot();
});
