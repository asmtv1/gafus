/**
 * AG1-001 reference application boundary for existing PUT /user/profile.
 * Only dispatches the verified actor and route-normalized input to Core.
 * Core remains the sole owner of omitted-field/empty-string/upsert invariants.
 */
import type { updateUserProfile } from "@gafus/core/services/user";

export type ProfileUpdateInput = Parameters<typeof updateUserProfile>[1];
export type ProfileUpdatePort = (
  actorUserId: string,
  data: ProfileUpdateInput,
) => ReturnType<typeof updateUserProfile>;

export interface ProfileUpdateCommand {
  actorUserId: string;
  data: ProfileUpdateInput;
}

export function createUpdateProfileApplication(
  dependencies: { persist: ProfileUpdatePort },
) {
  return {
    execute({ actorUserId, data }: ProfileUpdateCommand) {
      return dependencies.persist(actorUserId, data);
    },
  };
}
