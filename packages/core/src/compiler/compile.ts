import { access, readFile } from "fs/promises";
import { resolve } from "path";
import {
    type ExpressionNode,
    type IdentifierNode,
    parseSqlite,
    type SelectStatement,
} from "@sqts/sql";
import { glob } from "glob";
import { getCompilerOptionsFromTsConfig, Project } from "ts-morph";

import { getCompileContext, type CompileContext } from "@/compiler";
import {
    compileModelTypes,
    schemaColumnToType,
    schemaTableToTypeLiteral,
    tableNameToTypeName,
} from "@/compiler/models.ts";
import { parseDocument, type SqtsOperation } from "@/parser";

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

function compileOperationSignature(
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

function resolveSelectOutputInfo(
    operation: SqtsOperation,
    ctx: CompileContext,
    sourcePath: string,
): {
    returnType: string;
    modelImport?: string;
} | null {
    const firstSelect = parseFirstSelectFromOperation(operation, sourcePath);
    if (!firstSelect) {
        return null;
    }

    if (!firstSelect.from) {
        throw new Error(
            `Operation "${operation.name}" in "${sourcePath}" is SELECT-backed but has no FROM clause.`,
        );
    }

    const baseTableKey = toTableKeyFromRef(
        firstSelect.from.base.schema?.normalized,
        firstSelect.from.base.name.normalized,
    );

    const table = ctx.schema.tables[baseTableKey];
    if (!table) {
        throw new Error(
            `Operation "${operation.name}" in "${sourcePath}" references missing model table "${baseTableKey}".`,
        );
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

function parseFirstSelectFromOperation(
    operation: SqtsOperation,
    sourcePath: string,
): SelectStatement | null {
    const firstStatement = operation.statements[0];
    if (!firstStatement) {
        return null;
    }

    let parsedProgram;
    try {
        parsedProgram = parseSqlite(`${firstStatement.sql};`);
    } catch (error) {
        const message = `Failed to parse first SQL statement for operation "${operation.name}" in "${sourcePath}": ${String(
            error instanceof Error ? error.message : error,
        )}`;
        throw new Error(message, {
            cause: error,
        });
    }

    const firstParsedStatement = parsedProgram.statements[0];
    if (!firstParsedStatement || firstParsedStatement.kind !== "select") {
        return null;
    }

    return firstParsedStatement;
}

function inferPlaceholderTypes(
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
        throw new Error(
            `Conflicting placeholder type inference for "$${placeholderName}" in operation "${operation.name}" (${sourcePath}): "${existingType}" vs "${inferredType}".`,
        );
    }

    inferred.set(placeholderName, inferredType);
}

function resolveIdentifierType(
    path: IdentifierNode[],
    operation: SqtsOperation,
    sourcePath: string,
    ctx: CompileContext,
    aliasMap: Map<string, string>,
    select: SelectStatement,
): string {
    const normalizedParts = path.map((part) => part.normalized);

    let tableKey: string;
    let columnName: string;

    if (normalizedParts.length === 1) {
        if (!select.from) {
            throw new Error(
                `Unable to resolve identifier "${normalizedParts.join(".")}" for type inference in operation "${operation.name}" (${sourcePath}).`,
            );
        }

        const totalTables = 1 + select.from.joins.length;
        if (totalTables !== 1) {
            throw new Error(
                `Ambiguous unqualified identifier "${normalizedParts[0]}" in operation "${operation.name}" (${sourcePath}). Qualify with table alias for inference.`,
            );
        }

        tableKey = toTableKeyFromRef(
            select.from.base.schema?.normalized,
            select.from.base.name.normalized,
        );
        columnName = normalizedParts[0]!;
    } else if (normalizedParts.length === 2) {
        const tableAlias = normalizedParts[0]!;
        const resolvedTableKey = aliasMap.get(tableAlias);
        if (!resolvedTableKey) {
            throw new Error(
                `Unable to resolve table/alias "${tableAlias}" in operation "${operation.name}" (${sourcePath}) for placeholder inference.`,
            );
        }

        tableKey = resolvedTableKey;
        columnName = normalizedParts[1]!;
    } else if (normalizedParts.length === 3) {
        tableKey = `${normalizedParts[0]}.${normalizedParts[1]}`;
        columnName = normalizedParts[2]!;
    } else {
        throw new Error(
            `Unsupported identifier path "${normalizedParts.join(".")}" in operation "${operation.name}" (${sourcePath}) for placeholder inference.`,
        );
    }

    const table = ctx.schema.tables[tableKey];
    if (!table) {
        throw new Error(
            `Unable to resolve table "${tableKey}" from identifier "${normalizedParts.join(".")}" in operation "${operation.name}" (${sourcePath}).`,
        );
    }

    const column = table.columns[columnName];
    if (!column) {
        throw new Error(
            `Unable to resolve column "${columnName}" on table "${tableKey}" from identifier "${normalizedParts.join(".")}" in operation "${operation.name}" (${sourcePath}).`,
        );
    }

    return schemaColumnToType(column.affinity, column.nullable);
}

function buildTableAliasMap(select: SelectStatement): Map<string, string> {
    const aliasMap = new Map<string, string>();
    if (!select.from) {
        return aliasMap;
    }

    const refs = [select.from.base, ...select.from.joins.map((join) => join.table)];

    for (const ref of refs) {
        const tableKey = toTableKeyFromRef(
            ref.schema?.normalized,
            ref.name.normalized,
        );

        aliasMap.set(ref.name.normalized, tableKey);
        if (ref.alias) {
            aliasMap.set(ref.alias.normalized, tableKey);
        }
    }

    return aliasMap;
}

function toTableKeyFromRef(schema: string | undefined, table: string): string {
    return `${schema ?? "main"}.${table}`;
}

function stripPlaceholderPrefix(value: string): string {
    return value.startsWith("$") ? value.slice(1) : value;
}
