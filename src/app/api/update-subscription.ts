import { savePushSubscription } from "@/lib/webpush/savePushSubscription";
import { NextResponse } from "next/server";

// app/subscription/route.ts
export async function POST(req: Request) {
  const { newSubscription } = await req.json();
  await savePushSubscription(newSubscription);
  return NextResponse.json({ success: true });
}
