/** The walk journal is available to every signed-in account. */
export function canUseDogWalkHistory(
  user: { id?: string | null } | null | undefined,
): boolean {
  return Boolean(user?.id);
}
