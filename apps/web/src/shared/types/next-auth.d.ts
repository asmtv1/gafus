/// <reference types="@gafus/types/src/auth/next-auth" />

import "next-auth";
import "next-auth/jwt";
import type { AuthUser as GafusAuthUser } from "@gafus/types";

// Реэкспортируем типы из централизованного пакета
export type { AuthUser } from "@gafus/types";

declare module "next-auth" {
  interface Session {
    user: GafusAuthUser;
  }

  interface User extends GafusAuthUser {}
}

declare module "next-auth/jwt" {
  interface JWT extends GafusAuthUser {}
}
