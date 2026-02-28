import { Project } from "ts-morph";
import type { SourceFile } from "ts-morph";

import { populateOutputFunctionBody } from "./codegen.ts";
import { extractDeclarations } from "./declarations.ts";
import { normalizeSelectAliases, parseSqlVariables } from "./sql.ts";
import { splitTemplateInput } from "./template.ts";
import type { CompileOptions } from "./types.ts";

function hoistImports(inputSourceFile: SourceFile, finalSourceFile: SourceFile) {
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

export function compile(
    input: string,
    filename: string,
    { tsqlImportName = "tsql", ...projectOptions }: CompileOptions = {},
) {
    const { tsBlock, sqlBlock } = splitTemplateInput(input);
    const project = new Project({
        ...projectOptions,
        useInMemoryFileSystem: true,
    });

    const queryName = filename.split(".")[0] ?? "query";
    const inputSourceFile = project.createSourceFile("input.ts", tsBlock);
    const finalSourceFile = project.createSourceFile("output.ts");

    finalSourceFile.addImportDeclaration({
        moduleSpecifier: tsqlImportName,
        namedImports: [{ name: "compiledApi", alias: "tsql" }],
    });

    const { output, propsVarName, propsVarStatement } = extractDeclarations(
        inputSourceFile,
        finalSourceFile,
        filename,
    );

    const { sql: queryWithParams, variableNames } = parseSqlVariables(sqlBlock);
    const { sql: normalizedSql, mappings } = normalizeSelectAliases(
        queryWithParams.trim(),
        output,
        filename,
    );

    hoistImports(inputSourceFile, finalSourceFile);
    propsVarStatement?.remove();
    output.variableStatement.remove();

    const outputFunction = finalSourceFile.addFunction({
        name:
            "exec" +
            queryName.charAt(0).toUpperCase() +
            queryName.slice(1) +
            "Query",
        isDefaultExport: true,
        returnType: output.typeText,
    });

    if (propsVarName) {
        outputFunction.addParameter({
            name: propsVarName,
            type: "QueryProps",
        });
    }

    populateOutputFunctionBody({
        outputFunction,
        normalizedSql,
        extraHeaderCode: inputSourceFile.getFullText().trim(),
        variableNames,
        mappings,
        output,
    });

    return finalSourceFile.getFullText();
}
