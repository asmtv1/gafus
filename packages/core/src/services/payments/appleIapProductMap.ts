import { z } from "zod";

import { createWebLogger } from "@gafus/logger";

import type { AppleIapTarget } from "./appleIapTypes";

const logger = createWebLogger("apple-iap-product-map");

const entrySchema = z
  .object({
    productId: z.string().min(1),
    courseId: z.string().min(1).optional(),
    articleId: z.string().min(1).optional(),
  })
  .superRefine((data, ctx) => {
    const hasCourse = data.courseId != null && data.courseId !== "";
    const hasArticle = data.articleId != null && data.articleId !== "";
    if (hasCourse === hasArticle) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Нужен ровно один из courseId или articleId",
      });
    }
  });

const mapSchema = z.array(entrySchema);

let cachedMap: Map<string, AppleIapTarget> | null = null;
let parseFailed = false;

function loadMapFromEnv(): Map<string, AppleIapTarget> | null {
  if (parseFailed) {
    return null;
  }
  if (cachedMap) {
    return cachedMap;
  }
  const raw = process.env.APPLE_IAP_PRODUCT_MAP_JSON;
  if (raw == null || raw.trim() === "") {
    logger.error(
      "APPLE_IAP_PRODUCT_MAP_JSON не задан",
      new Error("Missing APPLE_IAP_PRODUCT_MAP_JSON"),
    );
    parseFailed = true;
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    const rows = mapSchema.parse(parsed);
    const m = new Map<string, AppleIapTarget>();
    for (const row of rows) {
      if (row.courseId) {
        m.set(row.productId, { kind: "course", courseId: row.courseId });
      } else if (row.articleId) {
        m.set(row.productId, { kind: "article", articleId: row.articleId });
      }
    }
    cachedMap = m;
    return cachedMap;
  } catch (error) {
    logger.error(
      "Некорректный APPLE_IAP_PRODUCT_MAP_JSON",
      error instanceof Error ? error : new Error(String(error)),
    );
    parseFailed = true;
    return null;
  }
}

/** Целевой курс или статья по Apple productId; null если продукт не в мапе или конфиг битый. */
export function getAppleIapTarget(productId: string): AppleIapTarget | null {
  return loadMapFromEnv()?.get(productId) ?? null;
}

/** Список productId из мапы (для тестов). */
export function listAppleIapProductIds(): string[] {
  const m = loadMapFromEnv();
  if (!m) {
    return [];
  }
  return [...m.keys()];
}
