import { NextResponse } from "next/server";
import { generateCSRFToken } from "@gafus/csrf/server";

export async function GET() {
  const csrfToken = await generateCSRFToken();
  return NextResponse.json({ token: csrfToken });
}
