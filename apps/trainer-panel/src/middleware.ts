import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

// Роли, которым разрешен доступ к trainer-panel
const ALLOWED_ROLES = ["ADMIN", "MODERATOR", "TRAINER"];

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
  
  console.warn(`=== MIDDLEWARE START for ${pathname} ===`);
  console.warn(`Request URL: ${req.url}`);
  console.warn(`Request method: ${req.method}`);
  console.warn(`Request headers:`, Object.fromEntries(req.headers.entries()));
  
  const token = await getToken({ 
    req, 
    secret: process.env.NEXTAUTH_SECRET,
    secureCookie: process.env.NODE_ENV === "production",
    cookieName: "next-auth.session-token"
  });

  console.warn(`Cookies for ${pathname}:`, [req.cookies.getAll().map(c => c.name)]);
  console.warn(`All cookies:`, req.cookies);
  console.warn(`NEXTAUTH_SECRET exists: ${!!process.env.NEXTAUTH_SECRET}`);
  console.warn(`NODE_ENV: ${process.env.NODE_ENV}`);
  console.warn(`Token result:`, token);

  if (token) {
    console.warn(`Token details:`, {
      id: token.id,
      username: token.username,
      role: token.role,
      exp: token.exp,
      iat: token.iat
    });
  }

  // Пропускаем публичные ресурсы
  if (isPublicAsset(pathname)) {
    console.warn(`Public asset, allowing: ${pathname}`);
    return NextResponse.next();
  }

  // Пропускаем API маршруты (они имеют свою авторизацию)
  if (pathname.startsWith("/api/")) {
    console.warn(`API route, allowing: ${pathname}`);
    return NextResponse.next();
  }

  // Пропускаем публичные страницы
  const isPublicPath =
    PUBLIC_PATHS.includes(pathname) || PUBLIC_PATHS.some((p) => pathname.startsWith(`${p}/`));

  if (isPublicPath) {
    console.warn(`Public path, allowing: ${pathname}`);
    return NextResponse.next();
  }

  // Проверяем авторизацию
  if (!token) {
    console.warn(`No token found for path ${pathname}, redirecting to /login`);
    return NextResponse.redirect(new URL("/login", url));
  }

  // Проверяем роль пользователя
  const userRole = token.role as string;
  if (!ALLOWED_ROLES.includes(userRole)) {
    console.warn(`Access denied for user with role ${userRole} from ${pathname}`);
    return NextResponse.redirect(new URL("/login", url));
  }

  console.warn(`=== MIDDLEWARE SUCCESS for ${pathname} ===`);
  console.warn(`User ${token.username} with role ${userRole} authorized for ${pathname}`);
  
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
