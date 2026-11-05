/** Temporary rollout: two named accounts only, not every user with ADMIN role. */
export function canUseDogWalkHistory(
  user:
    | {
        username?: string | null;
        role?: string | null;
      }
    | null
    | undefined,
): boolean {
  return Boolean(user && ["asmtv1", "admin"].includes(user.username?.trim().toLowerCase() ?? ""));
}
