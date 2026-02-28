export interface Config {
    executor: {
        /*
         * The module that exports `execute(query, params, meta?)`.
         * Example: 'sqts/adapters/bun-sqlite' or '@/db/sqts-executor'
         */
        module: string;
    };
}

export function defineConfig(config: Config): Config {
    return config;
}
