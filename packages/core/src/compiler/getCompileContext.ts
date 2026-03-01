import { readdir, readFile } from "fs/promises";
import { resolve } from "path";
import { buildSqliteSchema, parseSqlite, type SqlProgram } from "@sqts/sql";

import { getConfig } from "@/lib/getConfig.ts";

export async function getCompileContext(cwd = process.cwd()) {
    const config = await getConfig(cwd);

    if (!config.compiler?.schemaDir) {
        throw new Error(
            "No schema path provided in config. Please provide a path to your schema directory in the config file.",
        );
    }

    const pathToMigrations = resolve(cwd, config.compiler.schemaDir);
    const dir = await readdir(pathToMigrations);

    const programs: SqlProgram[] = [];

    for (const file of dir) {
        if (file.endsWith(".sql")) {
            const programText = await readFile(
                resolve(pathToMigrations, file),
                "utf-8",
            );
            const program = parseSqlite(programText, {});
            programs.push(program);
        }
    }

    const schema = buildSqliteSchema(programs);

    return {
        config,
        schema,
    };
}

export type CompileContext = Awaited<ReturnType<typeof getCompileContext>>;
