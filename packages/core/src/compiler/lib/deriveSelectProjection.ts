import type { SelectStatement } from "@sqts/sql";

import { CompilerError, CompilerErrorCode } from "@/compiler/errors.ts";
import type { CompileContext } from "@/compiler/getCompileContext.ts";
import { buildTableAliasMap } from "@/compiler/lib/buildTableAliasMap.ts";
import { resolveProjectionFieldType } from "@/compiler/lib/resolveProjectionFieldType.ts";
import { schemaColumnToType } from "@/compiler/lib/schemaColumnToType.ts";
import { stripPlaceholderPrefix } from "@/compiler/lib/stripPlaceholderPrefix.ts";
import { toTableKeyFromRef } from "@/compiler/lib/toTableKeyFromRef.ts";
import type { SqtsOperation } from "@/parser";

export interface ProjectionField {
    outputKey: string;
    propertyKey: string;
    tsType: string;
}

export interface SelectProjection {
    fields: ProjectionField[];
    rowTypeLiteral: string;
}

export function deriveSelectProjection(options: {
    select: SelectStatement;
    operation: SqtsOperation;
    sourcePath: string;
    compileContext: CompileContext;
    inferredPlaceholderTypes: Map<string, string>;
}): SelectProjection {
    const aliasMap = buildTableAliasMap(options.select);
    const fields: ProjectionField[] = [];
    const seen = new Set<string>();

    for (const item of options.select.items) {
        if (item.alias) {
            addField(
                fields,
                seen,
                item.alias.normalized,
                resolveProjectionFieldType(item.expression, {
                    operation: options.operation,
                    sourcePath: options.sourcePath,
                    compileContext: options.compileContext,
                    aliasMap,
                    select: options.select,
                    inferredPlaceholderTypes: options.inferredPlaceholderTypes,
                }),
                options,
            );
            continue;
        }

        const wildcardPath = parseWildcardPath(item.rawExpression.trim());
        if (wildcardPath) {
            for (const expanded of expandWildcardPath(
                wildcardPath,
                options.select,
                options,
                aliasMap,
            )) {
                addField(
                    fields,
                    seen,
                    expanded.outputKey,
                    expanded.tsType,
                    options,
                );
            }
            continue;
        }

        if (item.expression.kind === "identifier") {
            const outputKey =
                item.expression.path[item.expression.path.length - 1]
                    ?.normalized;
            if (!outputKey) {
                throw new CompilerError({
                    code: CompilerErrorCode.InvalidProjectionExpression,
                    message: `Invalid identifier projection in operation "${options.operation.name}" (${options.sourcePath}).`,
                    sourcePath: options.sourcePath,
                    operationName: options.operation.name,
                });
            }

            addField(
                fields,
                seen,
                outputKey,
                resolveProjectionFieldType(item.expression, {
                    operation: options.operation,
                    sourcePath: options.sourcePath,
                    compileContext: options.compileContext,
                    aliasMap,
                    select: options.select,
                    inferredPlaceholderTypes: options.inferredPlaceholderTypes,
                }),
                options,
            );
            continue;
        }

        if (item.expression.kind === "placeholder") {
            const outputKey = stripPlaceholderPrefix(item.expression.name);
            addField(
                fields,
                seen,
                outputKey,
                resolveProjectionFieldType(item.expression, {
                    operation: options.operation,
                    sourcePath: options.sourcePath,
                    compileContext: options.compileContext,
                    aliasMap,
                    select: options.select,
                    inferredPlaceholderTypes: options.inferredPlaceholderTypes,
                }),
                options,
            );
            continue;
        }

        throw new CompilerError({
            code: CompilerErrorCode.MissingProjectionAlias,
            message: `Projection "${item.rawExpression}" in operation "${options.operation.name}" (${options.sourcePath}) requires an alias.`,
            sourcePath: options.sourcePath,
            operationName: options.operation.name,
        });
    }

    return {
        fields,
        rowTypeLiteral: projectionFieldsToTypeLiteral(fields),
    };
}

function parseWildcardPath(rawExpression: string): string[] | null {
    if (rawExpression === "*") {
        return [];
    }

    const wildcardMatch = /^([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)?)\.\*$/.exec(
        rawExpression,
    );
    if (!wildcardMatch) {
        return null;
    }

    return wildcardMatch[1]!.split(".");
}

