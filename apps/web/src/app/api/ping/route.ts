import { NextResponse } from "next/server";

export async function GET() {
  try {
    // Простой ping ответ
    return NextResponse.json({
      status: "ok",
      timestamp: Date.now(),
      message: "pong",
    });
  } catch (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
