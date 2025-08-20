/// <reference types="@gafus/types/src/auth/next-auth" />

import "next-auth";
import "next-auth/jwt";

// Реэкспортируем типы из централизованного пакета
export type { AuthUser } from "@gafus/types";

declare module "next-auth" {
  interface Session {
    user: import("@gafus/types").AuthUser;
  }

  interface User extends import("@gafus/types").AuthUser {}
}

declare module "next-auth/jwt" {
  interface JWT extends import("@gafus/types").AuthUser {}
}
