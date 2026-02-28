import { loadConfig } from "unconfig";

import type { Config } from "@/config.ts";

export async function getConfig(cwd = process.cwd()) {
    const { config } = await loadConfig<Config>({
        cwd,

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

    return config;
}
