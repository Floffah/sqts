import { readdir, readFile } from "fs/promises";
import { resolve } from "path";

import packageJson from "../package.json";

const isDryRun = process.argv.includes("--dry-run");

const workspacesPaths: string[] = [];

for (const workspace of packageJson.workspaces) {
    if (workspace.includes("*")) {
        const basePath = workspace.split("/")[0]!;
        const entries = await readdir(resolve(process.cwd(), basePath), {
            withFileTypes: true,
        });
        for (const entry of entries) {
            if (entry.isDirectory()) {
                workspacesPaths.push(`${basePath}/${entry.name}`);
            }
        }
    } else {
        workspacesPaths.push(workspace);
    }
}

const versionList = {} as Record<string, string>;

console.log(workspacesPaths, packageJson.workspaces);
for (const workspace of workspacesPaths) {
    const workspacePackage = await readFile(
        resolve(process.cwd(), workspace, "package.json"),
        "utf-8",
    );
    const workspacePackageJson = JSON.parse(workspacePackage);
    versionList[workspacePackageJson.name] = workspacePackageJson.version;
}

console.log("Updating workspace references...");

for (const workspace of workspacesPaths) {
    const workspacePackage = await readFile(
        resolve(process.cwd(), workspace, "package.json"),
        "utf-8",
    );
    const workspacePackageJson = JSON.parse(workspacePackage);
    const dependencies = workspacePackageJson.dependencies || {};
    const devDependencies = workspacePackageJson.devDependencies || {};
    const peerDependencies = workspacePackageJson.peerDependencies || {};

    let updated = false;

    for (const [dep, version] of Object.entries(dependencies)) {
        if (versionList[dep] && version !== versionList[dep]) {
            console.log(
                `Updating ${workspacePackageJson.name} dependency ${dep} from ${version} to ${versionList[dep]}`,
            );
            dependencies[dep] = versionList[dep];
            updated = true;
        }
    }

    for (const [dep, version] of Object.entries(devDependencies)) {
        if (versionList[dep] && version !== versionList[dep]) {
            console.log(
                `Updating ${workspacePackageJson.name} devDependency ${dep} from ${version} to ${versionList[dep]}`,
            );
            devDependencies[dep] = versionList[dep];
            updated = true;
        }
    }

    for (const [dep, version] of Object.entries(peerDependencies)) {
        if (versionList[dep] && version !== versionList[dep]) {
            console.log(
                `Updating ${workspacePackageJson.name} peerDependency ${dep} from ${version} to ${versionList[dep]}`,
            );
            peerDependencies[dep] = versionList[dep];
            updated = true;
        }
    }

    if (updated) {
        if (!isDryRun) {
            await Bun.write(
                workspace + "/package.json",
                JSON.stringify(
                    {
                        ...workspacePackageJson,
                        dependencies,
                        devDependencies,
                        peerDependencies,
                    },
                    null,
                    4,
                ),
            );
        } else {
            console.log(
                `Dry run: Not writing changes to ${workspace}/package.json`,
            );
        }
    }
}
