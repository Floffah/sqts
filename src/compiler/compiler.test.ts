import { resolve } from "path";
import type { CompilerOptions } from "ts-morph";
import { expect, test } from "bun:test";
import { getCompilerOptionsFromTsConfig } from "ts-morph";

import { compile } from "./index.ts";

const compilerOptions = getCompilerOptionsFromTsConfig(
    resolve(process.cwd(), "tsconfig.json"),
) as unknown as CompilerOptions;

function compileFixture(input: string, filename = "getUser") {
    return compile(input.trim(), filename, {
        compilerOptions,
    });
}

const manyRowsTestFile = `
import { User } from "./";

const { id } = tsql.props as {
    id: string
}

export const users: User[] = []

---

SELECT
    u.id AS users[].id,
    u.email AS "users[].email"
FROM users u
WHERE u.id = $id;
`;

const singleRowTestFile = `
import { User } from "./";

const { id } = tsql.props as {
    id: string
}

export const user: User = {} as User

---

SELECT
    u.id AS user.id,
    u.email AS "user.email"
FROM users u
WHERE u.id = $id;
`;

test("Should compile many-row output with mapped aliases", async () => {
    const output = compileFixture(manyRowsTestFile, "getUsers");
    expect(output).toMatchSnapshot();
});

test("Should compile single-row output with mapped aliases", async () => {
    const output = compileFixture(singleRowTestFile, "getUser");
    expect(output).toMatchSnapshot();
});

test("Should error when exported output declaration is missing", async () => {
    expect(() =>
        compileFixture(
            `
import { User } from "./";
const { id } = tsql.props as { id: string }
---
SELECT u.id AS "user.id" FROM users u WHERE u.id = $id;
`,
        ),
    ).toThrow("Missing exported output declaration");
});

test("Should error when multiple exported outputs are present", async () => {
    expect(() =>
        compileFixture(
            `
import { User } from "./";
const { id } = tsql.props as { id: string }
export const user: User = {} as User
export const users: User[] = []
---
SELECT u.id AS "user.id" FROM users u WHERE u.id = $id;
`,
        ),
    ).toThrow("Exactly one exported output declaration is required");
});

test("Should error when select item is missing AS alias", async () => {
    expect(() =>
        compileFixture(
            `
import { User } from "./";
const { id } = tsql.props as { id: string }
export const users: User[] = []
---
SELECT u.id, u.email AS "users[].email"
FROM users u
WHERE u.id = $id;
`,
        ),
    ).toThrow("SELECT item is missing an AS alias");
});

test("Should error when alias root does not match exported output", async () => {
    expect(() =>
        compileFixture(
            `
import { User } from "./";
const { id } = tsql.props as { id: string }
export const users: User[] = []
---
SELECT u.id AS "user.id"
FROM users u
WHERE u.id = $id;
`,
        ),
    ).toThrow('must start with "users[]."');
});

test("Should error when alias path is invalid", async () => {
    expect(() =>
        compileFixture(
            `
import { User } from "./";
const { id } = tsql.props as { id: string }
export const users: User[] = []
---
SELECT u.id AS "users[].items[].id"
FROM users u
WHERE u.id = $id;
`,
        ),
    ).toThrow("contains unsupported nested array paths");
});
