import { useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";

export function useOtaCheckOnOpen(
  enabled: boolean,
  authScope: string | null,
  check: () => boolean,
) {
  const active = useRef(false);
  const pending = useRef(true);
  const checkIfReady = useRef<() => void>(() => undefined);

  useEffect(() => {
    // Auth and rendering can only complete an opening already waiting for its first check.
    checkIfReady.current = () => {
      if (enabled && active.current && pending.current && authScope !== null && check()) {
        pending.current = false;
      }
    };
    checkIfReady.current();
  }, [enabled, authScope, check]);

  useEffect(() => {
    if (!enabled) return;

    let backgrounded = false;
    const onChange = (status: AppStateStatus) => {
      active.current = status === "active";
      if (status === "background") backgrounded = true;
      if (!active.current) return;
      if (backgrounded) {
        backgrounded = false;
        pending.current = true;
      }
      checkIfReady.current();
    };

    const subscription = AppState.addEventListener("change", onChange);
    if (AppState.currentState != null) onChange(AppState.currentState);
    return () => {
      active.current = false;
      subscription.remove();
    };
  }, [enabled]);
}
