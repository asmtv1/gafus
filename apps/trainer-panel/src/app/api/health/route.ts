import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "trainer-panel",
    timestamp: new Date().toISOString(),
  });
}

