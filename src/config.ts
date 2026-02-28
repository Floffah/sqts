export interface Config {
    executor: {
        /*
         * The module that exports `execute(query, params, meta?)`.
         * Example: 'tsql/adapters/bun-sqlite' or '@/db/tsql-executor'
         */
        module: string;
    };
}

export function defineConfig(config: Config): Config {
    return config;
}
