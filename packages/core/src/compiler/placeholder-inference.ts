import type { ExpressionNode, SelectStatement } from "@sqts/sql";

import type { CompileContext } from "@/compiler/context.ts";
import {
    buildTableAliasMap,
    resolveIdentifierType,
    stripPlaceholderPrefix,
} from "@/compiler/identifier-resolution.ts";
import {
    CompilerError,
    CompilerErrorCode,
} from "@/compiler/errors.ts";
import { parseFirstSelectFromOperation } from "@/compiler/select-output.ts";
import type { SqtsOperation } from "@/parser";

export function inferPlaceholderTypes(
    operation: SqtsOperation,
    ctx: CompileContext,
    sourcePath: string,
): Map<string, string> {
    const inferred = new Map<string, string>();
    const firstSelect = parseFirstSelectFromOperation(operation, sourcePath);
    if (!firstSelect || !firstSelect.where || !firstSelect.from) {
        return inferred;
    }

    const tableAliasMap = buildTableAliasMap(firstSelect);

    collectInferencesFromExpression(
        firstSelect.where,
        operation,
        sourcePath,
        ctx,
        tableAliasMap,
        firstSelect,
        inferred,
    );

    return inferred;
}

function collectInferencesFromExpression(
    expression: ExpressionNode,
    operation: SqtsOperation,
    sourcePath: string,
    ctx: CompileContext,
    aliasMap: Map<string, string>,
    select: SelectStatement,
    inferred: Map<string, string>,
): void {
    if (expression.kind === "binary") {
        if (expression.operator === "=" || expression.operator === "==") {
            maybeInferFromBinaryPair(
                expression.left,
                expression.right,
                operation,
                sourcePath,
                ctx,
                aliasMap,
                select,
                inferred,
            );
            maybeInferFromBinaryPair(
                expression.right,
                expression.left,
                operation,
                sourcePath,
                ctx,
                aliasMap,
                select,
                inferred,
            );
        }

        collectInferencesFromExpression(
            expression.left,
            operation,
            sourcePath,
            ctx,
            aliasMap,
            select,
            inferred,
        );
        collectInferencesFromExpression(
            expression.right,
            operation,
            sourcePath,
            ctx,
            aliasMap,
            select,
            inferred,
        );
        return;
    }

    if (expression.kind === "paren") {
        collectInferencesFromExpression(
            expression.expression,
            operation,
            sourcePath,
            ctx,
            aliasMap,
            select,
            inferred,
        );
        return;
    }

    if (expression.kind === "unary") {
        collectInferencesFromExpression(
            expression.operand,
            operation,
            sourcePath,
            ctx,
            aliasMap,
            select,
            inferred,
        );
    }
}

function maybeInferFromBinaryPair(
    left: ExpressionNode,
    right: ExpressionNode,
    operation: SqtsOperation,
    sourcePath: string,
    ctx: CompileContext,
    aliasMap: Map<string, string>,
    select: SelectStatement,
    inferred: Map<string, string>,
): void {
    if (left.kind !== "identifier" || right.kind !== "placeholder") {
        return;
    }

    const placeholderName = stripPlaceholderPrefix(right.name);
    const inferredType = resolveIdentifierType(
        left.path,
        operation,
        sourcePath,
        ctx,
        aliasMap,
        select,
    );
    const existingType = inferred.get(placeholderName);
    if (existingType && existingType !== inferredType) {
        throw new CompilerError({
            code: CompilerErrorCode.ConflictingPlaceholderType,
            message: `Conflicting placeholder type inference for "$${placeholderName}" in operation "${operation.name}" (${sourcePath}): "${existingType}" vs "${inferredType}".`,
            sourcePath,
            operationName: operation.name,
            details: {
                placeholderName,
                existingType,
                inferredType,
            },
        });
    }

    inferred.set(placeholderName, inferredType);
}
