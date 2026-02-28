export interface Config {
    executor: {
        /*
         * The module that exports `execute(query, params, meta?)`.
         * Example: 'sqts/adapters/bun-sqlite' or '@/db/sqts-executor'
         */
        module: string;
    };

    output?: {
        /**
         * Whether to output compiled code or just types.
         * - `compile`: Compiles each query into its own typescript file in your chosen output directory. This may not work with some imports (inline will work better).
         * - `types`: Only outputs a single .d.ts file with all the types.
         *
         * If using bundling plugins you should use `types` to prevent the same code from being included multiple times.
         */
        mode: "compile" | "types";
        /**
         * The directory to output compiled code to. Only used if `output.mode` is `compile`. Should be a path relative to the project root.
         */
        outdir?: string;
        /**
         * Instead of setting an output directory, this will put the compiled file next to the source file. E.g. src/getUser.sqts becomes src/getUser.sqts.ts
         */
        inline?: boolean;
        /**
         * The file extension to use for compiled files.
         * - `ts` (default): Writes the verbatim output from Typescript (won't be the same as the input file but should include the same code)
         * - `js`: Uses esbuild to transform the output from Typescript to JavaScript. This can be useful if you want to use the compiled output in a JavaScript project. Output will be less readable and no types will be included.
         */
        ext?: "ts" | "js";
    };
}

export function defineConfig(config: Config): Config {
    return config;
}
