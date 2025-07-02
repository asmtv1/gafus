// packages/types/src/next-auth.ts

export interface AuthUser {
  avatarUrl?: string | null;
  id: string;
  username: string;
}

import "next-auth";
import "next-auth/jwt";

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
// packages/types/src/next-auth.ts

export interface AuthUser {
  avatarUrl?: string | null;
  id: string;
  username: string;
}

import "next-auth";
import "next-auth/jwt";

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