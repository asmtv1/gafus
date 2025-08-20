import { getCSRFTokenForClient } from "@gafus/csrf";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const token = await getCSRFTokenForClient();

    return NextResponse.json({ token });
  } catch (error) {
    console.error("Error generating CSRF token:", error);
    return NextResponse.json({ error: "Failed to generate CSRF token" }, { status: 500 });
  }
}
