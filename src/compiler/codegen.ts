import type { MappingDescriptor, OutputDeclaration } from "./types.ts";
import type { FunctionDeclaration } from "ts-morph";

function getElementType(outputTypeText: string) {
    return outputTypeText.endsWith("[]")
        ? outputTypeText.slice(0, -2)
        : outputTypeText;
}

export function populateOutputFunctionBody({
    outputFunction,
    normalizedSql,
    extraHeaderCode,
    variableNames,
    mappings,
    output,
}: {
    outputFunction: FunctionDeclaration;
    normalizedSql: string;
    extraHeaderCode: string;
    variableNames: string[];
    mappings: MappingDescriptor[];
    output: OutputDeclaration;
}) {
    outputFunction.setBodyText((writer) => {
        writer.writeLine(`const query = \`${normalizedSql}\`;`);
        if (extraHeaderCode) {
            writer.blankLine();
            writer.write(extraHeaderCode);
            writer.blankLine();
        }

        if (variableNames.length > 0) {
            writer.writeLine(
                `const output = execSql(query, ${variableNames.join(", ")});`,
            );
        } else {
            writer.writeLine("const output = execSql(query);");
        }
        writer.writeLine(
            "const rows = output.rows as Record<string, unknown>[];",
        );
        writer.blankLine();
        writer.writeLine(
            "const setPath = (target: Record<string, any>, path: string[], value: unknown) => {",
        );
        writer.writeLine("    let current: Record<string, any> = target;");
        writer.writeLine("    for (let i = 0; i < path.length - 1; i++) {");
        writer.writeLine("        const key = path[i]!;");
        writer.writeLine("        const existing = current[key];");
        writer.writeLine(
            '        if (typeof existing !== "object" || existing === null || Array.isArray(existing)) {',
        );
        writer.writeLine("            current[key] = {};");
        writer.writeLine("        }");
        writer.writeLine(
            "        current = current[key] as Record<string, any>;",
        );
        writer.writeLine("    }");
        writer.writeLine("    current[path[path.length - 1]!] = value;");
        writer.writeLine("};");
        writer.blankLine();
        writer.writeLine("const mappings = [");
        for (const mapping of mappings) {
            writer.writeLine(
                `    { aliasKey: ${JSON.stringify(mapping.aliasKey)}, targetPath: ${JSON.stringify(mapping.targetPath)} },`,
            );
        }
        writer.writeLine("] as const;");
        writer.blankLine();

        if (output.mode === "many") {
            const elementType = getElementType(output.typeText);
            writer.writeLine(
                `const ${output.rootName}: ${output.typeText} = [];`,
            );
            writer.writeLine("for (const row of rows) {");
            writer.writeLine(`    const value = {} as ${elementType};`);
            writer.writeLine("    for (const mapping of mappings) {");
            writer.writeLine(
                "        setPath(value as Record<string, any>, [...mapping.targetPath], row[mapping.aliasKey]);",
            );
            writer.writeLine("    }");
            writer.writeLine(`    ${output.rootName}.push(value);`);
            writer.writeLine("}");
            writer.writeLine(`return ${output.rootName};`);
            return;
        }

        writer.writeLine("if (rows.length !== 1) {");
        writer.writeLine(
            `    throw new Error("Expected exactly one row for ${output.rootName}, got " + rows.length);`,
        );
        writer.writeLine("}");
        writer.writeLine(`const value = {} as ${output.typeText};`);
        writer.writeLine("const row = rows[0]!;");
        writer.writeLine("for (const mapping of mappings) {");
        writer.writeLine(
            "    setPath(value as Record<string, any>, [...mapping.targetPath], row[mapping.aliasKey]);",
        );
        writer.writeLine("}");
        writer.writeLine("return value;");
    });
}
