import { receiveResendWebhook } from "@gafus/mailer";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  return receiveResendWebhook(request);
}
