import { defineConfig } from "@sqts/core/config";

export default defineConfig({
    executor: {
        module: "@sqts/core/adapters/bun-sqlite",
    },
    // compiler: {
    //     schemaDir: "migrations",
    //     outDir: ".sqts",
    // },
});
