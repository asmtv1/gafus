import UsersClient from "./UsersClient";
import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { redirect } from "next/navigation";
import { getFreePartnerPromoCodesForAdminPanel } from "@gafus/core/services/appSubscription";

import { getAllUsers } from "@/features/users/lib/getAllUsers";

export default async function UsersPage() {
  const session = await getServerSession(authOptions);
  const role = session?.user?.role;
  if (!role || (role !== "ADMIN" && role !== "MODERATOR")) {
    redirect("/main-panel");
  }
  const users = await getAllUsers();
  const freePartnerPromoCodes = await getFreePartnerPromoCodesForAdminPanel(session.user.id);

  return <UsersClient users={users} actorRole={role} freePartnerPromoCodes={freePartnerPromoCodes} />;
}
