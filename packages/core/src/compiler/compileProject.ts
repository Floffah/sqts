import { resolve } from "path";
import { debounce } from "@tanstack/pacer";
import { watch } from "chokidar";
import { glob } from "tinyglobby";
import { Project } from "ts-morph";

import { compile } from "@/compiler/compile.ts";
import {
    getCompileContext,
    type CompileContext,
} from "@/compiler/getCompileContext.ts";
import { compileModelTypes } from "@/compiler/models.ts";

interface CompileOptions {
    ctx?: CompileContext;
    cwd?: string;
}

export async function watchAndCompileProject({
    ctx: propsCtx,
    cwd = process.cwd(),
}: CompileOptions = {}) {
    let ctx = propsCtx ?? (await getCompileContext(cwd));

    console.log("[SQTS] Compiling project...");
    await compileProject({ ctx, cwd });

    console.log("[SQTS] Compilation complete. Watching for changes...");
    const watcher = watch(".", {
        cwd,
        // awaitWriteFinish: true,
        depth: 10,
        ignoreInitial: true,
        alwaysStat: true,

        ignored: (path, stats) => {
            return !!(
                stats?.isFile() &&
                !path.endsWith(".sqts") &&
                !path.endsWith(".sql")
            );
        },
    });

    const reactToChange = debounce(
        async (path: string) => {
            if (path.endsWith(".sql")) {
                console.log(
                    `[SQTS] Detected change in ${path}. Updating schema...`,
                );
                try {
                    ctx = await getCompileContext(cwd);
                    console.log(`[SQTS] Schema updated successfully.`);
                } catch (error) {
                    console.error("[SQTS] Error updating schema:", error);
                    return;
                }
            }

            console.log(`[SQTS] Detected change in ${path}. Recompiling...`);
            try {
                const now = new Date();
                await compileProject({ ctx, cwd });
                const duration = new Date().getTime() - now.getTime();
                console.log(`[SQTS] Recompilation complete in ${duration}ms.`);
            } catch (error) {
                console.error("[SQTS] Error during recompilation:", error);
            }
        },
        {
            wait: 300,
        },
    );

    watcher.on("add", reactToChange);
    watcher.on("change", reactToChange);

    return watcher;
}

export async function compileProject({
    ctx: propsCtx,
    cwd = process.cwd(),
}: CompileOptions = {}) {
    const ctx = propsCtx ?? (await getCompileContext(cwd));

    const sqtsFiles = await glob("**/*.sqts", {
        cwd,
        ignore: ["**/dist/**", "**/node_modules/**"],
    });

    const outputFiles: Record<string, string> = {};

    for (const file of sqtsFiles) {
        outputFiles[file] = await compile(file, ctx, cwd);
    }

    const tsProj = new Project({
        compilerOptions: ctx.tsCompilerOptions,
    });

    if (!ctx.config.compiler?.outDir) {
        throw new Error(
            "No output directory provided in config. Please provide an output directory in the config file.",
        );
    }

    const outdir = resolve(cwd, ctx.config.compiler.outDir);

    if (ctx.config.compiler.modelTypes) {
        await compileModelTypes(tsProj, outdir, ctx);
    }

    const outputPath = resolve(outdir, "index.ts");
    const finalOutputFile = tsProj.createSourceFile(outputPath, "", {
        overwrite: true,
    });

    for (const [file, content] of Object.entries(outputFiles)) {
        finalOutputFile.addStatements("// " + file);
        finalOutputFile.addStatements(content);
    }

    finalOutputFile.organizeImports();
    finalOutputFile.formatText();

    await tsProj.save();
}
