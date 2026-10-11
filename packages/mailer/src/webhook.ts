import { Webhook } from "svix";
import { prisma } from "@gafus/prisma";

/** Verify the unmodified request body before parsing or persisting any provider event. */
export async function receiveResendWebhook(request: Request): Promise<Response> {
  const secret = process.env.RESEND_WEBHOOK_SECRET?.trim();
  if (!secret) return new Response("Webhook not configured", { status: 503 });
  if (Number(request.headers.get("content-length")) > 262144) {
    return new Response("Payload too large", { status: 413 });
  }
  const payload = await request.text();
  if (Buffer.byteLength(payload) > 262144) return new Response("Payload too large", { status: 413 });
  const id = request.headers.get("svix-id") || "";
  let event: { type?: unknown; created_at?: unknown; data?: { email_id?: unknown; bounce?: { type?: unknown; subType?: unknown } } };
  try {
    event = new Webhook(secret).verify(payload, {
      "svix-id": id,
      "svix-timestamp": request.headers.get("svix-timestamp") || "",
      "svix-signature": request.headers.get("svix-signature") || "",
    }) as typeof event;
    if (!event || typeof event !== "object") throw new Error("Invalid event");
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }
  if (typeof event.type !== "string" || !event.type.startsWith("email.")) {
    return new Response("Ignored", { status: 200 });
  }
  if (typeof event.data?.email_id !== "string" || typeof event.created_at !== "string" ||
      !Number.isFinite(Date.parse(event.created_at))) {
    return new Response("Invalid event", { status: 400 });
  }
  try {
    // Append-only upsert handles duplicate delivery and events arriving before API acceptance.
    // No body, subject, recipients or reset links are stored from the webhook payload.
    await prisma.transactionalMailEvent.upsert({
      where: { id },
      create: {
        id,
        providerMessageId: event.data.email_id,
        type: event.type,
        occurredAt: new Date(event.created_at),
        errorCode: [event.data.bounce?.type, event.data.bounce?.subType]
          .filter((value): value is string => typeof value === "string")
          .join("/").replace(/[^a-zA-Z0-9_/-]/g, "").slice(0, 160) || null,
      },
      update: {},
    });
  } catch {
    return new Response("Persistence unavailable", { status: 503 });
  }
  return new Response("OK", { status: 200 });
}
