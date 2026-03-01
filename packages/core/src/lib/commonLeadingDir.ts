import { normalize, sep } from "path";

export function commonLeadingDir(paths: string[]): string {
    if (paths.length === 0) return "";

    const split = paths.map((p) => normalize(p).split(sep));
    const first = split[0]!;
    let i = 0;

    while (
        i < first.length &&
        split.every((parts) => i < parts.length && parts[i] === first[i])
    ) {
        i++;
    }

    return i === 0 ? "" : first.slice(0, i).join(sep);
}
