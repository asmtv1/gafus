import type { JWT } from "next-auth/jwt";
import { getToken } from "next-auth/jwt";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export interface AuthMiddlewareConfig {
  authorized?: (params: { token: JWT | null; req: NextRequest }) => boolean;
  redirectTo?: string;
}

export function createAuthMiddleware(config: AuthMiddlewareConfig = {}) {
  return async (req: NextRequest) => {
    const token = await getToken({ req });

    // Проверяем авторизацию
    if (config.authorized) {
      const isAuthorized = config.authorized({ token, req });
      if (!isAuthorized) {
        const redirectUrl = config.redirectTo || "/login";
        return NextResponse.redirect(new URL(redirectUrl, req.url));
      }
    }

    return NextResponse.next();
  };
}
