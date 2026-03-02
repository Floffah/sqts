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
    platform: "node",
    sourcemap: true,
    exports: {
        exclude: ["cli", /^[a-zA-Z0-9]+-[a-zA-Z0-9_-]{8}$/],
    },
    deps: {
        neverBundle: ["bun:sqlite"],
        alwaysBundle: ["@sqts/sql"],
    },
});
