/** Public provider notifications ported from the retained Next handlers.
 * Run ONLY behind a trusted proxy that overwrites x-forwarded-for/x-real-ip.
 * Finance authority remains the verified provider read inside Core. */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { Hono } from "hono";
import {
  handleYookassaAppSubscriptionWebhook,
  handleAppleAppSubscriptionNotification,
} from "@gafus/core/services/appSubscription";

export const paymentProviderWebhooks = new Hono();
const allowedPrefixes = ["185.71.76.", "185.71.77.", "77.75.153.", "77.75.154.", "2a02:5180:"];
function isProviderIp(ip: string | null): boolean {
  if (!ip) return false;
  return allowedPrefixes.some(prefix => ip.startsWith(prefix)) ||
    ip === "77.75.156.11" || ip === "77.75.156.35";
}
function skipIpCheck(): boolean {
  return process.env.NODE_ENV !== "production" &&
    (process.env.YOOKASSA_SKIP_IP_CHECK === "1" ||
      process.env.YOOKASSA_SKIP_IP_CHECK === "true");
}
function validSignature(body: string, signature: string, secret: string): boolean {
  if (!/^[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = createHmac("sha256", secret).update(body).digest();
  const actual = Buffer.from(signature, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}
const s = (value: unknown): string | undefined => typeof value === "string" ? value : undefined;

paymentProviderWebhooks.post("/api/v1/payments/webhook", async c => {
  c.header("Cache-Control", "no-store");
  const forwarded = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || c.req.header("x-real-ip")?.trim() || null;
  if (!skipIpCheck() && !isProviderIp(ip)) return c.json({}, 403);
  const length = Number(c.req.header("content-length") ?? "0");
  if (length > 1_048_576) return c.json({}, 413);
  let raw: string;
  try { raw = await c.req.text(); } catch { return c.json({}, 400); }
  if (raw.length > 1_048_576) return c.json({}, 413);
  const signature = c.req.header("x-yookassa-signature")?.trim();
  if (signature && (!process.env.YOOKASSA_SECRET_KEY ||
    !validSignature(raw, signature, process.env.YOOKASSA_SECRET_KEY)))
    return c.json({}, 403);
  let body: Record<string, unknown> | null;
  try { body = record(JSON.parse(raw)); } catch { return c.json({}, 400); }
  if (!body) return c.json({}, 400);
  const obj = record(body.object);
  const event = s(body.event);
  const paymentMethodEvent = event?.startsWith("payment_method.") === true;
  const metadataRaw = record(obj?.metadata);
  const metadata = metadataRaw ? Object.fromEntries(
    Object.entries(metadataRaw).filter((entry): entry is [string, string] =>
      typeof entry[1] === "string"),
  ) : undefined;
  const refund = event === "refund.succeeded";
  const paymentId = s(refund ? obj?.payment_id : obj?.id);
  if (body.type !== "notification" || !paymentId) return c.json({}, 200);
  const kind = metadata?.kind;
  if (kind !== "app_subscription" && kind !== "app_subscription_payment_method" &&
      !paymentMethodEvent && !refund) return c.json({}, 200);
  const card = record(obj?.card);
  const method = record(obj?.payment_method);
  const methodCard = record(method?.card);
  const amount = record(obj?.amount);
  try {
    await handleYookassaAppSubscriptionWebhook({
      event: event ?? "unknown", yookassaPaymentId: paymentId,
      yookassaRefundId: refund ? s(obj?.id) : undefined,
      amount: s(amount?.value),
      paymentMethodId: paymentMethodEvent ? s(obj?.id) : s(method?.id),
      paymentMethodLast4: paymentMethodEvent ? s(card?.last4) : s(methodCard?.last4),
      paymentMethodTitle: paymentMethodEvent ? s(obj?.title) : s(method?.title),
      metadata, payloadHash: createHash("sha256").update(raw).digest("hex"),
      shopId: process.env.YOOKASSA_SHOP_ID,
      secretKey: process.env.YOOKASSA_SECRET_KEY,
    });
    return c.json({}, 200);
  } catch {
    // Never acknowledge failed financial state reconciliation.
    return c.json({}, 500);
  }
});

paymentProviderWebhooks.post("/api/v1/app-subscription/apple/notifications", async c => {
  c.header("Cache-Control", "no-store");
  const length = Number(c.req.header("content-length") ?? "0");
  if (length > 1_048_576) return c.json({}, 413);
  const body = await c.req.json().catch(() => null);
  const signedPayload = s(record(body)?.signedPayload);
  if (!signedPayload || signedPayload.length > 1_048_576) return c.json({}, 200);
  try {
    // Core verifies Apple's signed payload against its certificate chain.
    await handleAppleAppSubscriptionNotification({ signedPayload });
  } catch {
    // Matches the original Next Apple-notifications acknowledgment behavior.
  }
  return c.json({}, 200);
});
