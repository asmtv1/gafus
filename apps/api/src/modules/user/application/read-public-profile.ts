/** Anonymous public profile lookup; Hono owns its explicit response whitelist. */
import type { getPublicProfile } from "@gafus/core/services/user";

export function createReadPublicProfileApplication(dependencies: {
  loadPublicProfile: typeof getPublicProfile;
}) {
  return {
    execute(username: string): ReturnType<typeof getPublicProfile> {
      return dependencies.loadPublicProfile(username);
    },
  };
}
