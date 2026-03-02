import { readFile } from "fs/promises";
import { resolve } from "path";

import { analyzeOperation } from "@/compiler/analyzeOperation.ts";
import { compileOperation } from "@/compiler/compileOperation.ts";
import type { CompileContext } from "@/compiler/getCompileContext.ts";
import { parseDocument } from "@/parser";

export async function compile(
    path: string,
    ctx: CompileContext,
    cwd = process.cwd(),
) {
    const filePath = resolve(cwd, path);
    const source = await readFile(filePath, "utf-8");
    const document = parseDocument(source);

    const functionDeclarations: string[] = [];
    const modelImports = new Set<string>();

    for (const operation of document.operations) {
        const analysis = analyzeOperation(operation, ctx, path);
        const compiled = compileOperation(operation, analysis, path);
        if (analysis.output.modelImport) {
            modelImports.add(analysis.output.modelImport);
        }
        functionDeclarations.push(compiled.functionBody);
    }

    if (functionDeclarations.length === 0) {
        return "";
    }

    const importBlock = `import { execute as __sqtsExecute } from ${JSON.stringify(
        ctx.config.executor.module,
    )};\n`;
    const modelImportBlock =
        modelImports.size === 0
            ? "\n"
            : `import type { ${Array.from(modelImports).sort().join(", ")} } from "./types";\n\n`;

    return `${importBlock}${modelImportBlock}${functionDeclarations.join("\n\n")}\n`;
}
