import { VariableDeclarationKind } from "ts-morph";
import type { FunctionDeclaration } from "ts-morph";

import type { MappingDescriptor, OutputDeclaration } from "./types.ts";

export function populateOutputFunctionBody({
    outputFunction,
    normalizedSql,
    extraHeaderCode,
    variableNames,
    mappings,
    output,
    queryName,
    sourceFile,
}: {
    outputFunction: FunctionDeclaration;
    normalizedSql: string;
    extraHeaderCode: string;
    variableNames: string[];
    mappings: MappingDescriptor[];
    output: OutputDeclaration;
    queryName: string;
    sourceFile: string;
}) {
    const inlineMapStatementsFor = (targetVar: string) => [
        "for (const mapping of mappings) {",
        `    let current: Record<string, any> = ${targetVar} as Record<string, any>;`,
        "    const path = mapping.targetPath;",
        "    for (let i = 0; i < path.length - 1; i++) {",
        "        const key = path[i]!;",
        "        const existing = current[key];",
        '        if (typeof existing !== "object" || existing === null || Array.isArray(existing)) {',
        "            current[key] = {};",
        "        }",
        "        current = current[key] as Record<string, any>;",
        "    }",
        "    current[path[path.length - 1]!] = row[mapping.aliasKey];",
        "}",
    ];

    outputFunction.addVariableStatement({
        declarationKind: VariableDeclarationKind.Const,
        declarations: [
            {
                name: "query",
                initializer: (writer) =>
                    writer.write("`").write(normalizedSql).write("`"),
            },
        ],
    });

    if (extraHeaderCode) {
        outputFunction.addStatements(extraHeaderCode);
    }

    outputFunction.addVariableStatement({
        declarationKind: VariableDeclarationKind.Const,
        declarations: [
            {
                name: "params",
                initializer:
                    variableNames.length > 0
                        ? `[${variableNames.join(", ")}]`
                        : "[]",
            },
        ],
    });

    outputFunction.addVariableStatement({
        declarationKind: VariableDeclarationKind.Const,
        declarations: [
            {
                name: "output",
                initializer: `await __tsqlExecute(query, params, { queryName: ${JSON.stringify(queryName)}, sourceFile: ${JSON.stringify(sourceFile)} })`,
            },
        ],
    });

    outputFunction.addVariableStatement({
        declarationKind: VariableDeclarationKind.Const,
        declarations: [
            {
                name: "rows",
                type: "Record<string, unknown>[]",
                initializer: "output.rows as Record<string, unknown>[]",
            },
        ],
    });

    outputFunction.addVariableStatement({
        declarationKind: VariableDeclarationKind.Const,
        declarations: [
            {
                name: "mappings",
                initializer: (writer) => {
                    writer.writeLine("[");
                    for (const mapping of mappings) {
                        writer.writeLine(
                            `    { aliasKey: ${JSON.stringify(mapping.aliasKey)}, targetPath: ${JSON.stringify(mapping.targetPath)} },`,
                        );
                    }
                    writer.write("] as const");
                },
            },
        ],
    });

    if (output.mode === "many") {
        outputFunction.addVariableStatement({
            declarationKind: VariableDeclarationKind.Const,
            declarations: [
                {
                    name: output.rootName,
                    type: "QueryOutput",
                    initializer: "[]",
                },
            ],
        });

        outputFunction.addStatements([
            "for (const row of rows) {",
            "    const value = {} as QueryOutput[number];",
            ...inlineMapStatementsFor("value").map((line) => `    ${line}`),
            `    ${output.rootName}.push(value);`,
            "}",
            `return ${output.rootName};`,
        ]);
        return;
    }

    outputFunction.addStatements([
        "if (rows.length !== 1) {",
        `    throw new Error(\"Expected exactly one row for ${output.rootName}, got \" + rows.length);`,
        "}",
    ]);

    outputFunction.addVariableStatement({
        declarationKind: VariableDeclarationKind.Const,
        declarations: [
            {
                name: "value",
                initializer: "{} as QueryOutput",
            },
        ],
    });

    outputFunction.addVariableStatement({
        declarationKind: VariableDeclarationKind.Const,
        declarations: [{ name: "row", initializer: "rows[0]!" }],
    });

    outputFunction.addStatements([
        ...inlineMapStatementsFor("value"),
        "return value;",
    ]);
}

export function populateMutationFunctionBody({
    outputFunction,
    normalizedSql,
    extraHeaderCode,
    variableNames,
    queryName,
    sourceFile,
}: {
    outputFunction: FunctionDeclaration;
    normalizedSql: string;
    extraHeaderCode: string;
    variableNames: string[];
    queryName: string;
    sourceFile: string;
}) {
    outputFunction.addVariableStatement({
        declarationKind: VariableDeclarationKind.Const,
        declarations: [
            {
                name: "query",
                initializer: (writer) =>
                    writer.write("`").write(normalizedSql).write("`"),
            },
        ],
    });

    if (extraHeaderCode) {
        outputFunction.addStatements(extraHeaderCode);
    }

    outputFunction.addVariableStatement({
        declarationKind: VariableDeclarationKind.Const,
        declarations: [
            {
                name: "params",
                initializer:
                    variableNames.length > 0
                        ? `[${variableNames.join(", ")}]`
                        : "[]",
            },
        ],
    });

    outputFunction.addStatements([
        `await __tsqlExecute(query, params, { queryName: ${JSON.stringify(queryName)}, sourceFile: ${JSON.stringify(sourceFile)} });`,
        "return;",
    ]);
}
