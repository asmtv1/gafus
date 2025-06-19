// src/middleware.ts
import { NextResponse } from "next/server";
import { withAuth } from "next-auth/middleware";
import { getToken } from "next-auth/jwt";

const PUBLIC_PATHS = [
  "/",
  "/login",
  "/register",
  "/confirm",
  "/passwordReset",
  "/reset-password",
  "/api/auth",
];

function isPublicAsset(pathname: string): boolean {
  return (
    pathname === "/favicon.ico" ||
    pathname === "/manifest.json" ||
    pathname === "/sw.js" ||
    pathname.startsWith("/static/") ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/icons/") ||
    /\.(png|jpg|jpeg|svg|webp)$/.test(pathname)
  );
}

export default withAuth(
  async (req) => {
    const { nextUrl, url } = req;
    const pathname = nextUrl.pathname;
    const token = await getToken({ req });

    if (isPublicAsset(pathname)) return NextResponse.next();

    if (
      PUBLIC_PATHS.includes(pathname) ||
      PUBLIC_PATHS.some((p) => pathname.startsWith(`${p}/`))
    ) {
      return NextResponse.next();
    }

    if (!token) {
      return NextResponse.redirect(new URL("/", url));
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        const pathname = req.nextUrl.pathname;

        // Блокируем доступ на защищённые маршруты без токена:
        if (
          !PUBLIC_PATHS.some((p) => pathname.startsWith(p)) &&
          !isPublicAsset(pathname)
        ) {
          return !!token;
        }

        // Во всех остальных случаях — пропускаем без проверки
        return true;
      },
    },
  }
);

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
  ],
};
