import { NextResponse, NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { createErrorDashboardLogger } from "@gafus/logger";

// Создаем логгер для error-dashboard (отключена отправка в error-dashboard)
const logger = createErrorDashboardLogger('error-dashboard-middleware');

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
    
  logger.info(`MIDDLEWARE START for ${pathname}`, {
    pathname: pathname,
    url: url,
    method: req.method,
    operation: 'middleware_start'
  });
  
  logger.info('Request headers logged', {
    hasAuth: req.headers.has('authorization'),
    hasUserAgent: req.headers.has('user-agent'),
    operation: 'log_headers'
  });
  
  // Логируем cookies для отладки
  const cookies = req.cookies;
  logger.info('Cookies logged', {
    cookieCount: Object.keys(cookies).length,
    hasSessionToken: cookies.has('next-auth.session-token'),
    operation: 'log_cookies'
  });
  
  logger.info('Environment variables checked', {
    hasNextAuthSecret: !!process.env.NEXTAUTH_SECRET,
    nodeEnv: process.env.NODE_ENV,
    operation: 'check_env'
  });
  
  const token = await getToken({ 
    req, 
    secret: process.env.NEXTAUTH_SECRET,
    secureCookie: process.env.NODE_ENV === "production",
    cookieName: "next-auth.session-token"
  });
  
  logger.info('Token retrieved', {
    hasToken: !!token,
    tokenEmail: token?.email,
    tokenRole: token?.role,
    operation: 'get_token'
  });
  if (token) {
    logger.info('Token details logged', {
      hasToken: !!token,
      tokenId: token?.id,
      tokenUsername: token?.username,
      tokenRole: token?.role,
      operation: 'log_token_details'
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
    logger.warn('Redirecting to login - no token', {
      pathname: pathname,
      hasToken: !!token,
      operation: 'redirect_no_token'
    });
    return NextResponse.redirect(new URL("/login", url));
  }

  logger.info(`Token found for path ${pathname}`, {
    pathname: pathname,
    tokenId: token.id,
    tokenUsername: token.username,
    tokenRole: token.role,
    operation: 'token_found'
  });

  // Проверяем роль пользователя
  const userRole = token.role as string;
  if (!ALLOWED_ROLES.includes(userRole)) {
    logger.warn('Redirecting to login - insufficient role', {
      pathname: pathname,
      userRole: userRole,
      allowedRoles: ALLOWED_ROLES,
      operation: 'redirect_insufficient_role'
    });
    return NextResponse.redirect(new URL("/login", url));
  }

  logger.success(`MIDDLEWARE SUCCESS for ${pathname}`, {
    pathname: pathname,
    userRole: userRole,
    operation: 'middleware_success'
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
