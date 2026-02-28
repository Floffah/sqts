#!/usr/bin/env node
//
// import { readFile } from "node:fs/promises";
// import { basename, extname, resolve } from "node:path";
//
// import { compile } from "@/compiler/index.ts";
//
// const inputFile = process.argv[2];
//
// if (!inputFile) {
//     console.error("Usage: tsql <input-file.tsql>");
//     process.exit(1);
// }
//
// const absoluteInputPath = resolve(process.cwd(), inputFile);
// const input = await readFile(absoluteInputPath, "utf8");
// const filename = basename(inputFile, extname(inputFile));
//
// const output = await compile(input, filename, {
//     cwd: process.cwd(),
// });
//
// process.stdout.write(output);
