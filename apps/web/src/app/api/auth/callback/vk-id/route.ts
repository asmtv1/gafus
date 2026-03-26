import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { revalidatePath } from "next/cache";

import { authOptions, storeVkIdOneTimeUser } from "@gafus/auth";
import { getServerSession } from "next-auth";
import { prisma } from "@gafus/prisma";
import {
  exchangeVkCodeAndGetUser,
  exchangeVkCodeForProfile,
  linkVkToUser,
} from "@gafus/core/services/auth";
import { createWebLogger } from "@gafus/logger";

import { profilePagePath } from "@shared/lib/profile/profilePagePath";
import { checkAuthRateLimit, getClientIp } from "@shared/lib/rateLimit";

const logger = createWebLogger("vk-id-callback");

const vkIdCallbackDebug =
  process.env.NODE_ENV === "development" ||
  process.env.VK_ID_DEBUG === "true" ||
  process.env.VK_ID_DEBUG === "1";

export async function GET(request: NextRequest) {
  if (vkIdCallbackDebug) console.log("[VK ID callback] GET вызван, url:", request.url);

  const forwardedHost = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "";
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  let baseOrigin: string;
  if (/ngrok/i.test(forwardedHost)) {
    baseOrigin = `https://${forwardedHost}`;
  } else if (
    forwardedHost &&
    /\./.test(forwardedHost) &&
    !/localhost|127\.0\.0\.1|^[a-f0-9]{12}$/i.test(forwardedHost.split(":")[0] ?? "")
  ) {
    baseOrigin = `${proto}://${forwardedHost}`;
  } else {
    // В Docker/proxy Host может быть внутренним — используем env, затем fallback для production
    const vkOrigin = process.env.VK_WEB_REDIRECT_URI
      ? new URL(process.env.VK_WEB_REDIRECT_URI).origin
      : null;
    const webUrl = process.env.WEB_APP_URL ?? process.env.NEXT_PUBLIC_APP_URL;
    const prodFallback = process.env.NODE_ENV === "production" ? "https://gafus.ru" : null;
    baseOrigin = vkOrigin ?? webUrl ?? prodFallback ?? new URL(request.url).origin;
  }

  const ip = getClientIp(request);
  if (!checkAuthRateLimit(ip, "vk-id-callback")) {
    if (vkIdCallbackDebug) console.warn("[VK ID callback] rate limit");
    return NextResponse.redirect(new URL("/?error=rate_limit", baseOrigin));
  }

  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const device_id = searchParams.get("device_id");
  const returnedState = searchParams.get("state");

  if (vkIdCallbackDebug) console.log("[VK ID callback] params: code=", !!code, "device_id=", !!device_id, "state=", !!returnedState);

  const cookieStore = await cookies();
  const cookieRaw = cookieStore.get("vk_id_state")?.value;

  cookieStore.delete("vk_id_state");

  if (!code || !device_id || !returnedState || !cookieRaw) {
    if (vkIdCallbackDebug) console.warn("[VK ID callback] не хватает параметров или cookie");
    return NextResponse.redirect(new URL("/?error=vk_id_auth_failed", baseOrigin));
  }

  let parsedCookie: {
    state: string;
    codeVerifier: string;
    returnPath?: string;
    mode?: string;
    redirectUri?: string;
  };
  try {
    parsedCookie = JSON.parse(cookieRaw);
  } catch {
    return NextResponse.redirect(new URL("/?error=vk_id_auth_failed", baseOrigin));
  }
  // Для логина (/) и (/login) — сразу на /courses, минуя промежуточный редирект
  const returnPath =
    parsedCookie.returnPath === "/register"
      ? "/register"
      : parsedCookie.returnPath === "/" || parsedCookie.returnPath === "/login"
        ? "/courses"
        : "/login";

  const stateA = new Uint8Array(Buffer.from(returnedState, "utf8"));
  const stateB = new Uint8Array(Buffer.from(parsedCookie.state, "utf8"));
  const errorRedirectPath = parsedCookie.returnPath ?? "/";
  if (
    stateA.length !== stateB.length ||
    !crypto.timingSafeEqual(stateA, stateB)
  ) {
    if (vkIdCallbackDebug) console.warn("[VK ID callback] state mismatch");
    logger.warn("VK ID state mismatch", { ip });
    return NextResponse.redirect(new URL(`${errorRedirectPath}?error=vk_id_auth_failed`, baseOrigin));
  }

  const isLinkMode = parsedCookie.mode === "link";

  const clientId = process.env.VK_CLIENT_ID ?? "";
  let redirectUri =
    parsedCookie.redirectUri ??
    process.env.VK_WEB_REDIRECT_URI ??
    "";
  if (!redirectUri && forwardedHost) {
    if (/ngrok/i.test(forwardedHost)) {
      redirectUri = `https://${forwardedHost}/api/auth/callback/vk-id`;
    } else if (/localhost|127\.0\.0\.1/i.test(forwardedHost)) {
      redirectUri = `${baseOrigin}/api/auth/callback/vk-id`;
    }
  }
  if (vkIdCallbackDebug) console.log("[VK ID callback] state OK, redirectUri=", redirectUri, "обмениваем code на token...");

  try {
    if (isLinkMode) {
      const session = await getServerSession(authOptions);
      if (!session?.user?.id) {
        logger.warn("VK ID link: no session");
        return NextResponse.redirect(new URL("/?error=session_required", baseOrigin));
      }

      const vkProfile = await exchangeVkCodeForProfile({
        code,
        codeVerifier: parsedCookie.codeVerifier,
        deviceId: device_id,
        state: returnedState,
        redirectUri,
        clientId,
      });
      const result = await linkVkToUser(session.user.id, vkProfile);

      const userForRedirect = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { username: true },
      });
      const usernameParam = (userForRedirect?.username ?? session.user.username ?? "")
        ? `username=${encodeURIComponent(userForRedirect?.username ?? session.user.username ?? "")}&`
        : "";

      if (!result.success) {
        logger.warn("VK ID link failed", { error: result.error, userId: session.user.id });
        return NextResponse.redirect(
          new URL(
            `/profile?${usernameParam}error=${encodeURIComponent(result.error)}`,
            baseOrigin,
          ),
        );
      }

      revalidatePath("/profile");
      logger.info("VK ID link success", { userId: session.user.id });
      return NextResponse.redirect(
        new URL(`/profile?${usernameParam}linked=vk`, baseOrigin),
      );
    }

    const result = await exchangeVkCodeAndGetUser({
      code,
      codeVerifier: parsedCookie.codeVerifier,
      deviceId: device_id,
      state: returnedState,
      redirectUri,
      clientId,
    });

    const { user, isNewUser } = result;
    const jwtToken = await storeVkIdOneTimeUser(crypto.randomUUID(), {
      userId: user.id,
      username: user.username,
      role: user.role,
    });

    logger.info("VK ID callback success", { userId: user.id, isNewUser });
    if (vkIdCallbackDebug) console.log("[VK ID callback] success, userId=", user.id, "isNewUser=", isNewUser);

    // Новые VK-пользователи — на страницу согласий перед входом
    const finalPath = isNewUser ? "/vk-consent" : returnPath;
    return NextResponse.redirect(
      new URL(`${finalPath}?vk_id_token=${encodeURIComponent(jwtToken)}`, baseOrigin),
    );
  } catch (error) {
    const err = error as Error;
    if (vkIdCallbackDebug) console.error("[VK ID callback] исключение:", err);
    logger.error("VK ID callback error", err);
    const msg = err.message ?? "";
    const errorParam =
      msg.includes("token exchange") || msg.includes("misconfigured")
        ? "vk_id_token_failed"
        : msg.includes("profile")
          ? "vk_id_profile_failed"
          : "vk_id_auth_failed";
    let redirectPath = parsedCookie.returnPath ?? "/";
    if (isLinkMode) {
      const session = await getServerSession(authOptions);
      redirectPath = profilePagePath(session?.user?.username);
    }
    const redirectUrl = new URL(redirectPath, baseOrigin);
    redirectUrl.searchParams.set("error", errorParam);
    return NextResponse.redirect(redirectUrl);
  }
}
