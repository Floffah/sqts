import { fileURLToPath } from "node:url";
import { includeIgnoreFile } from "@eslint/compat";
import eslint from "@eslint/js";
import prettier from "eslint-config-prettier";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

const gitignorePath = fileURLToPath(new URL(".gitignore", import.meta.url));

export default defineConfig(
    eslint.configs.recommended,
    tseslint.configs.recommended,
    prettier,
    includeIgnoreFile(gitignorePath, "Imported .gitignore patterns"),
    {
        ignores: ["**/*.test.*", "**/*.sqts.*"],
    },
);
