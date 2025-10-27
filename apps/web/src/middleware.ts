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
  "/confirm",
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
  
  const token = await getToken({ 
    req, 
    secret: process.env.NEXTAUTH_SECRET,
    secureCookie: process.env.NODE_ENV === "production",
    cookieName: "next-auth.session-token"
  });
  
  // Пропускаем публичные ресурсы
  if (isPublicAsset(pathname)) {
    return NextResponse.next();
  }

  // Пропускаем API маршруты (они имеют свою авторизацию)
  if (pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  // Перенаправляем авторизованных пользователей на /courses
  if (token) {
    const authPages = ["/", "/login", "/register"];
    if (authPages.includes(pathname)) {
      const redirectUrl = new URL("/courses", url);
      const response = NextResponse.redirect(redirectUrl, 302);
      
      // Запрещаем кэширование редиректа
      response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      response.headers.set("Pragma", "no-cache");
      response.headers.set("Expires", "0");
      
      return response;
    }
    // Если пользователь авторизован, пропускаем все остальные маршруты
    return NextResponse.next();
  }

  // Пропускаем публичные страницы для неавторизованных
  const isPublicPath = PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );

  if (isPublicPath) {
    return NextResponse.next();
  }

  // Все остальные маршруты требуют авторизации - редиректим на главную
  return NextResponse.redirect(new URL("/", url));
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
