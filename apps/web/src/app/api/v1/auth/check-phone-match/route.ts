/**
 * Заглушка: не раскрываем привязку логин–телефон.
 * Всегда возвращаем { matches: true }.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function POST(_request: NextRequest) {
  return NextResponse.json({ success: true, data: { matches: true } });
}
