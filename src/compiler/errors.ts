export function compilerError(filename: string, message: string): never {
    throw new Error(`[sqts:${filename}] ${message}`);
}
