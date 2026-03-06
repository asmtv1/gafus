import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { revalidatePath } from "next/cache";

import { authOptions, storeVkIdOneTimeUser } from "@gafus/auth";
import { getServerSession } from "next-auth";
import { prisma } from "@gafus/prisma";
import { fetchVkProfile, findOrCreateVkUser, linkVkToUser } from "@gafus/core/services/auth";
import { createWebLogger } from "@gafus/logger";

import { checkAuthRateLimit, getClientIp } from "@shared/lib/rateLimit";

const logger = createWebLogger("vk-id-callback");

const vkIdCallbackDebug =
  process.env.NODE_ENV === "development" ||
  process.env.VK_ID_DEBUG === "true" ||
  process.env.VK_ID_DEBUG === "1";

export async function GET(request: NextRequest) {
  if (vkIdCallbackDebug) console.log("[VK ID callback] GET вызван, url:", request.url);

  const forwardedHost = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "";
  const baseOrigin = /ngrok/i.test(forwardedHost)
    ? `https://${forwardedHost}`
    : new URL(request.url).origin;

  const ip = getClientIp(request);
  if (!checkAuthRateLimit(ip, "vk-id-callback")) {
    if (vkIdCallbackDebug) console.warn("[VK ID callback] rate limit");
    return NextResponse.redirect(new URL("/login?error=rate_limit", baseOrigin));
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
    return NextResponse.redirect(new URL("/login?error=vk_id_auth_failed", baseOrigin));
  }

  let parsedCookie: { state: string; codeVerifier: string; returnPath?: string; mode?: string };
  try {
    parsedCookie = JSON.parse(cookieRaw);
  } catch {
    return NextResponse.redirect(new URL("/login?error=vk_id_auth_failed", baseOrigin));
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
  if (
    stateA.length !== stateB.length ||
    !crypto.timingSafeEqual(stateA, stateB)
  ) {
    if (vkIdCallbackDebug) console.warn("[VK ID callback] state mismatch");
    logger.warn("VK ID state mismatch", { ip });
    return NextResponse.redirect(new URL("/login?error=vk_id_auth_failed", baseOrigin));
  }

  const isLinkMode = parsedCookie.mode === "link";

  const clientId = process.env.VK_CLIENT_ID ?? "";
  let redirectUri = process.env.VK_WEB_REDIRECT_URI ?? "";
  if (/ngrok/i.test(forwardedHost)) {
    redirectUri = `${baseOrigin}/api/auth/callback/vk-id`;
  }
  if (vkIdCallbackDebug) console.log("[VK ID callback] state OK, redirectUri=", redirectUri, "обмениваем code на token...");

  try {
    const tokenRes = await fetch("https://id.vk.ru/oauth2/auth", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        code_verifier: parsedCookie.codeVerifier,
        redirect_uri: redirectUri,
        client_id: clientId,
        device_id,
        state: returnedState,
      }),
    });
    const tokenData = (await tokenRes.json()) as {
      access_token?: string;
      user_id?: string;
      error?: string;
      error_description?: string;
    };

    if (!tokenData.access_token) {
      if (vkIdCallbackDebug) {
        console.warn("[VK ID callback] token exchange failed:", tokenData.error, tokenData.error_description);
      }
      logger.warn("VK ID token exchange failed", { error: tokenData.error });
      return NextResponse.redirect(new URL("/login?error=vk_id_token_failed", baseOrigin));
    }

    let vkProfile;
    try {
      vkProfile = await fetchVkProfile({
        accessToken: tokenData.access_token,
        vkUserId: tokenData.user_id ?? "", // fallback: fetchVkProfile получит id из user_info
        clientId,
      });
    } catch (err) {
      logger.warn("VK ID profile fetch failed", { err });
      return NextResponse.redirect(new URL("/login?error=vk_id_profile_failed", baseOrigin));
    }

    if (isLinkMode) {
      const session = await getServerSession(authOptions);
      if (!session?.user?.id) {
        logger.warn("VK ID link: no session");
        return NextResponse.redirect(new URL("/login?error=session_required", baseOrigin));
      }

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

    const { user } = await findOrCreateVkUser(vkProfile, vkProfile.id);

    const oneTimeToken = crypto.randomUUID();
    storeVkIdOneTimeUser(oneTimeToken, {
      userId: user.id,
      username: user.username,
      role: user.role,
    });

    logger.info("VK ID callback success", { userId: user.id });
    if (vkIdCallbackDebug) console.log("[VK ID callback] success, userId=", user.id, "redirect на", returnPath, "?vk_id_token=...");

    return NextResponse.redirect(
      new URL(`${returnPath}?vk_id_token=${encodeURIComponent(oneTimeToken)}`, baseOrigin),
    );
  } catch (error) {
    if (vkIdCallbackDebug) console.error("[VK ID callback] исключение:", error);
    logger.error("VK ID callback error", error as Error);
    return NextResponse.redirect(new URL("/login?error=vk_id_auth_failed", baseOrigin));
  }
}
