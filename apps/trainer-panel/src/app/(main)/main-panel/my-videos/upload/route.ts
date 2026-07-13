import { NextResponse } from "next/server";
import { Readable } from "node:stream";

import { uploadTrainerVideoStreamAction } from "@features/trainer-videos/lib/uploadTrainerVideoAction";
import { MAX_TRAINER_VIDEO_SIZE_BYTES } from "@features/trainer-videos/lib/uploadLimits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 3600; // Большое видео может загружаться до часа при медленном соединении.

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length"));
  if (!Number.isSafeInteger(contentLength) || contentLength <= 0) {
    return NextResponse.json(
      { success: false, error: "Не указан размер загружаемого видео" },
      { status: 400 },
    );
  }

  if (contentLength > MAX_TRAINER_VIDEO_SIZE_BYTES) {
    return NextResponse.json(
      { success: false, error: "Размер видео не должен превышать 3 ГБ" },
      { status: 413 },
    );
  }

  const encodedName = request.headers.get("x-file-name");
  const mimeType = request.headers.get("content-type")?.split(";", 1)[0] || "";
  if (!encodedName || !request.body) {
    return NextResponse.json({ success: false, error: "Файл обязателен" }, { status: 400 });
  }

  try {
    const name = decodeURIComponent(encodedName);
    const result = await uploadTrainerVideoStreamAction({
      name,
      mimeType,
      size: contentLength,
      stream: Readable.fromWeb(request.body),
    });
    const status = result.status ?? (result.success ? 201 : 500);

    return NextResponse.json(result, { status });
  } catch {
    return NextResponse.json(
      { success: false, error: "Не удалось обработать загружаемый файл" },
      { status: 400 },
    );
  }
}
