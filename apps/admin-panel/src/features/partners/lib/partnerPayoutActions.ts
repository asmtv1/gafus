"use server";

import { markPartnerBalancePaidAdmin } from "@gafus/core/services/appSubscription";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "./getPartnersAdmin";

export async function markPartnerBalancePaid(partnerId: string) {
  const actorId = await requireAdmin();
  try {
    const result = await markPartnerBalancePaidAdmin({ actorId, partnerId });
    if (!result.success) return { success: false, error: result.error };

    revalidatePath("/main-panel/partners");
    revalidatePath(`/main-panel/partners/${partnerId}`);
    return { success: true, amountKopecks: result.amountKopecks };
  } catch {
    return { success: false, error: "Не удалось отметить выплату" };
  }
}
