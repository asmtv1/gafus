export interface AuthUser {
  avatarUrl?: string | null;
  id: string;
  username: string;
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
