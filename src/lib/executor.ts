import type { NormalizedQueryResult, QueryMeta } from "@/adapters/types.ts";

type Executor = (
    query: string,
    params: unknown[],
    meta?: QueryMeta,
) => Promise<NormalizedQueryResult>;

export function defineExecutor(executor: Executor): Executor {
    return executor;
}
