export type Executor = (
    query: string,
    params: unknown[],
    meta?: QueryMeta,
) => Promise<{
    rows?: QueryResultRow[];
}>;

export function defineExecutor(executor: Executor): Executor {
    return executor;
}

export interface QueryMeta {
    queryName: string;
    sourceFile: string;
}

export type QueryResultRow = Record<string, unknown>;
