import type { SelectStatement } from "@sqts/sql";

import { compileSqlAndParams } from "@/compiler/compileSqlAndParams.ts";
import { CompilerError, CompilerErrorCode } from "@/compiler/errors.ts";
import type { CompileContext } from "@/compiler/getCompileContext.ts";
import { buildTableAliasMap } from "@/compiler/lib/buildTableAliasMap.ts";
import {
    deriveSelectProjection,
    type ProjectionField,
} from "@/compiler/lib/deriveSelectProjection.ts";
import { inferPlaceholderTypes } from "@/compiler/lib/inferPlaceholderTypes.ts";
import { parseOperationStatement } from "@/compiler/lib/parseOperationStatement.ts";
import { tableNameToTypeName } from "@/compiler/lib/tableNameToTypeName.ts";
import { toTableKeyFromRef } from "@/compiler/lib/toTableKeyFromRef.ts";
import type { SqtsOperation } from "@/parser";

export interface OperationStatementAnalysis {
    statementIndex: number;
    originalSql: string;
    compiledSql: string;
    placeholderOrder: string[];
    selectAst: SelectStatement | null;
    isRowProducing: boolean;
    projectionFields: ProjectionField[];
    rowTypeLiteral: string | null;
}

export interface OperationOutputInfo {
    returnType: string;
    valueType: string | null;
    modelImport: string | null;
    statementIndex: number | null;
    fields: ProjectionField[];
}

export interface OperationAnalysis {
    statements: OperationStatementAnalysis[];
    inferredPlaceholderTypes: Map<string, string>;
    output: OperationOutputInfo;
}

export function analyzeOperation(
    operation: SqtsOperation,
    ctx: CompileContext,
    sourcePath: string,
): OperationAnalysis {
    const statements: OperationStatementAnalysis[] = operation.statements.map(
        (statement, statementIndex) => {
            const compiled = compileSqlAndParams(statement.sql);
            const parsed = parseOperationStatement({
                statementSql: statement.sql,
                operationName: operation.name,
                sourcePath,
                statementIndex,
            });

            return {
                statementIndex,
                originalSql: statement.sql,
                compiledSql: compiled.compiledSql,
                placeholderOrder: compiled.placeholderOrder,
                selectAst: parsed.selectAst,
                isRowProducing: parsed.isRowProducing,
                projectionFields: [],
                rowTypeLiteral: null,
            };
        },
    );

    const firstSelectStatement = statements.find(
        (statement) => statement.selectAst !== null,
    );
    const firstSelect = firstSelectStatement?.selectAst ?? null;
    const aliasMap = firstSelect ? buildTableAliasMap(firstSelect) : new Map();
    const inferredPlaceholderTypes = inferPlaceholderTypes(
        operation,
        ctx,
        sourcePath,
        firstSelect,
        aliasMap,
    );

    let lastRowProducingStatement: OperationStatementAnalysis | null = null;
    for (const statement of statements) {
        if (!statement.selectAst) {
            continue;
        }

        const projection = deriveSelectProjection({
            select: statement.selectAst,
            operation,
            sourcePath,
            compileContext: ctx,
            inferredPlaceholderTypes,
        });
        statement.projectionFields = projection.fields;
        statement.rowTypeLiteral = projection.rowTypeLiteral;
        lastRowProducingStatement = statement;
    }

    return {
        statements,
        inferredPlaceholderTypes,
        output: resolveOperationOutput(
            ctx,
            operation,
            sourcePath,
            lastRowProducingStatement,
        ),
    };
}

function resolveOperationOutput(
    ctx: CompileContext,
    operation: SqtsOperation,
    sourcePath: string,
    lastRowProducingStatement: OperationStatementAnalysis | null,
): OperationOutputInfo {
    if (!lastRowProducingStatement) {
        return {
            returnType: "void",
            valueType: null,
            modelImport: null,
            statementIndex: null,
            fields: [],
        };
    }

    if (
        ctx.config.compiler?.modelTypes &&
        lastRowProducingStatement.selectAst?.from?.base
    ) {
        const baseTableKey = toTableKeyFromRef(
            lastRowProducingStatement.selectAst.from.base.schema?.normalized,
            lastRowProducingStatement.selectAst.from.base.name.normalized,
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

        const modelName = tableNameToTypeName(table.name);
        return {
            returnType: `${modelName}[]`,
            valueType: modelName,
            modelImport: modelName,
            statementIndex: lastRowProducingStatement.statementIndex,
            fields: lastRowProducingStatement.projectionFields,
        };
    }

    const valueType = lastRowProducingStatement.rowTypeLiteral ?? "{}";
    return {
        returnType: `Array<${valueType}>`,
        valueType,
        modelImport: null,
        statementIndex: lastRowProducingStatement.statementIndex,
        fields: lastRowProducingStatement.projectionFields,
    };
}
