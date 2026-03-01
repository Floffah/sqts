import type { OperationAnalysis } from "@/compiler/analyzeOperation.ts";
import { stripPlaceholderPrefix } from "@/compiler/lib/stripPlaceholderPrefix.ts";
import type { SqtsOperation } from "@/parser";

export function compileOperationSignature(
    operation: SqtsOperation,
    analysis: OperationAnalysis,
    sourcePath: string,
): {
    functionBody: string;
} {
    const placeholders = operation.placeholders.map(stripPlaceholderPrefix);
    const inferredPlaceholderTypes = analysis.inferredPlaceholderTypes;

    const paramsEntries = placeholders.map((placeholder) => {
        const inferred = inferredPlaceholderTypes.get(placeholder);
        return [placeholder, inferred ?? "unknown"] as const;
    });

    const paramsType =
        paramsEntries.length === 0
            ? "{}"
            : `{ ${paramsEntries.map(([name, type]) => `${name}: ${type};`).join(" ")} }`;

    const returnType = analysis.output.returnType;
    const lines: string[] = [];
    lines.push(
        `export async function ${operation.name}(params: ${paramsType}): Promise<${returnType}> {`,
    );

    for (const statement of analysis.statements) {
        const queryVar = `__sqtsQuery${statement.statementIndex}`;
        const paramsVar = `__sqtsParams${statement.statementIndex}`;
        const resultVar = `__sqtsResult${statement.statementIndex}`;
        const paramsArray = statement.placeholderOrder
            .map((placeholder) => `params.${placeholder}`)
            .join(", ");

        lines.push(`    const ${queryVar} = ${JSON.stringify(statement.compiledSql)};`);
        lines.push(`    const ${paramsVar} = [${paramsArray}];`);
        if (statement.statementIndex === analysis.output.statementIndex) {
            lines.push(
                `    const ${resultVar} = await __sqtsExecute(${queryVar}, ${paramsVar}, { queryName: ${JSON.stringify(
                    operation.name,
                )}, sourceFile: ${JSON.stringify(sourcePath)}, statementIndex: ${statement.statementIndex} });`,
            );
            continue;
        }

        lines.push(
            `    await __sqtsExecute(${queryVar}, ${paramsVar}, { queryName: ${JSON.stringify(
                operation.name,
            )}, sourceFile: ${JSON.stringify(sourcePath)}, statementIndex: ${statement.statementIndex} });`,
        );
    }

    if (analysis.output.statementIndex === null) {
        lines.push("    return;");
        lines.push("}");
        return {
            functionBody: lines.join("\n"),
        };
    }

    const returnResultVar = `__sqtsResult${analysis.output.statementIndex}`;
    lines.push(
        `    const __sqtsRows = (${returnResultVar}.rows ?? []) as Record<string, unknown>[];`,
    );

    const outputValueType = analysis.output.valueType ?? "{}";

    if (analysis.output.fields.length === 0) {
        lines.push(`    return __sqtsRows.map(() => ({} as ${outputValueType}));`);
        lines.push("}");
        return {
            functionBody: lines.join("\n"),
        };
    }

    lines.push("    return __sqtsRows.map((__sqtsRow) => ({");
    for (const field of analysis.output.fields) {
        lines.push(
            `        ${field.propertyKey}: __sqtsRow[${JSON.stringify(field.outputKey)}] as ${field.tsType},`,
        );
    }
    lines.push(`    }) as ${outputValueType});`);
    lines.push("}");

    return {
        functionBody: lines.join("\n"),
    };
}
