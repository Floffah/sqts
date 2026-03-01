import type { SelectStatement } from "@sqts/sql";

import type { CompileContext } from "@/compiler/getCompileContext.ts";
import { inferPlaceholderTypes } from "@/compiler/inferPlaceholderTypes.ts";
import { buildTableAliasMap } from "@/compiler/lib/buildTableAliasMap.ts";
import { parseFirstSelectFromOperation } from "@/compiler/lib/parseFirstSelectFromOperation.ts";
import {
    resolveSelectOutputInfo,
    type SelectOutputInfo,
} from "@/compiler/select-output.ts";
import type { SqtsOperation } from "@/parser";

export interface OperationAnalysis {
    firstSelect: SelectStatement | null;
    aliasMap: Map<string, string>;
    inferredPlaceholderTypes: Map<string, string>;
    outputInfo: SelectOutputInfo | null;
}

export function analyzeOperation(
    operation: SqtsOperation,
    ctx: CompileContext,
    sourcePath: string,
): OperationAnalysis {
    const firstSelect = parseFirstSelectFromOperation(operation, sourcePath);
    const aliasMap = firstSelect ? buildTableAliasMap(firstSelect) : new Map();

    return {
        firstSelect,
        aliasMap,
        inferredPlaceholderTypes: inferPlaceholderTypes(
            operation,
            ctx,
            sourcePath,
            firstSelect,
            aliasMap,
        ),
        outputInfo: resolveSelectOutputInfo(
            operation,
            ctx,
            sourcePath,
            firstSelect,
        ),
    };
}
