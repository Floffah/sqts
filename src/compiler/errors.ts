export function compilerError(filename: string, message: string): never {
    throw new Error(`[tsql:${filename}] ${message}`);
}
