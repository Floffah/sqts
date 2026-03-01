// queries/user.sqts
import type { User } from "./models";

export async function GetUser(params: { id: number; }): Promise<User[]> {
    throw new Error("Not implemented: GetUser");
}

