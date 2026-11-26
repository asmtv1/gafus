import { useCallback, useEffect, useRef, useState } from "react";
import {
  requestWalkLocationAccess,
  type WalkLocationDisclosureDetails,
} from "./walkLocationPermissionFlow";

export function useWalkLocationPermissionFlow(ownerId: string | null, sessionEpoch: string | null) {
  const [disclosure, setDisclosure] = useState<WalkLocationDisclosureDetails | null>(null);
  const decision = useRef<((confirmed: boolean) => void) | null>(null);
  const attempt = useRef<AbortController | null>(null);

  const answerDisclosure = useCallback((confirmed: boolean) => {
    const resolve = decision.current;
    decision.current = null;
    setDisclosure(null);
    resolve?.(confirmed);
  }, []);

  useEffect(() => {
    setDisclosure(null);
    return () => {
      attempt.current?.abort();
      attempt.current = null;
      decision.current?.(false);
      decision.current = null;
    };
  }, [ownerId, sessionEpoch]);

  const requestPermissions = useCallback(async (isCurrent: () => boolean) => {
    if (attempt.current) return false;
    const controller = new AbortController();
    attempt.current = controller;
    try {
      return await requestWalkLocationAccess({
        isCurrent,
        signal: controller.signal,
        confirm: (details) =>
          new Promise<boolean>((resolve) => {
            decision.current = resolve;
            setDisclosure(details);
          }),
      });
    } finally {
      if (attempt.current === controller) attempt.current = null;
    }
  }, []);

  return { disclosure, answerDisclosure, requestPermissions };
}
