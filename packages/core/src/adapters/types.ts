export type QueryResultRow = Record<string, unknown>;

export interface NormalizedQueryResult {
    rows: QueryResultRow[];
}

export interface QueryMeta {
    queryName: string;
    sourceFile: string;
}

export type QueryExecutor = (
    query: string,
    params: unknown[],
    meta?: QueryMeta,
) => Promise<NormalizedQueryResult>;
