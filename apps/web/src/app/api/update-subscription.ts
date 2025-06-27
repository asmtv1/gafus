import { saveSubscription } from "@/utils/push";
import { NextResponse } from "next/server";

// app/subscription/route.ts
export async function POST(req: Request) {
  const { newSubscription } = await req.json();
  await saveSubscription(newSubscription);
  return NextResponse.json({ success: true });
}
