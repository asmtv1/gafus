/** Pure actor-scoped room read permission; never substitutes database lookup.
 * DIRECT block checks, specialist identity and COURSE entitlements are separate
 * persisted gates and must all still run before issuing a subscription JWT.
 */
export function chat2MemberCanRead<T extends {
  role: string;
  hiddenAt?: Date | null;
  conversation: { kind: string };
}>(member: T | null | undefined): member is T {
  if (!member || member.role === "BANNED") return false;
  if (member.conversation.kind === "COMMUNITY" && member.hiddenAt != null) return false;
  return true;
}
