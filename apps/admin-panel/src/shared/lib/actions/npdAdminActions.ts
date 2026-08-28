"use server";

import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import { authOptions } from "@gafus/auth";
import { adminRetryNpdReceiptOperation, adminQueueNpdReconciliation } from "@gafus/core/services/appSubscription";

async function adminOnly() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return { ok: false as const, status: 401, code: "UNAUTHENTICATED" };
  if (session.user.role !== "ADMIN") return { ok: false as const, status: 403, code: "FORBIDDEN" };
  return { ok: true as const };
}

export async function retryNpdReceiptAction(receiptId: string) {
  const auth = await adminOnly();
  if (!auth.ok) return auth;
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(receiptId)) return { ok: false as const, status: 400, code: "INVALID_ID" };
  const result = await adminRetryNpdReceiptOperation(receiptId);
  if (!result.ok) return { ...result, status: result.code === "RECONCILIATION_REQUIRED" ? 409 : 400 };
  revalidatePath("/main-panel/app-subscriptions");
  return { ok: true as const, status: 200 };
}

export async function reconcileNpdReceiptAction(receiptId: string) {
  const auth = await adminOnly();
  if (!auth.ok) return auth;
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(receiptId)) return { ok: false as const, status: 400, code: "INVALID_ID" };
  const result = await adminQueueNpdReconciliation(receiptId);
  if (!result.ok) return { ...result, status: 400 };
  revalidatePath("/main-panel/app-subscriptions");
  return { ok: true as const, status: 200 };
}
