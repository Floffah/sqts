import { access, mkdir, mkdtemp, readFile, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { beforeAll, beforeEach, describe, expect, it, mock } from "bun:test";

interface FakeWatcherHandler {
    (path: string): unknown;
}

class FakeWatcher {
    private readonly handlers = new Map<string, FakeWatcherHandler[]>();

    on(event: string, handler: FakeWatcherHandler): FakeWatcher {
        const existing = this.handlers.get(event) ?? [];
        existing.push(handler);
        this.handlers.set(event, existing);
        return this;
    }

    async emit(event: string, path: string): Promise<void> {
        const handlers = this.handlers.get(event) ?? [];
        for (const handler of handlers) {
            await handler(path);
        }
    }

    async close(): Promise<void> {
        this.handlers.clear();
    }
}

interface WatchCall {
    target: string;
    options: {
        cwd?: string;
        ignoreInitial?: boolean;
        alwaysStat?: boolean;
        ignored?: (path: string, stats?: { isFile(): boolean }) => boolean;
    };
    watcher: FakeWatcher;
}

let watchCalls: WatchCall[] = [];
let watchAndCompileProject: (typeof import("@/compiler/compileProject.ts"))["watchAndCompileProject"];
let compileProject: (typeof import("@/compiler/compileProject.ts"))["compileProject"];

beforeAll(async () => {
    mock.module("chokidar", () => ({
        watch: (target: string, options: WatchCall["options"]) => {
            const watcher = new FakeWatcher();
            watchCalls.push({
                target,
                options,
                watcher,
            });
            return watcher;
        },
    }));

    const mod = await import("@/compiler/compileProject.ts");
    watchAndCompileProject = mod.watchAndCompileProject;
    compileProject = mod.compileProject;
});

beforeEach(() => {
    watchCalls = [];
});

describe("watchAndCompileProject", () => {
    it("sets up watcher and performs initial compile", async () => {
        const fixture = await createWatchFixture({
            migrationSql: `
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL
);
            `,
            operationSql:
                "GetUser => SELECT * FROM users WHERE users.id = $id;",
        });

        const watcher = (await watchAndCompileProject({
            cwd: fixture.cwd,
            inMemory: false,
        })) as unknown as FakeWatcher;

        try {
            expect(watchCalls).toHaveLength(1);
            const call = watchCalls[0]!;
            expect(call.target).toBe(".");
            expect(call.options.cwd).toBe(fixture.cwd);
            expect(call.options.ignoreInitial).toBe(true);
            expect(call.options.alwaysStat).toBe(true);
            expect(watcher).toBe(call.watcher);

            const output = await readFile(fixture.outputPath, "utf-8");
            expect(output).toContain("export async function GetUser");
        } finally {
            await watcher.close();
        }
    });

    it("recompiles on .sqts change", async () => {
        const fixture = await createWatchFixture({
            migrationSql: `
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL
);
            `,
            operationSql:
                "GetUser => SELECT * FROM users WHERE users.id = $id;",
        });

        const watcher = (await watchAndCompileProject({
            cwd: fixture.cwd,
        })) as unknown as FakeWatcher;

        try {
            const initial = await readFile(fixture.outputPath, "utf-8");
            expect(initial).toContain("export async function GetUser");

            await writeFile(
                fixture.queryPath,
                "ListUsers => SELECT * FROM users WHERE users.id = $id;",
            );

            await watcher.emit("change", "queries/user.sqts");
            const updated = await waitForFileToContain(
                fixture.outputPath,
                "export async function ListUsers",
            );
            expect(updated).toContain("export async function ListUsers");
        } finally {
            await watcher.close();
        }
    });

    it("refreshes schema on .sql change then recompiles with new inferred types", async () => {
        const fixture = await createWatchFixture({
            migrationSql: `
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL
);
            `,
            operationSql:
                "GetUser => SELECT * FROM users WHERE users.id = $id;",
        });

        const watcher = (await watchAndCompileProject({
            cwd: fixture.cwd,
        })) as unknown as FakeWatcher;

        try {
            const initial = await readFile(fixture.outputPath, "utf-8");
            expect(initial).toContain("params: { id: number; }");

            await writeFile(
                fixture.migrationPath,
                `
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL
);
                `,
            );

            await watcher.emit("change", "migrations/0001-init.sql");
            const updated = await waitForFileToContain(
                fixture.outputPath,
                "params: { id: string; }",
            );
            expect(updated).toContain("params: { id: string; }");
        } finally {
            await watcher.close();
        }
    });

    it("respects inMemory=true for initial and change recompiles", async () => {
        const fixture = await createWatchFixture({
            migrationSql: `
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL
);
            `,
            operationSql:
                "GetUser => SELECT * FROM users WHERE users.id = $id;",
        });

        const watcher = (await watchAndCompileProject({
            cwd: fixture.cwd,
            inMemory: true,
        })) as unknown as FakeWatcher;

        try {
            expect(await fileExists(fixture.outputPath)).toBe(false);

            await writeFile(
                fixture.queryPath,
                "ListUsers => SELECT * FROM users WHERE users.id = $id;",
            );
            await watcher.emit("change", "queries/user.sqts");
            await sleep(900);

            expect(await fileExists(fixture.outputPath)).toBe(false);

            const tsProj = await compileProject({
                cwd: fixture.cwd,
                inMemory: true,
            });
            expect(tsProj.getSourceFile(fixture.outputPath)).toBeDefined();
        } finally {
            await watcher.close();
        }
    });

    it("ignored predicate behavior is correct", async () => {
        const fixture = await createWatchFixture({
            migrationSql: `
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL
);
            `,
            operationSql:
                "GetUser => SELECT * FROM users WHERE users.id = $id;",
        });

        const watcher = (await watchAndCompileProject({
            cwd: fixture.cwd,
        })) as unknown as FakeWatcher;

        try {
            const call = watchCalls[0]!;
            const ignored = call.options.ignored;
            expect(typeof ignored).toBe("function");
            if (!ignored) {
                throw new Error("Watcher ignored predicate was not defined");
            }

            const fileStats = {
                isFile: () => true,
            };

            expect(ignored("src/file.ts", fileStats)).toBe(true);
            expect(ignored("queries/user.sqts", fileStats)).toBe(false);
            expect(ignored("migrations/0001-init.sql", fileStats)).toBe(false);
            expect(ignored("node_modules/dep/file.sqts", fileStats)).toBe(true);
            expect(ignored("dist/build.sql", fileStats)).toBe(true);
        } finally {
            await watcher.close();
        }
    });
});

async function createWatchFixture(options: {
    migrationSql: string;
    operationSql: string;
}): Promise<{
    cwd: string;
    queryPath: string;
    migrationPath: string;
    outputPath: string;
}> {
    const root = await mkdtemp(join(tmpdir(), "sqts-core-watch-"));

    await mkdir(resolve(root, "queries"), { recursive: true });
    await mkdir(resolve(root, "migrations"), { recursive: true });

    const queryPath = resolve(root, "queries/user.sqts");
    const migrationPath = resolve(root, "migrations/0001-init.sql");

    await writeFile(queryPath, options.operationSql);
    await writeFile(migrationPath, options.migrationSql);
    await writeFile(
        resolve(root, "sqts.config.ts"),
        `
export default {
    executor: {
        module: "@sqts/core/adapters/bun-sqlite",
    },
};
        `.trimStart(),
    );

    return {
        cwd: root,
        queryPath,
        migrationPath,
        outputPath: resolve(root, ".sqts/index.ts"),
    };
}

async function fileExists(path: string): Promise<boolean> {
    return access(path)
        .then(() => true)
        .catch(() => false);
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolveSleep) => {
        setTimeout(resolveSleep, ms);
    });
}

async function waitForFileToContain(
    path: string,
    expectedSubstring: string,
    options: {
        timeoutMs?: number;
        intervalMs?: number;
    } = {},
): Promise<string> {
    const timeoutMs = options.timeoutMs ?? 5000;
    const intervalMs = options.intervalMs ?? 50;
    const deadline = Date.now() + timeoutMs;
    let lastContent = "";

    while (Date.now() < deadline) {
        if (await fileExists(path)) {
            lastContent = await readFile(path, "utf-8");
            if (lastContent.includes(expectedSubstring)) {
                return lastContent;
            }
        }
        await sleep(intervalMs);
    }

    throw new Error(
        `Timed out waiting for file "${path}" to contain "${expectedSubstring}". Last content:\n${lastContent}`,
    );
}
