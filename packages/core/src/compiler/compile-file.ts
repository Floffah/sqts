import { readFile } from "fs/promises";
import { resolve } from "path";

import type { CompileContext } from "@/compiler/context.ts";
import { compileOperationSignature } from "@/compiler/operation-signature.ts";
import { parseDocument } from "@/parser";

export async function compile(
    path: string,
    ctx: CompileContext,
    cwd = process.cwd(),
) {
    const filePath = resolve(cwd, path);
    const source = await readFile(filePath, "utf-8");
    const document = parseDocument(source);

    const modelImports = new Set<string>();
    const functionDeclarations: string[] = [];

    for (const operation of document.operations) {
        const compiled = compileOperationSignature(operation, ctx, path);
        if (compiled.modelImport) {
            modelImports.add(compiled.modelImport);
        }
        functionDeclarations.push(compiled.functionBody);
    }

    const importBlock =
        ctx.config.compiler?.modelTypes && modelImports.size > 0
            ? `import type { ${Array.from(modelImports).sort().join(", ")} } from "./models";\n\n`
            : "";

    if (functionDeclarations.length === 0) {
        return importBlock.trim();
    }

    return `${importBlock}${functionDeclarations.join("\n\n")}\n`;
}
