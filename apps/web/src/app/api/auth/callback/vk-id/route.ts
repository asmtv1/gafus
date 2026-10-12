import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { revalidatePath } from "next/cache";

import { authOptions, storeVkIdOneTimeUser } from "@gafus/auth";
import { getServerSession } from "next-auth";
import {
  exchangeVkCodeAndGetUser,
  exchangeVkCodeForProfile,
  linkVkToUser,
  claimVkRegistrationContextUser,
  getValidVkRegistrationContext,
  getVkLinkedAccountUsername,
  REGISTRATION_CHANNEL,
} from "@gafus/core/services/auth";
import { createWebLogger } from "@gafus/logger";

import { profilePagePath } from "@shared/lib/profile/profilePagePath";
import { checkAuthRateLimit, getClientIp } from "@shared/lib/rateLimit";

const logger = createWebLogger("vk-id-callback");

const vkIdCallbackDebug =
  process.env.NODE_ENV === "development" ||
  process.env.VK_ID_DEBUG === "true" ||
  process.env.VK_ID_DEBUG === "1";

/**
 * OAuth redirects must never inherit the request Host/X-Forwarded-Host.  The
 * callback carries a one-time login grant, so a permissive proxy header here
 * would turn a proxy misconfiguration into an external redirect/token leak.
 */
function getConfiguredBaseOrigin(request: NextRequest): string {
  const configured = process.env.VK_WEB_REDIRECT_URI
    ? new URL(process.env.VK_WEB_REDIRECT_URI).origin
    : process.env.WEB_APP_URL ?? process.env.NEXT_PUBLIC_APP_URL;
  if (configured) return new URL(configured).origin;
  if (process.env.NODE_ENV === "production") return "https://gafus.ru";

  const origin = request.nextUrl.origin;
  const hostname = new URL(origin).hostname;
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname.endsWith(".ngrok-free.app")) {
    return origin;
  }
  return "http://localhost:3002";
}

export async function GET(request: NextRequest) {
  if (vkIdCallbackDebug) console.log("[VK ID callback] GET вызван, url:", request.url);

  const baseOrigin = getConfiguredBaseOrigin(request);

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
    codeVerifier?: string;
    contextToken?: string;
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

  const registrationContext = !isLinkMode && parsedCookie.contextToken
    ? await getValidVkRegistrationContext(parsedCookie.contextToken)
    : null;
  if (!isLinkMode && !registrationContext) {
    return NextResponse.redirect(new URL("/login?error=vk_context_expired", baseOrigin));
  }

  const clientId = process.env.VK_CLIENT_ID ?? "";
  let redirectUri =
    parsedCookie.redirectUri ??
    process.env.VK_WEB_REDIRECT_URI ??
    "";
  if (!redirectUri && process.env.NODE_ENV !== "production") {
    redirectUri = `${baseOrigin}/api/auth/callback/vk-id`;
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
        codeVerifier: parsedCookie.codeVerifier ?? "",
        deviceId: device_id,
        state: returnedState,
        redirectUri,
        clientId,
      });
      const result = await linkVkToUser(session.user.id, vkProfile);

      const linkedUsername = await getVkLinkedAccountUsername(session.user.id);
      const username = linkedUsername ?? session.user.username ?? "";
      const usernameParam = username ? `username=${encodeURIComponent(username)}&` : "";

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
      codeVerifier: registrationContext!.codeVerifier,
      deviceId: device_id,
      state: returnedState,
      redirectUri,
      clientId,
      registrationChannel: REGISTRATION_CHANNEL.WEB,
    });

    const { user, requiresConsent } = result;
    if (requiresConsent) {
      await claimVkRegistrationContextUser({
        contextToken: parsedCookie.contextToken!, state: returnedState, userId: user.id,
      });
      const finalUrl = new URL("/vk-consent", baseOrigin);
      finalUrl.searchParams.set("context", parsedCookie.contextToken!);
      const response = NextResponse.redirect(finalUrl);
      response.cookies.set("vk_registration_state", returnedState, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 300, path: "/" });
      return response;
    }
    const { isNewUser } = result;
    const vkToken = await storeVkIdOneTimeUser(crypto.randomUUID(), {
      userId: user.id,
      username: user.username,
      role: user.role,
    }, isNewUser);

    logger.info("VK ID callback success", { userId: user.id, isNewUser });
    if (vkIdCallbackDebug) console.log("[VK ID callback] success, userId=", user.id, "isNewUser=", isNewUser);

    // Новые VK-пользователи — на страницу согласий перед входом
    const finalPath = isNewUser ? "/vk-consent" : returnPath;
    const finalUrl = new URL(finalPath, baseOrigin);
    finalUrl.searchParams.set("vk_id_token", vkToken);
    return NextResponse.redirect(finalUrl);
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
