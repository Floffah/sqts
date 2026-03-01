import type { CompileContext } from "@/compiler/context.ts";
import { inferPlaceholderTypes } from "@/compiler/placeholder-inference.ts";
import { stripPlaceholderPrefix } from "@/compiler/identifier-resolution.ts";
import { resolveSelectOutputInfo } from "@/compiler/select-output.ts";
import type { SqtsOperation } from "@/parser";

export function compileOperationSignature(
    operation: SqtsOperation,
    ctx: CompileContext,
    sourcePath: string,
): {
    functionBody: string;
    modelImport?: string;
} {
    const placeholders = operation.placeholders.map(stripPlaceholderPrefix);
    const inferredPlaceholderTypes = inferPlaceholderTypes(
        operation,
        ctx,
        sourcePath,
    );

    const paramsEntries = placeholders.map((placeholder) => {
        const inferred = inferredPlaceholderTypes.get(placeholder);
        return [placeholder, inferred ?? "unknown"] as const;
    });

    const paramsType =
        paramsEntries.length === 0
            ? "{}"
            : `{ ${paramsEntries.map(([name, type]) => `${name}: ${type};`).join(" ")} }`;

    const selectInfo = resolveSelectOutputInfo(operation, ctx, sourcePath);
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
