import { importPKCS8, SignJWT } from "jose";
import { z } from "zod";

export const packageName = "ru.gafus.app";
const tokenEndpoint = "https://oauth2.googleapis.com/token";
const publisherScope = "https://www.googleapis.com/auth/androidpublisher";

const plansSchema = z.array(z.object({
  productId: z.string().regex(/^[a-z0-9_.]{1,200}$/),
  basePlanId: z.string().regex(/^[a-z0-9-]{1,63}$/),
  planCode: z.enum(["TWO_WEEKS", "MONTHLY", "THREE_MONTHS"]),
})).min(1).max(20).refine((plans) =>
  new Set(plans.map((plan) => plan.productId + ":" + plan.basePlanId)).size === plans.length);

export function googlePlayPlans() {
  const raw = process.env.GOOGLE_PLAY_SUBSCRIPTION_PLANS;
  return raw ? plansSchema.parse(JSON.parse(raw)) : [];
}

const subscriptionSchema = z.object({
  subscriptionState: z.enum([
    "SUBSCRIPTION_STATE_PENDING", "SUBSCRIPTION_STATE_ACTIVE",
    "SUBSCRIPTION_STATE_IN_GRACE_PERIOD", "SUBSCRIPTION_STATE_CANCELED",
    "SUBSCRIPTION_STATE_ON_HOLD", "SUBSCRIPTION_STATE_PAUSED",
    "SUBSCRIPTION_STATE_EXPIRED", "SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED",
  ]),
  acknowledgementState: z.enum(["ACKNOWLEDGEMENT_STATE_PENDING", "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED"]).optional(),
  externalAccountIdentifiers: z.object({ obfuscatedExternalAccountId: z.string().optional() }).optional(),
  linkedPurchaseToken: z.string().optional(),
  startTime: z.string().datetime({ offset: true }).optional(),
  testPurchase: z.object({}).optional(),
  lineItems: z.array(z.object({
    productId: z.string(),
    expiryTime: z.string().datetime({ offset: true }).optional(),
    offerDetails: z.object({ basePlanId: z.string().optional() }).optional(),
    autoRenewingPlan: z.object({ autoRenewEnabled: z.boolean().optional() }).optional(),
  })).default([]),
});

export class GooglePlayError extends Error {
  constructor(readonly code: "UNAVAILABLE" | "TOKEN_INVALID" | "OWNER_MISMATCH" | "PLAN_INVALID") {
    super(code);
  }
}

let cachedToken: { value: string; validUntil: number } | undefined;
let tokenRequest: Promise<string> | undefined;

export function googlePlayConfigured() {
  return Boolean(process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL &&
    process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_PRIVATE_KEY &&
    googlePlayPlans().length);
}

async function issueToken() {
  const email = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL;
  const key = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_PRIVATE_KEY;
  if (!email || !key) throw new GooglePlayError("UNAVAILABLE");
  const assertion = await new SignJWT({ scope: publisherScope })
    .setProtectedHeader({ alg: "RS256" })
    .setIssuer(email)
    .setAudience(tokenEndpoint)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(await importPKCS8(key.replace(/\\n/g, "\n"), "RS256"));
  const response = await fetch(tokenEndpoint, {
    method: "POST",
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new GooglePlayError("UNAVAILABLE");
  const token = z.object({ access_token: z.string().min(1), expires_in: z.number() }).parse(await response.json());
  cachedToken = { value: token.access_token, validUntil: Date.now() + (token.expires_in - 60) * 1000 };
  return cachedToken.value;
}

async function publisherRequest(path: string, method: "GET" | "POST") {
  if (!cachedToken || cachedToken.validUntil <= Date.now()) {
    tokenRequest ??= issueToken().finally(() => { tokenRequest = undefined; });
    await tokenRequest;
  }
  const response = await fetch(
    "https://androidpublisher.googleapis.com/androidpublisher/v3/applications/" + packageName + "/purchases/" + path,
    {
      method,
      headers: { Authorization: "Bearer " + cachedToken?.value, "Content-Type": "application/json" },
      ...(method === "POST" ? { body: "{}" } : {}),
      signal: AbortSignal.timeout(5000),
    },
  );
  if (response.status === 401) cachedToken = undefined;
  return response;
}

export async function readGoogleSubscription(token: string) {
  const response = await publisherRequest("subscriptionsv2/tokens/" + encodeURIComponent(token), "GET");
  // Google only retains expired tokens for a limited time.
  if (response.status === 404 || response.status === 410) return null;
  if (!response.ok) throw new GooglePlayError("UNAVAILABLE");
  return subscriptionSchema.parse(await response.json());
}

export async function acknowledgeGoogleSubscription(productId: string, token: string) {
  const response = await publisherRequest(
    "subscriptions/" + encodeURIComponent(productId) + "/tokens/" + encodeURIComponent(token) + ":acknowledge",
    "POST",
  );
  if (!response.ok) throw new GooglePlayError("UNAVAILABLE");
}
