import { defineConfig } from "tsdown";

export default defineConfig({
    entry: [
        "src/index.ts",
        "src/config.ts",
        "src/cli.ts",
        "src/adapters/bun-sqlite.ts",
    ],
    dts: true,
    format: ["esm", "cjs"],
    platform: "neutral",
    exports: {
        all: true,
        devExports: "development",
        exclude: ["cli", "types*"],
    },
    deps: {
        neverBundle: ["bun:sqlite"],
    },
});
