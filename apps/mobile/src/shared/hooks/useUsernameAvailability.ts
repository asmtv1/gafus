import { useEffect, useRef, useState } from "react";

import { userApi } from "@/shared/lib/api/user";
import { reportClientError } from "@/shared/lib/tracer";

type AvailabilityStatus = "idle" | "checking" | "available" | "taken";

export function useUsernameAvailability(username: string) {
  const [status, setStatus] = useState<AvailabilityStatus>("idle");
  const requestIdRef = useRef(0);

  useEffect(() => {
    const trimmed = username.trim();
    if (trimmed.length < 3 || !/^[A-Za-z0-9_]+$/.test(trimmed)) {
      setStatus("idle");
      return;
    }

    setStatus("checking");
    const requestId = ++requestIdRef.current;

    const timer = setTimeout(async () => {
      try {
        const result = await userApi.checkUsernameAvailable(trimmed);
        if (requestIdRef.current !== requestId) return;
        if (result.success && result.data) {
          setStatus(result.data.available ? "available" : "taken");
        } else {
          setStatus("idle");
        }
      } catch (err) {
        reportClientError(err, {
          issueKey: "useUsernameAvailability",
          severity: "warning",
          keys: { operation: "check_username" },
        });
        if (requestIdRef.current === requestId) setStatus("idle");
      }
    }, 450);

    return () => clearTimeout(timer);
  }, [username]);

  return { status };
}
