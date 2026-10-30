/** Ephemeral server-confirmed UI status; not a durable offline receipt or persisted state. */
import { useCallback, useState } from "react";

type Snapshot = {
  profile: object;
  epoch: string | null;
  scope: string;
  steps: ReadonlySet<number>;
};
export function useVerifiedOnlineCompletion(
  profile: object | null,
  epoch: string | null,
  scope: string,
) {
  const [receipt, setReceipt] = useState<Snapshot | null>(null);
  const markConfirmed = useCallback(
    (stepIndex: number) => {
      if (!profile || !Number.isSafeInteger(stepIndex) || stepIndex < 0) return;
      setReceipt((prior) => {
        const steps =
          prior?.profile === profile && prior.epoch === epoch && prior.scope === scope
            ? new Set(prior.steps)
            : new Set<number>();
        steps.add(stepIndex);
        return { profile, epoch, scope, steps };
      });
    },
    [profile, epoch, scope],
  );
  const isConfirmed = (stepIndex: number) =>
    !!receipt &&
    receipt.profile === profile &&
    receipt.epoch === epoch &&
    receipt.scope === scope &&
    receipt.steps.has(stepIndex);
  return { markConfirmed, isConfirmed };
}
