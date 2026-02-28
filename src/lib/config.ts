import type { Config } from "@/config.ts";
import { loadConfig } from "unconfig";

export async function getConfig(cwd = process.cwd()) {
    const { config } = await loadConfig<Config>({
        cwd,
        sources: [
            {
                files: "tsql.config",
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
