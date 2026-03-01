export interface Config {
    executor: {
        /*
         * The module that exports `execute(query, params, meta?)`.
         * Example: 'sqts/adapters/bun-sqlite' or '@/db/sqts-executor'
         */
        module: string;
    };
    compiler?: {
        /**
         * Path to directory containing .sql files that should be used to derive the schema.
         * This can be your migrations folder
         */
        schemaDir?: string;
        /**
         * Path to output directory for generated types. Defaults to '.sqts' in the project root.
         */
        outDir?: string;
        /**
         * Whether to generate types for the models defined in the schema. Defaults to true
         */
        modelTypes?: boolean;
    };
}

export function defineConfig(config: Config): Config {
    return config;
}
