import { NextResponse } from "next/server";

import { uploadTrainerVideoAction } from "@features/trainer-videos/lib/uploadTrainerVideoAction";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 минут для загрузки больших видео

export async function POST(request: Request) {
  const formData = await request.formData();
  const result = await uploadTrainerVideoAction(formData);
  const status = result.status ?? (result.success ? 201 : 500);

  return NextResponse.json(result, { status });
}

