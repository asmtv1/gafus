import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

import { storeVkIdOneTimeUser } from "@gafus/auth";
import { findOrCreateVkUser } from "@gafus/core/services/auth";
import { createWebLogger } from "@gafus/logger";

import { checkAuthRateLimit, getClientIp } from "@shared/lib/rateLimit";

const logger = createWebLogger("vk-id-callback");

export async function GET(request: NextRequest) {
  const ip = getClientIp(request);
  if (!checkAuthRateLimit(ip, "vk-id-callback")) {
    return NextResponse.redirect(new URL("/login?error=rate_limit", request.url));
  }

  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const device_id = searchParams.get("device_id");
  const returnedState = searchParams.get("state");

  const cookieStore = await cookies();
  const cookieRaw = cookieStore.get("vk_id_state")?.value;

  cookieStore.delete("vk_id_state");

  if (!code || !device_id || !returnedState || !cookieRaw) {
    return NextResponse.redirect(new URL("/login?error=vk_id_auth_failed", request.url));
  }

  let parsedCookie: { state: string; codeVerifier: string };
  try {
    parsedCookie = JSON.parse(cookieRaw);
  } catch {
    return NextResponse.redirect(new URL("/login?error=vk_id_auth_failed", request.url));
  }

  const stateA = new Uint8Array(Buffer.from(returnedState, "utf8"));
  const stateB = new Uint8Array(Buffer.from(parsedCookie.state, "utf8"));
  if (
    stateA.length !== stateB.length ||
    !crypto.timingSafeEqual(stateA, stateB)
  ) {
    logger.warn("VK ID state mismatch", { ip });
    return NextResponse.redirect(new URL("/login?error=vk_id_auth_failed", request.url));
  }

  const clientId = process.env.VK_CLIENT_ID ?? "";
  const redirectUri = process.env.VK_WEB_REDIRECT_URI ?? "";

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
      error?: string;
      error_description?: string;
    };

    if (!tokenData.access_token) {
      logger.warn("VK ID token exchange failed", { error: tokenData.error });
      return NextResponse.redirect(new URL("/login?error=vk_id_token_failed", request.url));
    }

    const userRes = await fetch("https://id.vk.ru/oauth2/user_info", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        access_token: tokenData.access_token,
      }),
    });
    const userData = (await userRes.json()) as {
      user?: {
        user_id: string;
        first_name?: string;
        last_name?: string;
        avatar?: string;
      };
      error?: string;
    };

    if (!userData.user?.user_id) {
      logger.warn("VK ID user_info failed", { error: userData.error });
      return NextResponse.redirect(new URL("/login?error=vk_id_profile_failed", request.url));
    }

    const vkProfile = {
      id: String(userData.user.user_id),
      first_name: userData.user.first_name,
      last_name: userData.user.last_name,
      avatar: userData.user.avatar,
    };

    const { user } = await findOrCreateVkUser(vkProfile, vkProfile.id);

    const oneTimeToken = crypto.randomUUID();
    storeVkIdOneTimeUser(oneTimeToken, {
      userId: user.id,
      username: user.username,
      role: user.role,
    });

    logger.info("VK ID callback success", { userId: user.id });

    return NextResponse.redirect(
      new URL(`/login?vk_id_token=${encodeURIComponent(oneTimeToken)}`, request.url),
    );
  } catch (error) {
    logger.error("VK ID callback error", error as Error);
    return NextResponse.redirect(new URL("/login?error=vk_id_auth_failed", request.url));
  }
}
