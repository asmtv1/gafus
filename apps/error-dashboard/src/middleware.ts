import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { withAuth } from "next-auth/middleware";

// Роли, которым разрешен доступ к error-dashboard
const ALLOWED_ROLES = ["ADMIN", "MODERATOR"];

// Публичные пути
const PUBLIC_PATHS = ["/login"];

function isPublicAsset(pathname: string): boolean {
  return (
    pathname === "/favicon.ico" ||
    pathname === "/manifest.json" ||
    pathname === "/sw.js" ||
    pathname.startsWith("/static/") ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/icons/") ||
    pathname.startsWith("/workbox-") ||
    pathname.endsWith(".js.map") ||
    /\.(png|jpg|jpeg|svg|webp|js|css|woff|woff2|ttf|eot)$/.test(pathname)
  );
}

export default withAuth(
  async (req) => {
    const { nextUrl, url } = req;
    const pathname = nextUrl.pathname;
    const token = await getToken({ req });

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
      console.warn(`Redirecting unauthenticated user from ${pathname} to /login`);
      return NextResponse.redirect(new URL("/login", url));
    }

    // Проверяем роль пользователя
    const userRole = token.role as string;
    if (!ALLOWED_ROLES.includes(userRole)) {
      console.warn(`Redirecting user with role ${userRole} from ${pathname} to /login`);
      return NextResponse.redirect(new URL("/login", url));
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        const pathname = req.nextUrl.pathname;

        // Пропускаем публичные ресурсы
        if (isPublicAsset(pathname)) return true;

        // Пропускаем API маршруты
        if (pathname.startsWith("/api/")) return true;

        // Пропускаем публичные маршруты
        const isPublicPath =
          PUBLIC_PATHS.includes(pathname) || PUBLIC_PATHS.some((p) => pathname.startsWith(`${p}/`));

        if (isPublicPath) return true;

        // Проверяем наличие токена
        if (!token) return false;

        // Проверяем роль пользователя
        const userRole = token.role as string;
        return ALLOWED_ROLES.includes(userRole);
      },
    },
  },
);

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
