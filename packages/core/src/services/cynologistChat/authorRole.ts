import type { ChatDisplayRole } from "@gafus/consultation-shared";

/** Pure business role policy; the composition caller supplies the paid-status port.
 * Never infer paid entitlement from a token role or trial.
 */
export type PaidChatEntitlementRead = (userId: string, at: Date) => Promise<boolean>;
export async function getChatDisplayRole(
  user: { id: string; role: string },
  readPaid: PaidChatEntitlementRead,
  now = new Date(),
): Promise<ChatDisplayRole | null> {
  if (user.role === "ADMIN") return "admin";
  if (user.role === "TRAINER") return "trainer";
  return (await readPaid(user.id, now)) ? "subscriber" : null;
}
