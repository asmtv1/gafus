// src/lib/actions/getUserPhoneByUsername.ts
"use server";
import { prisma } from "@gafus/prisma";
export async function getUserPhoneByUsername(username) {
    const user = await prisma.user.findUnique({
        where: { username: username.toLowerCase().trim() },
        select: { phone: true },
    });
    return user?.phone ?? null;
}
//# sourceMappingURL=getUserPhoneByUsername.js.map