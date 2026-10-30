/**
 * AG1-001: authenticated own-profile read application boundary.
 * Core owns DB lookup and DTO projection; application owns nullable outcome.
 * Only Hono owns HTTP auth, status, envelope, and cache headers.
 */
import type { getUserProfileForApi } from "@gafus/core/services/user";

export type ProfileReadPort = (
  actorUserId: string,
) => ReturnType<typeof getUserProfileForApi>;

export type ProfileReadResult =
  | { kind: "not_found" }
  | { kind: "found"; profile: NonNullable<Awaited<ReturnType<ProfileReadPort>>> };

export function createReadProfileApplication(
  dependencies: { loadProfile: ProfileReadPort },
) {
  return {
    async execute({ actorUserId }: { actorUserId: string }): Promise<ProfileReadResult> {
      const profile = await dependencies.loadProfile(actorUserId);
      return profile === null
        ? { kind: "not_found" }
        : { kind: "found", profile };
    },
  };
}
