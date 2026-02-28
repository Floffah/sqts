export function splitTemplateInput(input: string) {
    let tsBlock = "";
    let sqlBlock = "";
    let inStringOfType: string | null = null;
    let inComment = false;
    let seenFirstSeparator = false;

    for (let i = 0; i < input.length; i++) {
        if (
            input[i] === '"' ||
            input[i] === "'" ||
            (input[i] === "`" && input[i - 1] !== "\\")
        ) {
            if (inStringOfType === input[i]) {
                inStringOfType = null;
            } else if (!inStringOfType) {
                inStringOfType = input[i]!;
            }
        } else if (!inStringOfType && input.slice(i, i + 2) === "//") {
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
            sqlBlock += input[i];
        } else {
            tsBlock += input[i];
        }
    }

    return {
        tsBlock,
        sqlBlock: sqlBlock.trim(),
    };
}
