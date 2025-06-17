import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Разрешаем доступ к PWA-ресурсам без авторизации
  if (
    pathname === "/sw.js" ||
    pathname === "/manifest.json" ||
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  // Публичные пути
  const publicPaths = [
    "/",
    "/login",
    "/register",
    "/confirm",
    "/passwordReset",
    "/reset-password",
    "/api/auth",
  ];
  if (publicPaths.some((path) => pathname.startsWith(path))) {
    return NextResponse.next();
  }

  // Проверяем токен
  const token = await getToken({ req: request });
  if (!token) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

// ✅ Применяем middleware только на нужные страницы, без ошибок regex
export const config = {
  matcher: [
    "/",
    "/login/:path*",
    "/register/:path*",
    "/confirm/:path*",
    "/passwordReset/:path*",
    "/reset-password/:path*",
    "/profile/:path*",
    "/courses/:path*",
    // Добавь сюда остальные защищенные маршруты
  ],
};
