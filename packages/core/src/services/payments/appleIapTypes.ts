/** Цель покупки по маппингу productId → сущность в БД. */
export type AppleIapTarget =
  | { kind: "course"; courseId: string }
  | { kind: "article"; articleId: string };

export interface VerifyAndGrantAppleIapParams {
  userId: string;
  transactionJws: string;
  clientIp?: string | null;
  userAgent?: string | null;
}

export type AppleIapVerifyResult =
  | { success: true; alreadyGranted: boolean }
  | { success: false; error: string; code: string };
