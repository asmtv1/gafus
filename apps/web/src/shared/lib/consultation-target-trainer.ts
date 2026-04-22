import type { AuthRole } from "@gafus/auth";
import { resolveTargetTrainerUserIdForStaff } from "@gafus/core";

export async function resolveTrainerUserIdFromSession(
  session: { user: { id: string; role: string } },
  trainerUserIdFromQuery: string | null,
): Promise<string> {
  return resolveTargetTrainerUserIdForStaff(
    { id: session.user.id, role: session.user.role as AuthRole },
    trainerUserIdFromQuery ?? undefined,
  );
}
