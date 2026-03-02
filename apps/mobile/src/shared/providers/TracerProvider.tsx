import type { ReactNode } from "react";
import { useEffect } from "react";
import { isTracerEnabled, reportClientError } from "@/shared/lib/tracer";

const globalObj = globalThis as Record<string, unknown>;
const ErrorUtils = globalObj.ErrorUtils as
  | {
      setGlobalHandler: (handler: (error: unknown, isFatal?: boolean) => void) => void;
      getGlobalHandler: () => (error: unknown, isFatal?: boolean) => void;
    }
  | undefined;

interface TracerProviderProps {
  children: ReactNode;
}

/** Инициализация Tracer: перехват глобальных JS-ошибок. RN использует прямой import reportClientError. */
export function TracerProvider({ children }: TracerProviderProps) {
  useEffect(() => {
    if (!isTracerEnabled() || !ErrorUtils?.setGlobalHandler) return;
    const prev = ErrorUtils.getGlobalHandler?.();
    ErrorUtils.setGlobalHandler((error: unknown, isFatal?: boolean) => {
      reportClientError(error, {
        issueKey: "GlobalHandler",
        severity: isFatal ? "fatal" : "error",
      });
      prev?.(error, isFatal);
    });
  }, []);

  return <>{children}</>;
}
