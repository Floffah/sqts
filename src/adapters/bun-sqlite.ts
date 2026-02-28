import { Database } from "bun:sqlite";

import type { QueryMeta, QueryResultRow } from "@/adapters/types.ts";
import { defineExecutor } from "@/lib/executor.ts";

interface BunSQLiteStatement {
    all(...params: unknown[]): unknown[];
}

interface BunSQLiteLikeDatabase {
    query(sql: string): BunSQLiteStatement;
}

let defaultDatabase: BunSQLiteLikeDatabase | null = null;

function getMetaLabel(meta?: QueryMeta) {
    if (!meta) {
        return "<unknown-query>";
    }

    return `${meta.queryName} (${meta.sourceFile})`;
}

function resolveDefaultDatabase() {
    if (defaultDatabase) {
        return defaultDatabase;
    }

    const pathFromEnv =
        process.env.SQTS_BUN_SQLITE_PATH ??
        process.env.BUN_SQLITE_PATH ??
        process.env.SQLITE_DATABASE_PATH ??
        process.env.DATABASE_URL;

    if (!pathFromEnv) {
        throw new Error(
            "[sqts bun-sqlite] No default sqlite path configured. Set SQTS_BUN_SQLITE_PATH (or BUN_SQLITE_PATH / SQLITE_DATABASE_PATH / DATABASE_URL), or use a custom executor module in sqts.config.*",
        );
    }

    defaultDatabase = new Database(pathFromEnv);
    return defaultDatabase;
}

export function normalizeRows(
    rows: unknown[],
    meta?: QueryMeta,
): QueryResultRow[] {
    return rows.map((row) => {
        if (typeof row !== "object" || row === null || Array.isArray(row)) {
            throw new Error(
                `[sqts bun-sqlite] Expected object row for ${getMetaLabel(meta)}, got ${typeof row}`,
            );
        }

        return { ...row } as QueryResultRow;
    });
}

export function setDefaultDatabase(database: BunSQLiteLikeDatabase) {
    defaultDatabase = database;
}

export function clearDefaultDatabase() {
    defaultDatabase = null;
}

export const execute = defineExecutor(async (query, params, meta) => {
    const database = resolveDefaultDatabase();
    const statement = database.query(query);
    const rows = statement.all(...params);

    if (!Array.isArray(rows)) {
        throw new Error(
            `[sqts bun-sqlite] Expected query().all() to return an array for ${getMetaLabel(meta)}`,
        );
    }

    return {
        rows: normalizeRows(rows, meta),
    };
});
