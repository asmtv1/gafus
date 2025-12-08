import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * API endpoint для получения маппинга container_id -> container_name
 * Использует docker ps для получения актуального списка контейнеров
 * 
 * Работает только на сервере, где доступен Docker
 */
export async function GET() {
  try {
    // Получаем список контейнеров через docker ps
    // Используем формат: ID и Names разделены табуляцией
    const { stdout } = await execAsync("docker ps --format '{{.ID}}\t{{.Names}}' 2>/dev/null || echo ''");
    
    const mapping: Record<string, string> = {};
    const lines = stdout.trim().split("\n").filter((line) => line.trim());
    
    for (const line of lines) {
      const parts = line.split("\t");
      if (parts.length >= 2) {
        const id = parts[0]?.trim();
        const name = parts[1]?.trim();
        if (id && name) {
          // Кэшируем и полный ID, и короткий (первые 12 символов)
          mapping[id] = name;
          if (id.length >= 12) {
            mapping[id.substring(0, 12)] = name;
          }
        }
      }
    }
    
    return NextResponse.json({ mapping, count: Object.keys(mapping).length });
  } catch (error) {
    console.error("[container-logs/mapping] Error getting container mapping:", error);
    // Возвращаем пустой маппинг при ошибке
    return NextResponse.json({ mapping: {}, count: 0 });
  }
}

