// src/middleware.ts
import { getToken } from "next-auth/jwt";
import { NextResponse, type NextRequest } from "next/server";

// Оптимизированные публичные пути
const PUBLIC_PATHS = [
  "/",
  "/login",
  "/register",
  "/passwordReset",
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
  
  console.log(`=== MIDDLEWARE START for ${pathname} ===`);
  console.log(`Request URL: ${req.url}`);
  console.log(`Request method: ${req.method}`);
  
  const token = await getToken({ 
    req, 
    secret: process.env.NEXTAUTH_SECRET,
    secureCookie: process.env.NODE_ENV === "production",
    cookieName: "next-auth.session-token"
  });

  console.log(`Cookies for ${pathname}:`, [req.cookies.getAll().map(c => c.name)]);
  console.log(`NEXTAUTH_SECRET exists: ${!!process.env.NEXTAUTH_SECRET}`);
  console.log(`NODE_ENV: ${process.env.NODE_ENV}`);
  console.log(`Token result:`, token);

  if (token) {
    console.log(`Token details:`, {
      id: token.id,
      username: token.username,
      role: token.role,
      exp: token.exp,
      iat: token.iat
    });
  }

  // Пропускаем публичные ресурсы
  if (isPublicAsset(pathname)) {
    console.log(`Public asset, allowing: ${pathname}`);
    return NextResponse.next();
  }

  // Пропускаем API маршруты (они имеют свою авторизацию)
  if (pathname.startsWith("/api/")) {
    console.log(`API route, allowing: ${pathname}`);
    return NextResponse.next();
  }

  // Перенаправляем авторизованных пользователей с главной страницы на курсы
  if (pathname === "/" && token) {
    console.log(`Redirecting authenticated user from / to /courses`);
    return NextResponse.redirect(new URL("/courses", url));
  }

  // Пропускаем публичные страницы
  const isPublicPath = PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );

  if (isPublicPath) {
    console.log(`Public path, allowing: ${pathname}`);
    return NextResponse.next();
  }

  // Все остальные маршруты требуют авторизации
  if (!token) {
    console.warn(`No token found for path ${pathname}, redirecting to /`);
    return NextResponse.redirect(new URL("/", url));
  }

  console.log(`=== MIDDLEWARE SUCCESS for ${pathname} ===`);
  console.log(`User ${token.username} authorized for ${pathname}`);
  
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
