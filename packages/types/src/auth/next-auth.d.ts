import "next-auth";
import "next-auth/jwt";
export interface AuthUser {
  avatarUrl?: string | null;
  id: string;
  username: string;
  role: "USER" | "ADMIN" | "MODERATOR" | "TRAINER" | "PREMIUM";
  name?: string | null;
  email?: string | null;
  image?: string | null;
}
declare module "next-auth" {
  interface Session {
    user: AuthUser;
  }
  interface User extends AuthUser {}
}
declare module "next-auth/jwt" {
  interface JWT extends AuthUser {}
}
export {};
//# sourceMappingURL=next-auth.d.ts.map
