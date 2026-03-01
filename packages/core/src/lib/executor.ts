export type Executor = (
    query: string,
    params: unknown[],
    meta?: object,
) => Promise<never>;

export function defineExecutor(executor: Executor): Executor {
    return executor;
}
