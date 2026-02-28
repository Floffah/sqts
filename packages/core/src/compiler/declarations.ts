import type { SourceFile, VariableStatement } from "ts-morph";
import { Node, PropertyAccessExpression, SyntaxKind } from "ts-morph";

import { compilerError } from "@/compiler/errors.ts";
import type { OutputDeclaration, OutputMode } from "@/compiler/types.ts";

interface ExtractedDeclarations {
    output: OutputDeclaration | null;
    propsVarName: string;
    propsVarStatement: VariableStatement | null;
}

function isSupportedOutputInitializer(output: OutputDeclaration, node: Node) {
    if (output.mode === "many") {
        if (Node.isArrayLiteralExpression(node)) {
            return node.getElements().length === 0;
        }
        if (Node.isAsExpression(node)) {
            const expression = node.getExpression();
            return (
                Node.isArrayLiteralExpression(expression) &&
                expression.getElements().length === 0
            );
        }
        return false;
    }

    if (Node.isObjectLiteralExpression(node)) {
        return node.getProperties().length === 0;
    }
    if (Node.isAsExpression(node)) {
        const expression = node.getExpression();
        return (
            Node.isObjectLiteralExpression(expression) &&
            expression.getProperties().length === 0
        );
    }
    return false;
}

export function extractDeclarations(
    inputSourceFile: SourceFile,
    finalSourceFile: SourceFile,
    filename: string,
): ExtractedDeclarations {
    const variableStatements = inputSourceFile.getVariableStatements();
    let propsVarName = "";
    let propsVarStatement: VariableStatement | null = null;
    const exportedStatements: VariableStatement[] = [];

    for (const variable of variableStatements) {
        const declarations = variable.getDeclarationList().getDeclarations();

        if (
            variable
                .getModifiers()
                .some(
                    (modifier) =>
                        modifier.getKind() === SyntaxKind.ExportKeyword,
                )
        ) {
            if (declarations.length !== 1) {
                compilerError(
                    filename,
                    "Exported output declaration must contain exactly one variable",
                );
            }
            exportedStatements.push(variable);
        }

        if (declarations.length !== 1) {
            continue;
        }

        const declaration = declarations[0]!;
        const initializer = declaration.getInitializer();
        if (!initializer || !Node.isAsExpression(initializer)) {
            continue;
        }

        const expression = initializer.getExpression();
        if (!(expression instanceof PropertyAccessExpression)) {
            continue;
        }

        const declarationType = expression.getContextualType();
        if (
            declarationType &&
            expression.getExpression().getText() === "sqts" &&
            expression.getName() === "props"
        ) {
            propsVarName = declaration.getNameNode().getText();
            propsVarStatement = variable;
            finalSourceFile.addTypeAlias({
                name: "QueryProps",
                type: declarationType.getText(),
            });
        }
    }

    if (exportedStatements.length === 0) {
        return {
            output: null,
            propsVarName,
            propsVarStatement,
        };
    }

    if (exportedStatements.length > 1) {
        compilerError(
            filename,
            "Exactly one exported output declaration is required per sqts file",
        );
    }

    const outputVarStatement = exportedStatements[0]!;
    const outputDeclaration = outputVarStatement
        .getDeclarationList()
        .getDeclarations()[0]!;
    const outputTypeNode = outputDeclaration.getTypeNode();
    const outputInitializer = outputDeclaration.getInitializer();

    if (!outputTypeNode || !outputInitializer) {
        compilerError(
            filename,
            "Output declaration must include both an explicit type and initializer",
        );
    }

    const outputMode: OutputMode = Node.isArrayTypeNode(outputTypeNode)
        ? "many"
        : "single";
    const output: OutputDeclaration = {
        mode: outputMode,
        rootName: outputDeclaration.getName(),
        typeText: outputTypeNode.getText(),
        variableStatement: outputVarStatement,
    };

    if (!isSupportedOutputInitializer(output, outputInitializer)) {
        compilerError(
            filename,
            "Unsupported output declaration shape. Use `export const user: User = {} as User` or `export const users: User[] = []`.",
        );
    }

    return {
        output,
        propsVarName,
        propsVarStatement,
    };
}
