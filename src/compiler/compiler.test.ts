import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, test } from "bun:test";
import type { CompilerOptions } from "ts-morph";
import { getCompilerOptionsFromTsConfig } from "ts-morph";

import { compile } from "@/compiler/index.ts";

const compilerOptions = getCompilerOptionsFromTsConfig(
    resolve(process.cwd(), "tsconfig.json"),
) as unknown as CompilerOptions;

async function compileFixture(input: string, filename = "getUser") {
    return compile(input.trim(), filename, {
        compilerOptions,
        executorModule: "sqts/adapters/bun-sqlite",
    });
}

const manyRowsTestFile = `
import { User } from "./";

const { id } = sqts.props as {
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

const { id } = sqts.props as {
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

const singleMutationTestFile = `
const { id } = sqts.props as {
    id: string
}

---

UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $id;
`;

test("Should compile many-row output with mapped aliases", async () => {
    const output = await compileFixture(manyRowsTestFile, "getUsers");
    expect(output).toMatchSnapshot();
});

test("Should compile single-row output with mapped aliases", async () => {
    const output = await compileFixture(singleRowTestFile, "getUser");
    expect(output).toMatchSnapshot();
});

test("Should load executor module from config when override is absent", async () => {
    const configDir = await mkdtemp(join(tmpdir(), "sqts-config-"));

    await writeFile(
        join(configDir, "sqts.config.json"),
        JSON.stringify({
            executor: {
                module: "custom/executor-module",
            },
        }),
    );

    const output = await compile(singleRowTestFile.trim(), "fromConfig", {
        compilerOptions,
        cwd: configDir,
    });

    expect(output).toContain(
        'import { execute as __sqtsExecute } from "custom/executor-module";',
    );
});

test("Should error when executor config is missing", async () => {
    const emptyDir = await mkdtemp(join(tmpdir(), "sqts-empty-config-"));

    expect(
        compile(singleRowTestFile.trim(), "missingConfig", {
            compilerOptions,
            cwd: emptyDir,
        }),
    ).rejects.toThrow("Missing executor config");
});

test("Should error when exported output declaration is missing", async () => {
    expect(
        compileFixture(
            `
import { User } from "./";
const { id } = sqts.props as { id: string }
---
SELECT u.id AS "user.id" FROM users u WHERE u.id = $id;
`,
        ),
    ).rejects.toThrow("Missing exported output declaration");
});

test("Should error when multiple exported outputs are present", async () => {
    expect(
        compileFixture(
            `
import { User } from "./";
const { id } = sqts.props as { id: string }
export const user: User = {} as User
export const users: User[] = []
---
SELECT u.id AS "user.id" FROM users u WHERE u.id = $id;
`,
        ),
    ).rejects.toThrow("Exactly one exported output declaration is required");
});

test("Should error when select item is missing AS alias", async () => {
    expect(
        compileFixture(
            `
import { User } from "./";
const { id } = sqts.props as { id: string }
export const users: User[] = []
---
SELECT u.id, u.email AS "users[].email"
FROM users u
WHERE u.id = $id;
`,
        ),
    ).rejects.toThrow("SELECT item is missing an AS alias");
});

test("Should error when alias root does not match exported output", async () => {
    expect(
        compileFixture(
            `
import { User } from "./";
const { id } = sqts.props as { id: string }
export const users: User[] = []
---
SELECT u.id AS "user.id"
FROM users u
WHERE u.id = $id;
`,
        ),
    ).rejects.toThrow('must start with "users[]."');
});

test("Should error when alias path is invalid", async () => {
    expect(
        compileFixture(
            `
import { User } from "./";
const { id } = sqts.props as { id: string }
export const users: User[] = []
---
SELECT u.id AS "users[].items[].id"
FROM users u
WHERE u.id = $id;
`,
        ),
    ).rejects.toThrow("contains unsupported nested array paths");
});

test("Should compile mutation without output declaration", async () => {
    const output = await compileFixture(singleMutationTestFile, "updateUser");
    expect(output).toMatchSnapshot();
});
