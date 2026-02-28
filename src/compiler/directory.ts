import { exists, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { transform } from "esbuild";
import { glob } from "glob";
import { getCompilerOptionsFromTsConfig, type CompilerOptions } from "ts-morph";

import { compile } from "@/compiler/index.ts";
import type { Config } from "@/config.ts";
import { getConfig } from "@/lib/config.ts";
import { commonLeadingDir } from "@/lib/dirs.ts";

export async function compileDirectory(overrideConfig?: Config) {
    const config = overrideConfig || (await getConfig());

    if (!config?.executor || !config.executor.module) {
        throw new Error("Executor module not specified in configuration.");
    }
    if (!config?.output || !config.output.mode) {
        throw new Error("Output mode not specified in configuration.");
    }

    const ignore = ["node_modules/**", "dist/**"];

    const gitignorePath = resolve(process.cwd(), ".gitignore");
    if (await exists(gitignorePath)) {
        const gitignore = await readFile(gitignorePath, "utf-8");
        const gitignorePatterns = gitignore
            .split("\n")
            .map((line) => line.trim())
            .filter((line) => line && !line.startsWith("#"));
        ignore.push(...gitignorePatterns);
    }

    let compilerOptions: CompilerOptions | undefined = undefined;

    try {
        compilerOptions = getCompilerOptionsFromTsConfig(
            resolve(process.cwd(), "tsconfig.json"),
        ) as unknown as CompilerOptions;
    } catch {
        console.warn(
            "Could not load tsconfig.json, using default compiler options.",
        );
    }

    const sqtsFiles = await glob("**/*.sqts", {
        ignore,
    });

    const outputMap: Record<string, string> = {};
    const writtenFiles: Record<string, string> = {}; // input path -> output path

    for (const file of sqtsFiles) {
        const input = await readFile(file, "utf-8");

        outputMap[file] = await compile(input, file, {
            executorModule: config?.executor?.module,
            compilerOptions,
        });
    }

    const commonDir = commonLeadingDir(Object.keys(outputMap));

    if (config.output.mode === "compile") {
        for (const [path, content] of Object.entries(outputMap)) {
            let finalContent = content;

            if (config.output.ext === "js") {
                const transformResult = await transform(finalContent, {
                    target: "node",
                    format: "cjs",
                });
                finalContent = transformResult.code;
            }

            if (config.output.outdir) {
                const replacedPath = path.replace(
                    new RegExp(`^${commonDir}/`),
                    "",
                );
                const outputPath = resolve(
                    process.cwd(),
                    config.output.outdir,
                    replacedPath + "." + (config.output.ext || "ts"),
                );
                await mkdir(dirname(outputPath), { recursive: true });
                await writeFile(outputPath, finalContent);
                writtenFiles[path] = outputPath;
            } else if (config.output.inline) {
                const outputPath = path + "." + (config.output.ext || "ts");
                await writeFile(outputPath, finalContent);
                writtenFiles[path] = outputPath;
            }
        }
    }

    return {
        writtenFiles,
    };
}
