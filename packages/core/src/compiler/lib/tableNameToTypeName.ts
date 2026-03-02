export function tableNameToTypeName(tableName: string): string {
    return singularize(toPascalCase(tableName));
}

function toPascalCase(value: string): string {
    const tokens = value
        .split(/[^A-Za-z0-9]+/)
        .map((token) => token.trim())
        .filter((token) => token.length > 0);

    if (tokens.length === 0) {
        return "Model";
    }

    return tokens
        .map((token) => token[0]!.toUpperCase() + token.slice(1))
        .join("");
}

function singularize(value: string): string {
    if (value.length <= 1) {
        return value;
    }

    if (/ies$/i.test(value) && value.length > 3) {
        return value.slice(0, -3) + "y";
    }

    if (/ss$/i.test(value)) {
        return value;
    }

    if (/s$/i.test(value)) {
        return value.slice(0, -1);
    }

    return value;
}
