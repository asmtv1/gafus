import { z } from "zod";

import { reportClientError } from "@/shared/lib/tracer";

/**
 * Тот же JSON, что APPLE_IAP_PRODUCT_MAP_JSON на сервере (через EXPO_PUBLIC_*).
 * Нужен, чтобы по courseId/articleId получить SKU для StoreKit.
 */
const entrySchema = z
  .object({
    productId: z.string().min(1),
    courseId: z.string().min(1).optional(),
    articleId: z.string().min(1).optional(),
  })
  .superRefine((data, ctx) => {
    const c = data.courseId != null && data.courseId !== "";
    const a = data.articleId != null && data.articleId !== "";
    if (c === a) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "course xor article",
      });
    }
  });

const mapSchema = z.array(entrySchema);

function loadReverseMaps(): {
  courseToProduct: Map<string, string>;
  articleToProduct: Map<string, string>;
} | null {
  const raw = process.env.EXPO_PUBLIC_APPLE_IAP_PRODUCT_MAP_JSON;
  if (raw == null || raw.trim() === "") {
    return null;
  }
  try {
    const rows = mapSchema.parse(JSON.parse(raw) as unknown);
    const courseToProduct = new Map<string, string>();
    const articleToProduct = new Map<string, string>();
    for (const row of rows) {
      if (row.courseId) {
        courseToProduct.set(row.courseId, row.productId);
      }
      if (row.articleId) {
        articleToProduct.set(row.articleId, row.productId);
      }
    }
    return { courseToProduct, articleToProduct };
  } catch (e) {
    reportClientError(e, { issueKey: "apple-iap-client-map" });
    return null;
  }
}

export function getAppleProductIdForCourseId(courseId: string): string | null {
  return loadReverseMaps()?.courseToProduct.get(courseId) ?? null;
}

export function getAppleProductIdForArticleId(articleId: string): string | null {
  return loadReverseMaps()?.articleToProduct.get(articleId) ?? null;
}
