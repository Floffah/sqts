#!/usr/bin/env node
import { Command } from "commander";

import { compileProject, watchAndCompileProject } from "@/compiler";

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
    .option("--watch", "Watch for changes and recompile automatically")
    .action(async function () {
        const opts = this.opts();

        if (opts.watch) {
            await watchAndCompileProject();
        } else {
            await compileProject();
            console.log("[SQTS] Compilation complete.");
        }
    });

program.parseAsync();
