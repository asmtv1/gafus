import { NextResponse } from "next/server";

/** Attribution is committed only by registration and checkout transactions. */
export async function POST() {
  return NextResponse.json({
    success: false,
    code: "DEPRECATED_PARTNER_ATTRIBUTION_FLOW",
    error: "Этот способ привязки партнёра больше не поддерживается",
  }, { status: 410 });
}
