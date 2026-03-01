import { access } from "fs/promises";
import { resolve } from "path";
import { glob } from "glob";
import { getCompilerOptionsFromTsConfig, Project } from "ts-morph";

import { getCompileContext, type CompileContext } from "@/compiler";
import { compileModelTypes } from "@/compiler/models.ts";

export async function compileProject(cwd = process.cwd()) {
    const ctx = await getCompileContext(cwd);

    const sqtsFiles = await glob("**/*.sqts", {
        cwd,
        ignore: ["dist", "node_modules"],
    });

    const outputFiles: Record<string, string> = {};

    for (const file of sqtsFiles) {
        outputFiles[file] = await compile(file, ctx, cwd);
    }

    const tsconfigPath = resolve(cwd, "tsconfig.json");
    const tsconfigExists = await access(tsconfigPath)
        .then(() => true)
        .catch(() => false);
    const compilerOptions = tsconfigExists
        ? getCompilerOptionsFromTsConfig(tsconfigPath).options
        : undefined;

    const tsProj = new Project({
        compilerOptions,
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
    finalOutputFile.fixUnusedIdentifiers();
    finalOutputFile.formatText();

    await tsProj.save();
}

export async function compile(
    path: string,
    ctx: CompileContext,
    cwd = process.cwd(),
) {
    void path;
    void ctx;
    void cwd;
}
