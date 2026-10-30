import { parseUsernameAvailabilityData } from "@gafus/types";
import { ApiError, apiRequest } from "../../shared/api/client";
import {
  availablePlan, changePlan, honoAvailableAck, honoChangeAck, transportFailure,
  type AvailabilityDecision, type MutationDecision,
} from "./usernameContract";

/**
 * Current Hono GET envelope is unwrapped by apiRequest. No automatic retry.
 * A result is just a stale-sensitive hint; final uniqueness is POST/DB-owned.
 */
export async function getUsernameAvailability(
  candidate: string, actorId: string, requestSeq: number,
  currentActor: string = actorId, latestSeq: number = requestSeq,
): Promise<AvailabilityDecision> {
  const plan = availablePlan(candidate);
  if (!plan || !actorId || actorId !== currentActor || requestSeq !== latestSeq) {
    return { kind: "fail-closed", autoRetry: false };
  }
  try {
    const data = await apiRequest<unknown>(plan.path, {
      method: plan.method, browserAuth: true, credentials: "include",
    });
    return honoAvailableAck(200, { success: true, data: parseUsernameAvailabilityData(data) },
      actorId, currentActor, requestSeq, latestSeq);
  } catch {
    // No raw server errors, and no false available:true on 401/429/5xx.
    return { kind: "fail-closed", autoRetry: false };
  }
}

/**
 * Private cookie POST. Origin is supplied by the browser, never fabricated.
 * Current Hono success data.user is runtime validated against the actor.
 * HTTP400 is format OR collision until AG1 freezes specific error statuses.
 * A 5xx may be POST-COMMITTED (subsequent getAuthUserById failed).
 */
export async function changeUsername(
  candidate: string, actorId: string,
): Promise<MutationDecision> {
  const plan = changePlan(candidate);
  if (!plan || !actorId.trim()) return transportFailure();
  try {
    const data = await apiRequest<unknown>(plan.path, {
      method: plan.method, json: plan.json,
      browserAuth: true, credentials: "include",
    });
    return honoChangeAck(200, { success: true, data }, actorId);
  } catch (error) {
    // A non-JSON/malformed envelope (including the observed oversized 400)
    // is not a trusted validation/collision response. Never offer replay.
    if (error instanceof ApiError && error.code === "INVALID_RESPONSE") {
      return transportFailure();
    }
    return error instanceof ApiError
      ? honoChangeAck(error.status, null, actorId)
      : transportFailure();
  }
}
