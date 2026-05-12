import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createWebLogger } from "@gafus/logger";
import { handleAppleAppSubscriptionNotification } from "@gafus/core/services/appSubscription";

const logger = createWebLogger("apple-app-subscription-notifications");

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();
    const signedPayload = typeof payload?.signedPayload === "string" ? payload.signedPayload : "";
    if (!signedPayload) {
      return NextResponse.json({}, { status: 200 });
    }
    await handleAppleAppSubscriptionNotification({ signedPayload });
    return NextResponse.json({}, { status: 200 });
  } catch (error) {
    logger.error("Apple notification handler failed", error as Error);
    return NextResponse.json({}, { status: 200 });
  }
}
