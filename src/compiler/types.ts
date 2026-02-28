import type { ProjectOptions, VariableStatement } from "ts-morph";

export interface CompileOptions extends ProjectOptions {
    tsqlImportName?: string;
}

export type OutputMode = "single" | "many";

export interface OutputDeclaration {
    mode: OutputMode;
    rootName: string;
    typeText: string;
    variableStatement: VariableStatement;
}

export interface MappingDescriptor {
    aliasKey: string;
    targetPath: string[];
}
