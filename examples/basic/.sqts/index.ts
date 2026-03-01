// queries/user.sqts
import { execute as __sqtsExecute } from "@/";
import type { User } from "./types";

export async function GetUser(params: { id: number; }): Promise<User[]> {
    const __sqtsQuery0 = "SELECT * FROM users WHERE id = ?";
    const __sqtsParams0 = [params.id];
    const __sqtsResult0 = await __sqtsExecute(__sqtsQuery0, __sqtsParams0, { queryName: "GetUser", sourceFile: "queries/user.sqts", statementIndex: 0 });
    const __sqtsRows = (__sqtsResult0.rows ?? []) as Record<string, unknown>[];
    return __sqtsRows.map((__sqtsRow) => ({
        id: __sqtsRow["id"] as number,
        name: __sqtsRow["name"] as string,
        email: __sqtsRow["email"] as string,
    }) as User);
}

