/** Independent Web VK ID PKCE flow for GAFUS Refactor.
 * External VK and redirect URI configuration are mandatory; never fall back
 * to the existing GAFUS Main callback or return bearer tokens to browser JS.
 */
import crypto from "node:crypto";
import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { bodyLimit } from "hono/body-limit";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod/v3";
import {
  assertCompletedUser, generateAccessToken, generateRefreshToken,
} from "@gafus/auth/jwt";
import {
  claimVkRegistrationContextUser, completeVkRegistration,
  consumeVkIdOneTimeUser, createRefreshSession, createVkLoginGrantToken,
  createVkRegistrationContextWithPromo, exchangeVkCodeAndGetUser,
  getValidVkRegistrationContext, getVkConsentContextSummary,
  REGISTRATION_CHANNEL, VK_ID_OAUTH_SCOPE,
} from "@gafus/core/services/auth";
import { createWebLogger } from "@gafus/logger";
import { isBrowserCookieMode, isTrustedBrowserOrigin, setBrowserSession } from "../../lib/browser-auth.js";

const logger = createWebLogger("web-vk-id");
const NONCE_COOKIE = "__Host-gafus_vk_nonce";
const CONSENT_COOKIE = "__Host-gafus_vk_consent";
const FIVE_MINUTES = 5 * 60;
const SESSION_AGE = 30 * 24 * 60 * 60 * 1000;
const cookieOptions = { httpOnly: true, secure: true, sameSite: "Lax" as const, path: "/" };
const stateSchema = z.object({
  state: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  contextToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  issuedAt: z.number().int(),
});
const startSchema = z.object({
  promoCode: z.string().trim().min(1).max(64).optional(),
}).strict();
const consentSchema = z.object({
  tempSessionId: z.string().uuid(),
  consentPayload: z.object({
    acceptPersonalData: z.literal(true),
    acceptPrivacyPolicy: z.literal(true),
    acceptDataDistribution: z.literal(true),
  }).strict(),
  promoCode: z.string().trim().min(1).max(64).optional(),
}).strict();

/** Cryptographic integrity and age prevent forged/cross-session OAuth cookies.
 * Reuse the existing refresh-token server secret with domain separation when
 * a dedicated VK secret has not been provisioned. Neither reaches the client.
 */
