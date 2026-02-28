import type { SourceFile } from "ts-morph";
import { Project } from "ts-morph";

import {
    populateMutationFunctionBody,
    populateOutputFunctionBody,
} from "@/compiler/codegen.ts";
import { extractDeclarations } from "@/compiler/declarations.ts";
import { compilerError } from "@/compiler/errors.ts";
import {
    hasTopLevelSelectQuery,
    normalizeSelectAliases,
    parseSqlVariables,
} from "@/compiler/sql.ts";
import { splitTemplateInput } from "@/compiler/template.ts";
import type { CompileOptions } from "@/compiler/types.ts";
import { getConfig } from "@/lib/config.ts";

async function resolveExecutorModule(
    filename: string,
    {
        executorModule,
        cwd,
    }: {
        executorModule?: string;
        cwd?: string;
    },
) {
    if (executorModule) {
        return executorModule;
    }

    const config = await getConfig(cwd);
    const configuredModule = config?.executor?.module;

    if (configuredModule) {
        return configuredModule;
    }

    compilerError(
        filename,
        'Missing executor config. Add tsql.config.ts with `executor.module`, or pass `executorModule` to compile(). Example: defineConfig({ executor: { module: "tsql/adapters/bun-sqlite" } })',
    );
}

function hoistImports(
    inputSourceFile: SourceFile,
    finalSourceFile: SourceFile,
) {
    const imports = inputSourceFile.getImportDeclarations();
    for (const importDec of imports) {
        finalSourceFile.addImportDeclaration({
            namedImports: importDec.getNamedImports().map((namedImport) => ({
                name: namedImport.getName(),
                alias: namedImport.getAliasNode()?.getText(),
            })),
            moduleSpecifier: importDec.getModuleSpecifierValue(),
            attributes: importDec
                .getAttributes()
                ?.getElements()
                ?.map((attr) => ({
                    name: attr.getName(),
                    text: attr.getText(),
                    value: attr.getValue() as any,
                })),
            isTypeOnly: importDec.isTypeOnly(),
            defaultImport: importDec.getDefaultImport()?.getText(),
            namespaceImport: importDec.getNamespaceImport()?.getText(),
        });
        importDec.remove();
    }
}

export async function compile(
    input: string,
    filename: string,
    { executorModule, cwd, ...projectOptions }: CompileOptions = {},
) {
    const resolvedExecutorModule = await resolveExecutorModule(filename, {
        executorModule,
        cwd,
    });

    const { tsBlock, sqlBlock } = splitTemplateInput(input);
    const project = new Project({
        ...projectOptions,
        useInMemoryFileSystem: true,
    });

    const queryName = filename.split(".")[0] ?? "query";
    const inputSourceFile = project.createSourceFile("input.ts", tsBlock);
    const finalSourceFile = project.createSourceFile("output.ts");

    finalSourceFile.addImportDeclaration({
        moduleSpecifier: resolvedExecutorModule,
        namedImports: [{ name: "execute", alias: "__tsqlExecute" }],
    });

    const { output, propsVarName, propsVarStatement } = extractDeclarations(
        inputSourceFile,
        finalSourceFile,
        filename,
    );

    const { sql: queryWithParams, variableNames } = parseSqlVariables(sqlBlock);
    const trimmedQuery = queryWithParams.trim();
    let normalizedSql = trimmedQuery;
    let mappings: { aliasKey: string; targetPath: string[] }[] = [];

    if (output) {
        const normalized = normalizeSelectAliases(
            trimmedQuery,
            output,
            filename,
        );
        normalizedSql = normalized.sql;
        mappings = normalized.mappings;
    } else if (hasTopLevelSelectQuery(trimmedQuery)) {
        compilerError(
            filename,
            "Missing exported output declaration. Add `export const user: User = {}` or `export const users: User[] = []`.",
        );
    }

    hoistImports(inputSourceFile, finalSourceFile);
    propsVarStatement?.remove();
    output?.variableStatement.remove();

    const outputFunction = finalSourceFile.addFunction({
        name:
            "exec" +
            queryName.charAt(0).toUpperCase() +
            queryName.slice(1) +
            "Query",
        isDefaultExport: true,
        isAsync: true,
        returnType: output ? "Promise<QueryOutput>" : "Promise<void>",
    });

    if (propsVarName) {
        outputFunction.addParameter({
            name: propsVarName,
            type: "QueryProps",
        });
    }

    if (output) {
        finalSourceFile.addTypeAlias({
            name: "QueryOutput",
            type: output.typeText,
        });

        populateOutputFunctionBody({
            outputFunction,
            normalizedSql,
            extraHeaderCode: inputSourceFile.getFullText().trim(),
            variableNames,
            mappings,
            output,
            queryName,
            sourceFile: filename,
        });
    } else {
        populateMutationFunctionBody({
            outputFunction,
            normalizedSql,
            extraHeaderCode: inputSourceFile.getFullText().trim(),
            variableNames,
            queryName,
            sourceFile: filename,
        });
    }

    finalSourceFile.fixUnusedIdentifiers();
    finalSourceFile.organizeImports();

    return finalSourceFile.getFullText().trim();
}
