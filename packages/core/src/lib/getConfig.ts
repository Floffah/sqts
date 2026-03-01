import createDeepmerge from "@fastify/deepmerge";
import { loadConfig } from "unconfig";

import type { Config } from "@/config.ts";

const defaultConfig = {
    compiler: {
        schemaDir: "migrations",
        outDir: ".sqts",
        modelTypes: true,
    },
} as Config;
const mergeConfig = createDeepmerge({});

export async function getConfig(cwd = process.cwd()) {
    const { config } = await loadConfig<Config>({
        cwd,
        defaults: defaultConfig,
        sources: [
            {
                files: "sqts.config",
                extensions: [
                    "ts",
                    "mts",
                    "cts",
                    "js",
                    "mjs",
                    "cjs",
                    "json",
                    "",
                ],
            },
        ],
        merge: false,
    });

    return mergeConfig(defaultConfig, config ?? {});
}
