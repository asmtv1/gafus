import { useCallback, useLayoutEffect, useMemo } from "react";
import { AppState } from "react-native";
import { useFocusEffect } from "expo-router";
import { mobilePerformance } from "./mobilePerformance";
import {
  createScreenDataReadyTracker,
  type ScreenDataReadyMetric,
} from "./screenDataReadyTracker";

// Sampling is decided once for the JS runtime; the hook choice never changes
// between renders. Unsampled sessions need no navigator subscription or timers.
const useSampledFocusEffect: typeof useFocusEffect = mobilePerformance.enabled
  ? useFocusEffect
  : function useInactiveFocusEffect() {};

export function useScreenDataReady(
  metric: ScreenDataReadyMetric,
  ready: boolean,
  localScope = "",
): void {
  // Scope is strictly local. Changing an actor, route parameter, or dataset
  // cancels stale callbacks before recording a sample for the new content.
  const tracker = useMemo(() => createScreenDataReadyTracker({
    now: () => performance.now(),
    requestFrame: callback => requestAnimationFrame(callback),
    cancelFrame: handle => cancelAnimationFrame(handle),
    isActive: () => AppState.currentState === "active",
    record: duration => mobilePerformance.record(metric, duration),
  }), [metric, localScope]);

  useLayoutEffect(() => {
    if (mobilePerformance.enabled) tracker.setReady(ready);
  }, [tracker, ready]);

  useLayoutEffect(() => () => tracker.end(), [tracker]);

  useSampledFocusEffect(useCallback(() => {
    let active = AppState.currentState === "active";
    if (active) tracker.begin();
    const subscription = AppState.addEventListener("change", state => {
      const next = state === "active";
      if (next === active) return;
      active = next;
      if (active) tracker.begin();
      else tracker.end();
    });
    return () => {
      subscription.remove();
      tracker.end();
    };
  }, [tracker]));
}
