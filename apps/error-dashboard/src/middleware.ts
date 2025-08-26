import { NextResponse, NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

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

export default async function middleware(req: NextRequest) {
  const { nextUrl, url } = req;
  const pathname = nextUrl.pathname;
    
  console.log(`=== MIDDLEWARE START for ${pathname} ===`);
  console.log(`Request URL: ${url}`);
  console.log(`Request method: ${req.method}`);
  
  // Логируем все заголовки
  console.log(`Request headers:`, Object.fromEntries(req.headers.entries()));
  
  // Логируем cookies для отладки
  const cookies = req.cookies;
  console.log(`Cookies for ${pathname}:`, Object.keys(cookies));
  console.log(`All cookies:`, cookies);
  
  console.log(`NEXTAUTH_SECRET exists:`, !!process.env.NEXTAUTH_SECRET);
  console.log(`NODE_ENV:`, process.env.NODE_ENV);
  
  const token = await getToken({ 
    req, 
    secret: process.env.NEXTAUTH_SECRET,
    secureCookie: process.env.NODE_ENV === "production",
    cookieName: "next-auth.session-token"
  });
  
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
    console.warn(`=== REDIRECTING TO LOGIN ===`);
    console.warn(`Path: ${pathname}`);
    console.warn(`Token:`, token);
    console.warn(`Redirecting to: /login`);
    return NextResponse.redirect(new URL("/login", url));
  }

  console.log(`Token found for path ${pathname}:`, { 
    id: token.id, 
    username: token.username, 
    role: token.role 
  });

  // Проверяем роль пользователя
  const userRole = token.role as string;
  if (!ALLOWED_ROLES.includes(userRole)) {
    console.warn(`=== REDIRECTING BY ROLE ===`);
    console.warn(`Path: ${pathname}`);
    console.warn(`User role: ${userRole}`);
    console.warn(`Allowed roles:`, ALLOWED_ROLES);
    console.warn(`Redirecting to: /login`);
    return NextResponse.redirect(new URL("/login", url));
  }

  console.log(`=== MIDDLEWARE SUCCESS for ${pathname} ===`);
  console.log(`User authorized with role: ${userRole}`);
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
