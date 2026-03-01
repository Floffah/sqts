import type { ExpressionNode, SelectStatement } from "@sqts/sql";

import type { CompileContext } from "@/compiler/getCompileContext.ts";
import { resolveIdentifierType } from "@/compiler/identifier-resolution.ts";
import { stripPlaceholderPrefix } from "@/compiler/lib/stripPlaceholderPrefix.ts";
import type { SqtsOperation } from "@/parser";

export interface ProjectionTypeContext {
    operation: SqtsOperation;
    sourcePath: string;
    compileContext: CompileContext;
    aliasMap: Map<string, string>;
    select: SelectStatement;
    inferredPlaceholderTypes: Map<string, string>;
}

export function resolveProjectionFieldType(
    expression: ExpressionNode,
    context: ProjectionTypeContext,
): string {
    if (expression.kind === "identifier") {
        return resolveIdentifierType(
            expression.path,
            context.operation,
            context.sourcePath,
            context.compileContext,
            context.aliasMap,
            context.select,
        );
    }

    if (expression.kind === "placeholder") {
        const placeholder = stripPlaceholderPrefix(expression.name);
        return context.inferredPlaceholderTypes.get(placeholder) ?? "unknown";
    }

    if (expression.kind === "literal") {
        if (expression.value === null) {
            return "null";
        }

        if (typeof expression.value === "string") {
            return "string";
        }

        if (typeof expression.value === "number") {
            return "number";
        }

        if (typeof expression.value === "boolean") {
            return "boolean";
        }
    }

    if (expression.kind === "paren") {
        return resolveProjectionFieldType(expression.expression, context);
    }

    return "unknown";
}
