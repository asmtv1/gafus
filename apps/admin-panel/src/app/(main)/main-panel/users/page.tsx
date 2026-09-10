import UsersClient from "./UsersClient";
import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { redirect } from "next/navigation";
import { prisma } from "@gafus/prisma";

import { getAllUsers } from "@/features/users/lib/getAllUsers";

export default async function UsersPage() {
  const session = await getServerSession(authOptions);
  const role = session?.user?.role;
  if (!role || (role !== "ADMIN" && role !== "MODERATOR")) {
    redirect("/main-panel");
  }
  const users = await getAllUsers();
  const freePartnerPromoCodes = await prisma.appSubscriptionPromoCode.findMany({
    where: { isActive: true, archivedAt: null, partnerProfile: null },
    select: { id: true, code: true, discountPercent: true },
    orderBy: { code: "asc" },
  });

  return <UsersClient users={users} actorRole={role} freePartnerPromoCodes={freePartnerPromoCodes} />;
}
