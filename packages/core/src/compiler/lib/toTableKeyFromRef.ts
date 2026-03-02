export function toTableKeyFromRef(
    schema: string | undefined,
    table: string,
): string {
    return `${schema ?? "main"}.${table}`;
}
