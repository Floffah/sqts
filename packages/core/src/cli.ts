#!/usr/bin/env node
import { Command } from "commander";

import { compileDirectory } from "@/compiler/directory.ts";

import packageJson from "../package.json";

const program = new Command();

program
    .name("sqts")
    .description(packageJson.description)
    .version(packageJson.version);

program
    .command("compile")
    .alias("c")
    .description("Compile SQL files to TypeScript")
    .action(async () => {
        const compileResult = await compileDirectory();

        console.log("[SQTS] Compilation complete. Generated files:");
        for (const [inputFile, output] of Object.entries(
            compileResult.writtenFiles,
        )) {
            console.log(`- ${inputFile} -> ${output}`);
        }
    });

program.parseAsync();
