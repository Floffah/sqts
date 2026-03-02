import { Database, type SQLQueryBindings } from "bun:sqlite";

import {
    defineExecutor,
    type QueryMeta,
    type QueryResultRow,
} from "@/lib/executor.ts";

export function normalizeRows(
    rows: unknown[],
    meta?: QueryMeta,
): QueryResultRow[] {
    return rows.map((row) => {
        if (typeof row !== "object" || row === null || Array.isArray(row)) {
            throw new Error(
                `[sqts bun-sqlite] Expected object row for ${meta?.queryName}, got ${typeof row}`,
            );
        }

        return { ...row } as QueryResultRow;
    });
}

export function executorWithBunSqlite(db: Database) {
    return defineExecutor(async (query, params, meta) => {
        const statement = db.query(query);
        const rows = statement.all(...(params as SQLQueryBindings[]));

        return {
            rows: normalizeRows(rows, meta),
        };
    });
}
