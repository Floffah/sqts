import type { ProjectOptions } from "ts-morph";
import {
    AsExpression,
    Node,
    NoSubstitutionTemplateLiteral,
    Project,
    PropertyAccessExpression,
    VariableDeclarationKind,
    VariableStatement,
} from "ts-morph";

interface CompileOptions extends ProjectOptions {
    tsqlImportName?: string;
}

export function compile(
    input: string,
    filename: string,
    { tsqlImportName = "tsql", ...projectOptions }: CompileOptions = {},
) {
    let typescriptBlock1 = "";
    let sqlBlock: (string | { variable: string })[] = [];

    let inStringOfType: string | null = null;
    let inComment = false;
    let seenFirstSeparator = false;
    let sqlBlockAccum = "";

    for (let i = 0; i < input.length; i++) {
        if (
            input[i] === '"' ||
            input[i] === "'" ||
            (input[i] === "`" && input[i - 1] !== "\\")
        ) {
            if (inStringOfType) {
                inStringOfType = null;
            } else {
                inStringOfType = input[i]!;
            }
        } else if (input.slice(i, i + 2) === "//") {
            inComment = true;
        } else if (input[i] === "\n" && inComment) {
            inComment = false;
        }

        if (!inStringOfType && !inComment && input.slice(i, i + 3) === "---") {
            seenFirstSeparator = true;
            i += 2;
            continue;
        }

        if (seenFirstSeparator) {
            if (input[i] === "$") {
                sqlBlock.push(sqlBlockAccum);
                sqlBlockAccum = "";
                const indexOfWordEnd = input.slice(i + 1).search(/\W/) + i + 1;
                const variableName = input.slice(i + 1, indexOfWordEnd);
                sqlBlock.push({ variable: variableName });
                i = indexOfWordEnd - 1;
            } else {
                sqlBlockAccum += input[i];
            }

            if (i === input.length - 1) {
                sqlBlock.push(sqlBlockAccum);
            }
        } else {
            typescriptBlock1 += input[i];
        }
    }

    const query = sqlBlock
        .map((part) => (typeof part === "string" ? part : "?"))
        .join("")
        .trim();

    const project = new Project({
        ...projectOptions,
        useInMemoryFileSystem: true,
    });

    const queryName = filename.split(".")[0] ?? "query";

    const inputSourceFile = project.createSourceFile(
        "input.ts",
        typescriptBlock1,
    );
    const finalSourceFile = project.createSourceFile("output.ts");

    finalSourceFile.addImportDeclaration({
        moduleSpecifier: tsqlImportName,
        namedImports: [{ name: "compiledApi", alias: "tsql" }],
    });

    // Find out the input types
    const variableStatements = inputSourceFile.getVariableStatements();
    let propsVarNameNode: Node | null = null;
    let ogVariableStatement: VariableStatement | null = null;

    for (const variable of variableStatements) {
        const declarations = variable.getDeclarationList()?.getDeclarations();

        if (
            !declarations ||
            declarations.length === 0 ||
            declarations.length > 1
        ) {
            continue;
        }

        const dec = declarations[0];
        const name = dec?.getNameNode();
        const initialiser = dec?.getInitializer();

        if (!initialiser || !name || !(initialiser instanceof AsExpression)) {
            continue;
        }

        const expression = initialiser.getExpression();

        if (!(expression instanceof PropertyAccessExpression)) {
            continue;
        }

        const declarationType = expression.getContextualType();
        if (
            declarationType &&
            expression.getExpression().getText() === "tsql" &&
            expression.getName() === "props"
        ) {
            propsVarNameNode = name;

            finalSourceFile.addTypeAlias({
                name: "QueryProps",
                type: declarationType.getText(),
            });

            ogVariableStatement = variable;
        }
    }

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

    const outputFunction = finalSourceFile.addFunction({
        name:
            "exec" +
            queryName.charAt(0).toUpperCase() +
            queryName.slice(1) +
            "Query",
        isDefaultExport: true,
    });

    outputFunction.addParameter({
        name: propsVarNameNode?.getText() ?? "{}",
        type: "QueryProps",
    });

    const queryStatement = outputFunction.addVariableStatement({
        declarationKind: VariableDeclarationKind.Const,
        declarations: [
            {
                name: "query",
                initializer: (writer) =>
                    writer.write("`").write(query).write("`"),
            },
        ],
    });

    ogVariableStatement?.remove();
    outputFunction.setBodyText((writer) =>
        writer
            .write(queryStatement.getFullText())
            .write(inputSourceFile.getFullText()),
    );

    // finalSourceFile.fixUnusedIdentifiers();

    return finalSourceFile.getFullText();
}