function expandWildcardPath(
    wildcardPath: string[],
    select: SelectStatement,
    options: {
        operation: SqtsOperation;
        sourcePath: string;
        compileContext: CompileContext;
    },
    aliasMap: Map<string, string>,
): Array<{ outputKey: string; tsType: string }> {
    const tableKeys: string[] = [];

    if (wildcardPath.length === 0) {
        if (!select.from) {
            throw new CompilerError({
                code: CompilerErrorCode.UnsupportedProjectionWildcard,
                message: `Wildcard projection "*" in operation "${options.operation.name}" (${options.sourcePath}) requires a FROM clause.`,
                sourcePath: options.sourcePath,
                operationName: options.operation.name,
            });
        }

        tableKeys.push(
            toTableKeyFromRef(
                select.from.base.schema?.normalized,
                select.from.base.name.normalized,
            ),
        );
        for (const join of select.from.joins) {
            tableKeys.push(
                toTableKeyFromRef(
                    join.table.schema?.normalized,
                    join.table.name.normalized,
                ),
            );
        }
    } else if (wildcardPath.length === 1) {
        const reference = wildcardPath[0]!;
        tableKeys.push(
            aliasMap.get(reference) ?? toTableKeyFromRef(undefined, reference),
        );
    } else if (wildcardPath.length === 2) {
        tableKeys.push(`${wildcardPath[0]}.${wildcardPath[1]}`);
    } else {
        throw new CompilerError({
            code: CompilerErrorCode.UnsupportedProjectionWildcard,
            message: `Unsupported wildcard projection "${wildcardPath.join(".")}.*" in operation "${options.operation.name}" (${options.sourcePath}).`,
            sourcePath: options.sourcePath,
            operationName: options.operation.name,
        });
    }

    const out: Array<{ outputKey: string; tsType: string }> = [];
    for (const tableKey of tableKeys) {
        const table = options.compileContext.schema.tables[tableKey];
        if (!table) {
            throw new CompilerError({
                code: CompilerErrorCode.InvalidSelectProjectionReference,
                message: `Wildcard projection references unknown table "${tableKey}" in operation "${options.operation.name}" (${options.sourcePath}).`,
                sourcePath: options.sourcePath,
                operationName: options.operation.name,
            });
        }

        for (const columnName of table.columnOrder) {
            const column = table.columns[columnName];
            if (!column) {
                throw new CompilerError({
                    code: CompilerErrorCode.InvalidSelectProjectionReference,
                    message: `Column "${columnName}" referenced by wildcard projection was not found on table "${tableKey}".`,
                    sourcePath: options.sourcePath,
                    operationName: options.operation.name,
                });
            }

            out.push({
                outputKey: column.name,
                tsType: schemaColumnToType(column.affinity, column.nullable),
            });
        }
    }

    return out;
}

function addField(
    fields: ProjectionField[],
    seen: Set<string>,
    outputKey: string,
    tsType: string,
    options: {
        operation: SqtsOperation;
        sourcePath: string;
    },
): void {
    if (seen.has(outputKey)) {
        throw new CompilerError({
            code: CompilerErrorCode.DuplicateProjectionOutputKey,
            message: `Duplicate projection output key "${outputKey}" in operation "${options.operation.name}" (${options.sourcePath}). Add aliases to disambiguate.`,
            sourcePath: options.sourcePath,
            operationName: options.operation.name,
        });
    }

    seen.add(outputKey);
    fields.push({
        outputKey,
        propertyKey: toTypeScriptPropertyKey(outputKey),
        tsType,
    });
}

function projectionFieldsToTypeLiteral(fields: ProjectionField[]): string {
    if (fields.length === 0) {
        return "{}";
    }

    const lines = fields.map(
        (field) => `    ${field.propertyKey}: ${field.tsType};`,
    );
    return `{\n${lines.join("\n")}\n}`;
}

function toTypeScriptPropertyKey(outputKey: string): string {
    if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(outputKey)) {
        return outputKey;
    }

    return JSON.stringify(outputKey);
}
