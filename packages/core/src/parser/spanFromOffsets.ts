import type { ParserState } from "@/parser/state.ts";
import type { SqtsSourcePosition, SqtsSourceSpan } from "@/parser/types.ts";

export function spanFromOffsets(
    state: ParserState,
    startOffset: number,
    endOffset: number,
): SqtsSourceSpan {
    return {
        start: positionFromOffset(state, startOffset),
        end: positionFromOffset(state, endOffset),
    };
}

function positionFromOffset(
    state: ParserState,
    offset: number,
): SqtsSourcePosition {
    const located = state.locator.locate(offset);
    return {
        offset,
        line: located.line,
        column: located.column,
    };
}
