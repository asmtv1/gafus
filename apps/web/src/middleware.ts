// src/middleware.ts
import { getToken } from "next-auth/jwt";
import { NextResponse, type NextRequest } from "next/server";

// Оптимизированные публичные пути
const PUBLIC_PATHS = [
  "/",
  "/login",
  "/register",
  "/passwordReset",
  "/reset-password",
  "/profile/confirm-email",
  "/~offline", // Страница офлайна доступна всем
  "/tracer-test", // Тест Tracer без авторизации
  "/api/auth",
  "/api/csrf-token",
  "/api/webhook",
  "/_next",
  "/favicon.ico",
  "/manifest.json",
  "/robots.txt",
  "/sitemap.xml",
] as const;

// Оптимизированная функция проверки публичных ресурсов
function isPublicAsset(pathname: string): boolean {
  return (
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/api/") ||
    pathname.includes(".") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/manifest") ||
    pathname.startsWith("/robots") ||
    pathname.startsWith("/sitemap")
  );
}

export default async function middleware(req: NextRequest) {
  const { nextUrl, url } = req;
  const pathname = nextUrl.pathname;

  // Пропускаем публичные ресурсы
  if (isPublicAsset(pathname)) {
    return NextResponse.next();
  }

  // Пропускаем API маршруты (они имеют свою авторизацию)
  if (pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  // VK ID callback редиректит на /courses или /vk-consent с vk_id_token — разрешаем без сессии
  if (nextUrl.searchParams.has("vk_id_token") && (pathname === "/courses" || pathname === "/vk-consent")) {
    return NextResponse.next();
  }

  // Пропускаем Server Actions (POST запросы к страницам)
  if (req.method === "POST" && req.headers.get("content-type")?.includes("multipart/form-data")) {
    return NextResponse.next();
  }

  // Пропускаем Next.js action endpoints
  if (req.headers.get("next-action")) {
    return NextResponse.next();
  }

  // Должно совпадать с auth. На ngrok NextAuth иногда ставит plain cookie — ищем обе
  const nextAuthUrl = process.env.NEXTAUTH_URL ?? "";
  const secureCookie =
    !/ngrok/i.test(nextAuthUrl) &&
    process.env.NODE_ENV === "production" &&
    nextAuthUrl.startsWith("https://");
  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
    secureCookie,
    cookieName: "next-auth.session-token",
  });

  const mwDebug =
    process.env.VK_ID_DEBUG === "true" ||
    process.env.VK_ID_DEBUG === "1";
  if (mwDebug) {
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "";
    const cookieNames = req.cookies.getAll().map((c) => c.name);
    const hasSecure = cookieNames.includes("__Secure-next-auth.session-token");
    const hasPlain = cookieNames.includes("next-auth.session-token");
    console.log("[MW] pathname=", pathname, "token=", token ? "OK" : "null", "host=", host, "sessionCookie=", hasSecure ? "Secure" : hasPlain ? "plain" : "нет");
  }

  // Перенаправляем авторизованных пользователей на /courses
  if (token) {
    const authPages = ["/", "/login", "/register"];
    if (authPages.includes(pathname)) {
      if (mwDebug) console.log("[MW] auth user на", pathname, "→ redirect /courses");
      const redirectUrl = new URL("/courses", url);
      const response = NextResponse.redirect(redirectUrl, 302);

      // Запрещаем кэширование редиректа
      response.headers.set(
        "Cache-Control",
        "no-store, no-cache, must-revalidate, proxy-revalidate",
      );
      response.headers.set("Pragma", "no-cache");
      response.headers.set("Expires", "0");

      return response;
    }
    if (mwDebug) console.log("[MW] auth user, path=", pathname, "→ next");
    return NextResponse.next();
  }

  // Пропускаем публичные страницы для неавторизованных
  const isPublicPath = PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );

  if (isPublicPath) {
    if (mwDebug) console.log("[MW] public path", pathname, "→ next");
    return NextResponse.next();
  }

  // Все остальные маршруты требуют авторизации - редиректим на главную
  if (mwDebug) console.log("[MW] no token, not public", pathname, "→ redirect /");
  const redirect = NextResponse.redirect(new URL("/", url));
  redirect.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  return redirect;
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
