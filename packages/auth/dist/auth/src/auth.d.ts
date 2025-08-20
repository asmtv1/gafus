import type { AuthUser } from "@gafus/types";
import type { NextAuthOptions, DefaultSession } from "next-auth";
declare module "next-auth" {
    interface Session {
        user: {
            id: string;
            username: string;
            role: AuthUser["role"];
            avatarUrl?: string | null;
        } & DefaultSession["user"];
    }
    interface User {
        id: string;
        username: string;
        role: AuthUser["role"];
    }
}
declare module "next-auth/jwt" {
    interface JWT {
        id: string;
        username: string;
        role: AuthUser["role"];
    }
}
export declare const authOptions: NextAuthOptions;
//# sourceMappingURL=auth.d.ts.map