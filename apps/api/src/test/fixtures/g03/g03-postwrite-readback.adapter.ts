/**
 * G03 test-only postwrite readback-loss adapter.
 * The actual Core auth implementation and actual Prisma read are used.
 * Only the final returned readback value may be one-shot nulled, AFTER
 * the underlying real DB SELECT confirmed the synthetic committed username.
 * No production code imports this file; exact-match Vitest alias only.
 */
import { getAuthUserById as realGetAuthUserById } from "../../../../../../packages/core/src/services/auth/index";
export * from "../../../../../../packages/core/src/services/auth/index";

type Fault = { actorId: string; username: string };
let armed: Fault | null = null;
let observed: Fault | null = null;

export function armG03PostwriteReadbackNull(actorId: string, committedUsername: string): void {
  if (process.env.AG1_G03_REALJWT_PG_REDIS !== "1") throw Error("G03_TEST_LEASE_OPTIN_REQUIRED");
  if (armed) throw Error("G03_READBACK_FAULT_ALREADY_ARMED");
  armed = { actorId, username: committedUsername };
  observed = null;
}

export function consumeG03PostwriteReadbackEvidence(): Fault | null {
  const value = observed;
  observed = null;
  return value;
}

export function clearG03PostwriteReadbackFault(): void {
  armed = null;
  observed = null;
}

export async function getAuthUserById(userId: string) {
  // IMPORTANT: actual Core GET and SQL read always execute first.
  const actual = await realGetAuthUserById(userId);
  const fault = armed;
  if (fault && actual && userId === fault.actorId && actual.username === fault.username) {
    armed = null;
    observed = { ...fault };
    return null; // simulate lost readback result AFTER real SQL commit and read
  }
  return actual;
}
