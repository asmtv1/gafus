/** Ownerless persisted stepStore completion is not proof of this verified v2 occurrence. */
import type { LocalStepState } from "@/shared/stores/stepStore";
export function maskUnattestedCompletedStep(
  local: LocalStepState | null,
  hasVerifiedLocalCompletion: boolean,
  serverCompleted: boolean,
): LocalStepState | null {
  return local?.status === "COMPLETED" && !hasVerifiedLocalCompletion && !serverCompleted
    ? null
    : local;
}
