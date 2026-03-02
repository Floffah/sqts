import { readdir, readFile, stat } from "fs/promises";
import { resolve } from "path";
import { buildSqliteSchema, parseSql, type SqlProgram } from "@sqts/sql";
import { getCompilerOptionsFromTsConfig } from "ts-morph";

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
            const program = parseSql(programText);
            programs.push(program);
        }
    }

    const schema = buildSqliteSchema(programs);

    const tsconfigPath = resolve(cwd, "tsconfig.json");
    const tsconfigStat = await stat(tsconfigPath).catch(() => null);
    const tsconfigExists = tsconfigStat?.isFile() ?? false;
    const tsCompilerOptions = tsconfigExists
        ? getCompilerOptionsFromTsConfig(tsconfigPath).options
        : undefined;

    return {
        config,
        schema,
        tsCompilerOptions,
    };
}

export type CompileContext = Awaited<ReturnType<typeof getCompileContext>>;
