import { createRemoteJWKSet, jwtVerify } from "jose";
import { Hono, type Context } from "hono";
import { z } from "zod";

import { GooglePlayError, packageName } from "../../modules/app-subscription/google-play-client.js";
import { reconcileGooglePlayPurchases, syncGooglePlayPurchase } from "../../modules/app-subscription/google-play-service.js";

const googleKeys = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
const purchase = z.object({ purchaseToken: z.string().min(1).max(4096) });
const notification = z.object({
  packageName: z.literal(packageName),
  subscriptionNotification: purchase.optional(),
  voidedPurchaseNotification: purchase.extend({ productType: z.number() }).optional(),
});
const pubSubEnvelope = z.object({ message: z.object({ data: z.string().min(1).max(32768) }) });

async function authorized(c: Context, audience: string | undefined, email: string | undefined) {
  const auth = c.req.header("authorization");
  if (!audience || !email || !auth?.startsWith("Bearer ")) return false;
  try {
    const { payload } = await jwtVerify(auth.slice(7), googleKeys, {
      algorithms: ["RS256"],
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience,
      requiredClaims: ["iat", "exp", "sub", "email", "email_verified"],
    });
    return payload.email === email && payload.email_verified === true;
  } catch {
    return false;
  }
}

export const googlePlayNotifications = new Hono();

googlePlayNotifications.post("/rtdn", async (c) => {
  if (!await authorized(c, process.env.GOOGLE_PLAY_RTDN_AUDIENCE, process.env.GOOGLE_PLAY_RTDN_EMAIL))
    return c.body(null, 401);
  const envelope = pubSubEnvelope.safeParse(await c.req.json().catch(() => null));
  if (!envelope.success) return c.body(null, 204);
  const decoded = Buffer.from(envelope.data.message.data, "base64").toString("utf8");
  let raw: unknown;
  try { raw = JSON.parse(decoded); } catch { return c.body(null, 204); }
  const event = notification.safeParse(raw);
  if (!event.success) return c.body(null, 204);
  const voided = event.data.voidedPurchaseNotification;
  const token = event.data.subscriptionNotification?.purchaseToken ??
    (voided?.productType === 1 ? voided.purchaseToken : undefined);
  if (!token) return c.body(null, 204);
  try {
    await syncGooglePlayPurchase(token);
    return c.body(null, 204);
  } catch (error) {
    if (error instanceof GooglePlayError && ["TOKEN_INVALID", "OWNER_MISMATCH", "PLAN_INVALID"].includes(error.code))
      return c.body(null, 204);
    return c.body(null, 503);
  }
});

googlePlayNotifications.post("/reconcile", async (c) => {
  if (!await authorized(c, process.env.GOOGLE_PLAY_RECONCILE_AUDIENCE, process.env.GOOGLE_PLAY_RECONCILE_EMAIL))
    return c.body(null, 401);
  try {
    const result = await reconcileGooglePlayPurchases();
    return c.json(result, result.failed ? 503 : 200);
  } catch {
    return c.body(null, 503);
  }
});
