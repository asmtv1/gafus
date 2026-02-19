"use server";

import { authOptions } from "@gafus/auth";
import { getVisibleDays as getVisibleDaysCore } from "@gafus/core/services/trainingDay";
import { getServerSession } from "next-auth";

export async function getVisibleDays() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return [];

  const userId = session.user.id;
  const role = session.user.role;
  const isAdminOrModerator = ["ADMIN", "MODERATOR"].includes(role);

  return getVisibleDaysCore(userId, isAdminOrModerator);
}
