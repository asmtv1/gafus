import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { createTrainerPanelLogger } from "@gafus/logger";

// Создаем логгер для trainer-panel
const logger = createTrainerPanelLogger('trainer-panel-middleware');

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
  
  logger.info(`MIDDLEWARE START for ${pathname}`, {
    pathname: pathname,
    url: req.url,
    method: req.method,
    operation: 'middleware_start'
  });
  
  const token = await getToken({ 
    req, 
    secret: process.env.NEXTAUTH_SECRET,
    secureCookie: process.env.NODE_ENV === "production",
    cookieName: "next-auth.session-token"
  });

  logger.info('Cookies logged', {
    cookieCount: req.cookies.getAll().length,
    hasSessionToken: req.cookies.has('next-auth.session-token'),
    operation: 'log_cookies'
  });
  logger.info('Environment variables checked', {
    hasNextAuthSecret: !!process.env.NEXTAUTH_SECRET,
    nodeEnv: process.env.NODE_ENV,
    operation: 'check_env'
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
  if (isPublicAsset(pathname)) {
    logger.info(`Public asset, allowing: ${pathname}`, {
      pathname: pathname,
      operation: 'allow_public_asset'
    });
    return NextResponse.next();
  }

  // Пропускаем API маршруты (они имеют свою авторизацию)
  if (pathname.startsWith("/api/")) {
    logger.info(`API route, allowing: ${pathname}`, {
      pathname: pathname,
      operation: 'allow_api_route'
    });
    return NextResponse.next();
  }

  // Пропускаем публичные страницы
  const isPublicPath =
    PUBLIC_PATHS.includes(pathname) || PUBLIC_PATHS.some((p) => pathname.startsWith(`${p}/`));

  if (isPublicPath) {
    logger.info(`Public path, allowing: ${pathname}`, {
      pathname: pathname,
      operation: 'allow_public_path'
    });
    return NextResponse.next();
  }

  // Проверяем авторизацию
  if (!token) {
    logger.warn(`No token found for path ${pathname}, redirecting to /login`, {
      pathname: pathname,
      hasToken: !!token,
      operation: 'redirect_no_token'
    });
    return NextResponse.redirect(new URL("/login", url));
  }

  // Проверяем роль пользователя
  const userRole = token.role as string;
  if (!ALLOWED_ROLES.includes(userRole)) {
    logger.warn(`Access denied for user with role ${userRole} from ${pathname}`, {
      pathname: pathname,
      userRole: userRole,
      allowedRoles: ALLOWED_ROLES,
      operation: 'access_denied'
    });
    return NextResponse.redirect(new URL("/login", url));
  }

  logger.success(`MIDDLEWARE SUCCESS for ${pathname}`, {
    pathname: pathname,
    username: token.username,
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