function signingSecret(): string {
  const secret = process.env.VK_WEB_COOKIE_SECRET || process.env.JWT_REFRESH_SECRET;
  if (!secret || secret.length < 32) throw new Error("WEB_VK_COOKIE_SECRET_UNCONFIGURED");
  return secret;
}
function encodeState(input: z.infer<typeof stateSchema>): string {
  const body = Buffer.from(JSON.stringify(input)).toString("base64url");
  const mac = crypto.createHmac("sha256", signingSecret())
    .update("gafus-refactor-web-vk-v1:" + body).digest("base64url");
  return body + "." + mac;
}
function decodeState(input: string | undefined): z.infer<typeof stateSchema> | null {
  if (!input || input.length > 1024 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(input)) return null;
  try {
    const [body, received] = input.split(".");
    const mac = crypto.createHmac("sha256", signingSecret())
      .update("gafus-refactor-web-vk-v1:" + body).digest("base64url");
    if (received.length !== mac.length || !crypto.timingSafeEqual(Buffer.from(received), Buffer.from(mac))) return null;
    const parsed = stateSchema.safeParse(JSON.parse(Buffer.from(body, "base64url").toString("utf8")));
    if (!parsed.success) return null;
    const elapsed = Date.now() - parsed.data.issuedAt;
    return elapsed >= 0 && elapsed <= FIVE_MINUTES * 1000 ? parsed.data : null;
  } catch { return null; }
}
function configuration(): { clientId: string; redirectUri: string; webOrigin: string } {
  // Fail closed on missing configuration. Especially do not generate links to
  // the production GAFUS Main site from an isolated Refactor environment.
  const web = process.env.WEB_APP_URL;
  const redirect = process.env.VK_WEB_REDIRECT_URI;
  const clientId = process.env.VK_CLIENT_ID;
  if (!web || !redirect || !clientId || !/^\d{1,32}$/.test(clientId)) {
    throw new Error("WEB_VK_CONFIG_UNAVAILABLE");
  }
  const origin = new URL(web);
  const target = new URL(redirect);
  const isIsolatedLoopback = process.env.GAFUS_LOCAL_ISOLATED_API === "1" &&
    process.env.NODE_ENV === "development" &&
    origin.origin === "http://127.0.0.1:5173";
  if ((origin.protocol !== "https:" && !isIsolatedLoopback) ||
      origin.pathname !== "/" || origin.search || origin.hash || origin.username || origin.password ||
      target.origin !== origin.origin || target.pathname !== "/api/v1/auth/vk-web/callback" ||
      target.search || target.hash || target.username || target.password) {
    throw new Error("WEB_VK_REDIRECT_URI_INVALID");
  }
  return { clientId, redirectUri: target.href, webOrigin: origin.origin };
}
function randomToken() { return crypto.randomBytes(32).toString("base64url"); }
function clearCookie(c: Parameters<typeof deleteCookie>[0], key: string): void {
  deleteCookie(c, key, cookieOptions);
}
function safeHeaders(c: {header: (name: string, value: string) => void}): void {
  c.header("Cache-Control", "private, no-store");
  c.header("Referrer-Policy", "no-referrer");
}
function verifyOrigin(c: Parameters<typeof isBrowserCookieMode>[0]): boolean {
  return isBrowserCookieMode(c) && isTrustedBrowserOrigin(c);
}
async function issueBrowserSession(c: Parameters<typeof setBrowserSession>[0], user: {
  id: string; username: string; role: string;
}): Promise<void> {
  await assertCompletedUser(user.id);
  const sid = crypto.randomUUID();
  const authUser = { id: user.id, username: user.username,
    role: user.role as "USER" | "PARTNER" | "ADMIN" | "MODERATOR" | "TRAINER" };
  const access = await generateAccessToken(authUser, sid);
  const refresh = await generateRefreshToken(user.id, sid);
  await createRefreshSession(user.id, sid, crypto.createHash("sha256").update(refresh).digest("hex"), {
    expiresAt: new Date(Date.now() + SESSION_AGE),
  });
  setBrowserSession(c, access, refresh);
}

export const webVkRoutes = new Hono();
webVkRoutes.use("*", async (c, next) => { safeHeaders(c); await next(); });

webVkRoutes.post("/start", bodyLimit({ maxSize: 1024 }), zValidator("json", startSchema), async c => {
  if (!verifyOrigin(c)) return c.json({ success: false, error: "Недоверенный Origin" }, 403);
  try {
    const config = configuration();
    const codeVerifier = randomToken();
    const contextToken = randomToken();
    const state = randomToken();
    const { promoCode } = c.req.valid("json");
    await createVkRegistrationContextWithPromo({ contextToken, state, codeVerifier, promoCode });
    setCookie(c, NONCE_COOKIE, encodeState({ state, contextToken, issuedAt: Date.now() }), {
      ...cookieOptions, maxAge: FIVE_MINUTES,
    });
    const challenge = crypto.createHash("sha256").update(codeVerifier).digest("base64url");
    const url = new URL("https://id.vk.ru/authorize");
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", config.clientId);
    url.searchParams.set("redirect_uri", config.redirectUri);
    url.searchParams.set("state", state);
    url.searchParams.set("code_challenge", challenge);
    url.searchParams.set("code_challenge_method", "S256");
    url.searchParams.set("scope", VK_ID_OAUTH_SCOPE);
    url.searchParams.set("lang_id", "0");
    url.searchParams.set("fastAuthEnabled", "1");
    return c.json({ success: true, data: { authorizeUrl: url.toString() } });
  } catch {
    logger.error("VK ID start unavailable", new Error("WEB_VK_START_UNAVAILABLE"));
    return c.json({ success: false, code: "VK_WEB_UNAVAILABLE", error: "Вход через VK временно недоступен" }, 503);
  }
});

