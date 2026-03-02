#!/usr/bin/env node
import { Command } from "commander";

import { compileProject } from "@/compiler";

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
        await compileProject();
    });

program.parseAsync();
