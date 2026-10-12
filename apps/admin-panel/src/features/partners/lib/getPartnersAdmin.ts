import { authOptions } from "@gafus/auth";
import {
  listPartnerAdminBalances,
  getPartnerAdminBalanceDetail,
} from "@gafus/core/services/appSubscription";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

/** Session/redirect remain in the adapter; role and balance queries live in core. */
async function requireAdmin(): Promise<string> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");
  if (session.user.role !== "ADMIN") redirect("/main-panel");
  return session.user.id;
}

export async function getPartnersAdmin() {
  const actorId = await requireAdmin();
  return listPartnerAdminBalances(actorId);
}

export async function getPartnerAdminDetail(id: string) {
  const actorId = await requireAdmin();
  return getPartnerAdminBalanceDetail(actorId, id);
}

export { requireAdmin };