webVkRoutes.get("/callback", async c => {
  let webOrigin: string;
  try { webOrigin = configuration().webOrigin; } catch {
    return c.json({ success: false, code: "VK_WEB_UNAVAILABLE" }, 503);
  }
  const failure = (code: string) => c.redirect(`${webOrigin}/login?error=${code}`, 302);
  const receipt = decodeState(getCookie(c, NONCE_COOKIE));
  clearCookie(c, NONCE_COOKIE); // consume OAuth nonce even on error
  const { code, state, device_id: deviceId } = c.req.query();
  if (!receipt || !code || !deviceId || !state || code.length > 512 || deviceId.length > 256 ||
      state.length !== receipt.state.length ||
      !crypto.timingSafeEqual(Buffer.from(state), Buffer.from(receipt.state))) return failure("vk_id_auth_failed");
  try {
    const config = configuration();
    const record = await getValidVkRegistrationContext(receipt.contextToken);
    if (!record) return failure("vk_context_expired");
    const result = await exchangeVkCodeAndGetUser({
      code, codeVerifier: record.codeVerifier, deviceId, state,
      redirectUri: config.redirectUri, clientId: config.clientId,
      registrationChannel: REGISTRATION_CHANNEL.WEB,
    });
    if (result.requiresConsent) {
      await claimVkRegistrationContextUser({
        contextToken: receipt.contextToken, state, userId: result.user.id,
      });
      setCookie(c, CONSENT_COOKIE, encodeState({
        contextToken: receipt.contextToken, state, issuedAt: Date.now(),
      }), { ...cookieOptions, maxAge: FIVE_MINUTES });
      return c.redirect(`${webOrigin}/vk-consent`, 302);
    }
    await issueBrowserSession(c, result.user);
    return c.redirect(`${webOrigin}/courses`, 302);
  } catch {
    logger.error("VK ID callback unavailable", new Error("WEB_VK_CALLBACK_UNAVAILABLE"));
    return failure("vk_id_auth_failed");
  }
});

webVkRoutes.get("/consent", async c => {
  const receipt = decodeState(getCookie(c, CONSENT_COOKIE));
  if (!receipt) return c.json({ success: false, code: "VK_CONTEXT_EXPIRED" }, 401);
  try {
    const context = await getVkConsentContextSummary(receipt.contextToken, receipt.state);
    if (!context || context.completedAt) return c.json({ success: false, code: "VK_CONTEXT_EXPIRED" }, 401);
    return c.json({ success: true, data: { selectedPromoCode: context.selectedPromoCodeValue } });
  } catch {
    return c.json({ success: false, code: "VK_CONSENT_UNAVAILABLE" }, 503);
  }
});

webVkRoutes.post("/consent", bodyLimit({ maxSize: 2048 }), zValidator("json", consentSchema), async c => {
  if (!verifyOrigin(c)) return c.json({ success: false, error: "Недоверенный Origin" }, 403);
  const receipt = decodeState(getCookie(c, CONSENT_COOKIE));
  if (!receipt) return c.json({ success: false, code: "VK_CONTEXT_EXPIRED" }, 401);
  const { tempSessionId, consentPayload, promoCode } = c.req.valid("json");
  try {
    const result = await completeVkRegistration({
      contextToken: receipt.contextToken, state: receipt.state,
      transport: "WEB", loginGrantToken: createVkLoginGrantToken(), promoCode,
      consent: {
        tempSessionId, consentPayload,
        formData: { name: "VK ID" },
        ipAddress: c.req.header("x-real-ip"),
        userAgent: c.req.header("user-agent"),
        defaultVersion: process.env.CONSENT_VERSION ?? "v1.4 2026-08-13",
      },
    });
    if (!result.loginGrantToken) return c.json({ success: false, code: "VK_CONSENT_UNAVAILABLE" }, 503);
    const user = await consumeVkIdOneTimeUser(result.loginGrantToken);
    if (!user) return c.json({ success: false, code: "VK_CONSENT_UNAVAILABLE" }, 503);
    await issueBrowserSession(c, { id: user.userId, username: user.username, role: user.role });
    clearCookie(c, CONSENT_COOKIE);
    return c.json({ success: true, data: { user: { id: user.userId, username: user.username, role: user.role } } });
  } catch {
    logger.error("VK consent unavailable", new Error("WEB_VK_CONSENT_UNAVAILABLE"));
    return c.json({ success: false, code: "VK_CONSENT_UNAVAILABLE", error: "Не удалось завершить регистрацию через VK" }, 503);
  }
});
