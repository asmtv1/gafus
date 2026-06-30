import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import {
  ExcuseGeneratorError,
  generateExcuseForSituation,
} from "@/features/excuse-generator/server";
import { getClientIp } from "@shared/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_REQUESTS = 12;
const rateLimitStore = new Map<string, number[]>();

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  if (!checkExcuseRateLimit(ip)) {
    return NextResponse.json(
      {
        success: false,
        error: "Слишком много генераций. Попробуйте чуть позже.",
      },
      { status: 429, headers: { "Retry-After": "900" } },
    );
  }

  try {
    const body = (await request.json()) as { situationId?: unknown };
    const data = await generateExcuseForSituation(body.situationId);

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { success: false, error: "Некорректный JSON в запросе." },
        { status: 400 },
      );
    }

    if (error instanceof ExcuseGeneratorError) {
      return NextResponse.json(
        { success: false, error: getPublicErrorMessage(error) },
        { status: getStatusForError(error) },
      );
    }

    return NextResponse.json(
      { success: false, error: "Не удалось сгенерировать отмазку." },
      { status: 500 },
    );
  }
}

function checkExcuseRateLimit(ip: string): boolean {
  if (process.env.NODE_ENV === "development") return true;

  const now = Date.now();
  const cutoff = now - WINDOW_MS;
  const timestamps = (rateLimitStore.get(ip) ?? []).filter((timestamp) => timestamp > cutoff);

  if (timestamps.length >= MAX_REQUESTS) {
    rateLimitStore.set(ip, timestamps);
    return false;
  }

  timestamps.push(now);
  rateLimitStore.set(ip, timestamps);
  return true;
}

function getStatusForError(error: ExcuseGeneratorError): number {
  if (error.code === "VALIDATION_ERROR") return 400;
  if (error.code === "CONFIGURATION_ERROR") return 503;
  return 502;
}

function getPublicErrorMessage(error: ExcuseGeneratorError): string {
  if (error.code === "VALIDATION_ERROR") return "Выберите ситуацию из списка.";
  if (error.code === "CONFIGURATION_ERROR") return "Генератор временно не настроен.";
  return "OpenRouter сейчас не ответил. Попробуйте ещё раз.";
}
