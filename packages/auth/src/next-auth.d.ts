import "next-auth";
import "next-auth/jwt";

export type AuthRole = "USER" | "ADMIN" | "MODERATOR" | "TRAINER" | "PREMIUM";
export interface AuthUser {
  id: string;
  username: string;
  role: AuthRole;
}

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      username: string;
      role: AuthRole;
    } & import("next-auth").DefaultSession["user"];
  }

  interface User {
    id: string;
    username: string;
    role: AuthRole;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    username: string;
    role: AuthRole;
  }
}
