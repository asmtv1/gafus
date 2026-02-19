"use server";

import { authOptions } from "@gafus/auth";
import { getVisibleSteps as getVisibleStepsCore } from "@gafus/core/services/trainerStep";
import { getServerSession } from "next-auth";

import type { AuthUser } from "@gafus/types";

export async function getVisibleSteps() {
  const session = await getServerSession(authOptions);
  const user = session?.user as AuthUser;

  if (!user) {
    throw new Error("Unauthorized: No session or user found.");
  }

  const { id: userId, role } = user;
  const isAdminOrModerator = ["ADMIN", "MODERATOR"].includes(role);

  return getVisibleStepsCore(userId, isAdminOrModerator);
}
