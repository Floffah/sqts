import type { SelectStatement } from "@sqts/sql";

import { CompilerError, CompilerErrorCode } from "@/compiler/errors.ts";
import type { CompileContext } from "@/compiler/getCompileContext.ts";
import { parseFirstSelectFromOperation } from "@/compiler/lib/parseFirstSelectFromOperation.ts";
import { schemaTableToTypeLiteral } from "@/compiler/lib/schemaTableToTypeLiteral.ts";
import { tableNameToTypeName } from "@/compiler/lib/tableNameToTypeName.ts";
import { toTableKeyFromRef } from "@/compiler/lib/toTableKeyFromRef.ts";
import type { SqtsOperation } from "@/parser";

export interface SelectOutputInfo {
    returnType: string;
    modelImport?: string;
}

export function resolveSelectOutputInfo(
    operation: SqtsOperation,
    ctx: CompileContext,
    sourcePath: string,
    firstSelectArg?: SelectStatement | null,
): SelectOutputInfo | null {
    const firstSelect =
        firstSelectArg ?? parseFirstSelectFromOperation(operation, sourcePath);
    if (!firstSelect) {
        return null;
    }

    if (!firstSelect.from) {
        throw new CompilerError({
            code: CompilerErrorCode.MissingSelectFromClause,
            message: `Operation "${operation.name}" in "${sourcePath}" is SELECT-backed but has no FROM clause.`,
            sourcePath,
            operationName: operation.name,
        });
    }

    const baseTableKey = toTableKeyFromRef(
        firstSelect.from.base.schema?.normalized,
        firstSelect.from.base.name.normalized,
    );

    const table = ctx.schema.tables[baseTableKey];
    if (!table) {
        throw new CompilerError({
            code: CompilerErrorCode.MissingModelTable,
            message: `Operation "${operation.name}" in "${sourcePath}" references missing model table "${baseTableKey}".`,
            sourcePath,
            operationName: operation.name,
        });
    }

    if (ctx.config.compiler?.modelTypes) {
        const modelName = tableNameToTypeName(table.name);
        return {
            returnType: `${modelName}[]`,
            modelImport: modelName,
        };
    }

    return {
        returnType: `Array<${schemaTableToTypeLiteral(table)}>`,
    };
}
