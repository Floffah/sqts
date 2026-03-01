import type { OperationAnalysis } from "@/compiler/analyzeOperation.ts";
import { stripPlaceholderPrefix } from "@/compiler/lib/stripPlaceholderPrefix.ts";
import type { SqtsOperation } from "@/parser";

export function compileOperationSignature(
    operation: SqtsOperation,
    analysis: OperationAnalysis,
): {
    functionBody: string;
    modelImport?: string;
} {
    const placeholders = operation.placeholders.map(stripPlaceholderPrefix);
    const inferredPlaceholderTypes = analysis.inferredPlaceholderTypes;

    const paramsEntries = placeholders.map((placeholder) => {
        const inferred = inferredPlaceholderTypes.get(placeholder);
        return [placeholder, inferred ?? "unknown"] as const;
    });

    const paramsType =
        paramsEntries.length === 0
            ? "{}"
            : `{ ${paramsEntries.map(([name, type]) => `${name}: ${type};`).join(" ")} }`;

    const selectInfo = analysis.outputInfo;
    const returnType = selectInfo?.returnType ?? "void";

    const functionBody = [
        `export async function ${operation.name}(params: ${paramsType}): Promise<${returnType}> {`,
        `    throw new Error("Not implemented: ${operation.name}");`,
        `}`,
    ].join("\n");

    return {
        functionBody,
        modelImport: selectInfo?.modelImport,
    };
}
