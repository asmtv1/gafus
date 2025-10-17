import { NextResponse } from "next/server";
import { generateCSRFToken } from "@gafus/csrf";

export async function GET() {
  const csrfToken = generateCSRFToken();
  return NextResponse.json({ csrfToken });
}

