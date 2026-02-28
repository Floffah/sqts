import { defineConfig } from "sqts/config";

export default defineConfig({
    executor: {
        module: "./index.ts",
    },
    output: {
        mode: "compile",
        // outdir: "sqts",
        inline: true,
        ext: "ts",
    },
});
