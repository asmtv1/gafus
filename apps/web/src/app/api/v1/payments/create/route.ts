import { NextResponse } from "next/server";

/** Compatibility response for old clients; no individual purchases are possible. */
export function POST() {
  return NextResponse.json({
    success: false,
    error: "Разовые покупки больше недоступны. Оформите подписку.",
    code: "LEGACY_PURCHASES_DISABLED",
  }, { status: 410 });
}
