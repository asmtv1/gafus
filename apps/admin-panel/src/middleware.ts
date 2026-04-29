import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

// Роли, которым разрешен доступ к admin-panel
const ALLOWED_ROLES = ["ADMIN", "MODERATOR"];

// Публичные пути
const PUBLIC_PATHS = ["/login"];

function edgeLog(level: "info" | "warn", message: string, meta?: Record<string, unknown>) {
  const payload = {
    scope: "admin-panel-middleware",
    message,
    ...(meta ?? {}),
  };

  if (level === "warn") {
    console.warn(payload);
    return;
  }
  console.info(payload);
}

function isPublicAsset(pathname: string): boolean {
  return (
    pathname === "/favicon.ico" ||
    pathname === "/manifest.json" ||
    pathname === "/sw.js" ||
    pathname.startsWith("/static/") ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/icons/") ||
    pathname.startsWith("/uploads/") ||
    pathname.startsWith("/workbox-") ||
    pathname.endsWith(".js.map") ||
    /\.(png|jpg|jpeg|svg|webp|js|css|woff|woff2|ttf|eot)$/.test(pathname)
  );
}

export default async function middleware(req: NextRequest) {
  const { nextUrl, url } = req;
  const pathname = nextUrl.pathname;

  edgeLog("info", "middleware_start", {
    pathname,
    url,
    method: req.method,
  });

  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
    secureCookie: process.env.NODE_ENV === "production",
    cookieName: "next-auth.session-token",
  });

  edgeLog("info", "token_retrieved", {
    hasToken: !!token,
    tokenEmail: token?.email,
    tokenRole: token?.role,
  });

  // Пропускаем публичные ресурсы
  if (isPublicAsset(pathname)) return NextResponse.next();

  // Пропускаем API маршруты (они имеют свою авторизацию)
  if (pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  // Пропускаем публичные страницы
  const isPublicPath =
    PUBLIC_PATHS.includes(pathname) || PUBLIC_PATHS.some((p) => pathname.startsWith(`${p}/`));

  if (isPublicPath) {
    return NextResponse.next();
  }

  // Проверяем авторизацию
  if (!token) {
    edgeLog("warn", "redirect_no_token", {
      pathname,
      hasToken: !!token,
    });
    return NextResponse.redirect(new URL("/login", url));
  }

  edgeLog("info", "token_found", {
    pathname,
    tokenId: token.id,
    tokenUsername: token.username,
    tokenRole: token.role,
  });

  // Проверяем роль пользователя
  const userRole = token.role as string;
  if (!ALLOWED_ROLES.includes(userRole)) {
    edgeLog("warn", "redirect_insufficient_role", {
      pathname,
      userRole,
      allowedRoles: ALLOWED_ROLES,
    });
    return NextResponse.redirect(new URL("/login", url));
  }

  edgeLog("info", "middleware_success", {
    pathname,
    userRole,
  });
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - manifest.json, sw.js, icons/, static/, workbox files
     */
    "/((?!api/|_next/static|_next/image|favicon.ico|manifest.json|sw.js|icons/|static/|workbox-).*)",
  ],
};
