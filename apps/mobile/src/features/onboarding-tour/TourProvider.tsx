import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { InteractionManager, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { usePathname, useRouter } from "expo-router";

import { onboardingTourApi } from "@/shared/lib/api/onboarding-tour";
import { petsQueryOptions } from "@/shared/lib/api/profileTabQueries";
import { trackEvent } from "@/shared/lib/analytics";
import { TourTargetsProvider, useTourTargets, type TourTargetRect } from "@/shared/lib/tour-targets";
import { reportClientError } from "@/shared/lib/tracer";
import { useAuthStore } from "@/shared/stores";
import {
  getMobileOnboardingTourSteps,
  MOBILE_ONBOARDING_TOUR_VERSION,
  type MobileOnboardingTourStepId,
} from "./tour-steps";
import { TourOverlay } from "./TourOverlay";
import { useMobileOnboardingTourStore } from "./tour-store";

const TARGET_MEASURE_DELAY_MS = 260;
const COURSES_TARGET_MEASURE_DELAY_MS = 520;
const DAILY_COURSE_TARGET_MEASURE_DELAY_MS = 520;
const TARGET_FALLBACK_MS = 1600;
const TARGET_RETRY_INTERVAL_MS = 120;
const TARGET_STABILITY_DELAY_MS = 120;
const TARGET_STABILITY_THRESHOLD_PX = 2;
const TOUR_AUTOSTART_DELAY_MS = 500;

type MobileOnboardingTourEventName =
  | "mobile_onboarding_started"
  | "mobile_onboarding_step_viewed"
  | "mobile_onboarding_skipped"
  | "mobile_onboarding_completed";

function trackTourEvent(
  eventName: MobileOnboardingTourEventName,
  stepId?: MobileOnboardingTourStepId,
) {
  trackEvent({
    eventName,
    platform: "mobile",
    pathOrScreen: "/mobile-onboarding-tour",
    elementId: stepId ? `tour-${stepId}` : "tour",
    version: MOBILE_ONBOARDING_TOUR_VERSION,
    stepId,
  });
}

function areTargetRectsStable(a: TourTargetRect, b: TourTargetRect): boolean {
  return (
    Math.abs(a.x - b.x) <= TARGET_STABILITY_THRESHOLD_PX &&
    Math.abs(a.y - b.y) <= TARGET_STABILITY_THRESHOLD_PX &&
    Math.abs(a.width - b.width) <= TARGET_STABILITY_THRESHOLD_PX &&
    Math.abs(a.height - b.height) <= TARGET_STABILITY_THRESHOLD_PX
  );
}

function MobileOnboardingTourController() {
  const router = useRouter();
  const pathname = usePathname();
  const { measureTarget } = useTourTargets();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const {
    hasHydrated,
    hasSeenV1,
    setHasSeenV1,
    currentStepId,
    isActive,
    isAwaitingRequiredPetCreation,
    startTour,
    setCurrentStepId,
    waitForRequiredPetCreation,
    cancelRequiredPetCreationWait,
    completeTour,
    skipTour,
    closeTour,
  } = useMobileOnboardingTourStore();
  const { data: petsData } = useQuery({
    ...petsQueryOptions,
    enabled: isAuthenticated && isActive,
  });
  const hasPets = (petsData?.data?.length ?? 0) > 0;
  const steps = useMemo(() => getMobileOnboardingTourSteps({ hasPets }), [hasPets]);
  const stepIndex = Math.max(
    0,
    steps.findIndex((step) => step.id === currentStepId),
  );
  const step = steps[stepIndex] ?? steps[0];
  const [targetRect, setTargetRect] = useState<TourTargetRect | null>(null);
  const [secondaryTargetRect, setSecondaryTargetRect] = useState<TourTargetRect | null>(null);
  const [isTargetPending, setIsTargetPending] = useState(false);

  useEffect(() => {
    if (!hasHydrated) {
      useMobileOnboardingTourStore.getState().setHasHydrated(true);
    }
  }, [hasHydrated]);

  useEffect(() => {
    if (!isAuthenticated) {
      closeTour();
    }
  }, [closeTour, isAuthenticated]);

  useEffect(() => {
    if (!hasHydrated || !isAuthenticated) return;
    let cancelled = false;
    const loadStatus = async () => {
      const response = await onboardingTourApi.getStatus();
      if (cancelled) return;
      if (response.success) {
        setHasSeenV1(Boolean(response.data?.hasSeenV1));
        return;
      }
      reportClientError(new Error(response.error ?? "Не удалось загрузить статус экскурсии"), {
        issueKey: "MobileOnboardingTourProvider",
        severity: "warning",
        keys: { operation: "load_status" },
      });
      setHasSeenV1(false);
    };
    void loadStatus();
    return () => {
      cancelled = true;
    };
  }, [hasHydrated, isAuthenticated, setHasSeenV1]);

  useEffect(() => {
    if (!hasHydrated || !isAuthenticated || hasSeenV1 || isActive) return;
    const timer = setTimeout(() => {
      startTour();
      trackTourEvent("mobile_onboarding_started");
    }, TOUR_AUTOSTART_DELAY_MS);
    return () => clearTimeout(timer);
  }, [hasHydrated, hasSeenV1, isActive, isAuthenticated, startTour]);

  useEffect(() => {
    if (!isActive || !step) return;
    trackTourEvent("mobile_onboarding_step_viewed", step.id);
  }, [isActive, step]);

  useEffect(() => {
    if (!isActive || !step?.route) return;
    router.push(step.route);
  }, [isActive, router, step]);

  useEffect(() => {
    if (
      isActive &&
      !isAwaitingRequiredPetCreation &&
      currentStepId === "add-pet" &&
      pathname === "/pets/add" &&
      !hasPets
    ) {
      waitForRequiredPetCreation();
      return;
    }

    if (
      isActive &&
      isAwaitingRequiredPetCreation &&
      currentStepId === "add-pet" &&
      pathname !== "/pets/add" &&
      !hasPets
    ) {
      cancelRequiredPetCreationWait();
    }
  }, [
    cancelRequiredPetCreationWait,
    currentStepId,
    hasPets,
    isActive,
    isAwaitingRequiredPetCreation,
    pathname,
    waitForRequiredPetCreation,
  ]);

  useEffect(() => {
    if (!isActive || !step?.targetId) {
      setTargetRect(null);
      setSecondaryTargetRect(null);
      setIsTargetPending(false);
      return;
    }

    let cancelled = false;
    const timeoutHandles: ReturnType<typeof setTimeout>[] = [];
    setTargetRect(null);
    setSecondaryTargetRect(null);
    setIsTargetPending(true);

    const clearScheduledTimeouts = () => {
      timeoutHandles.forEach(clearTimeout);
      timeoutHandles.length = 0;
    };

    const finishWithFallback = () => {
      if (cancelled) return;
      clearScheduledTimeouts();
      setTargetRect(null);
      setIsTargetPending(false);
    };

    const fallback = setTimeout(finishWithFallback, TARGET_FALLBACK_MS);
    timeoutHandles.push(fallback);

    const acceptRectIfStable = (rect: TourTargetRect) => {
      const stabilityTimeout = setTimeout(() => {
        void measureTarget(step.targetId!).then((nextRect) => {
          if (cancelled) return;
          if (nextRect && areTargetRectsStable(rect, nextRect)) {
            clearScheduledTimeouts();
            setTargetRect(nextRect);
            setIsTargetPending(false);
            if (step.secondaryTargetId) {
              void measureTarget(step.secondaryTargetId).then((secondaryRect) => {
                if (!cancelled) {
                  setSecondaryTargetRect(secondaryRect);
                }
              });
            }
            return;
          }
          scheduleMeasure(TARGET_RETRY_INTERVAL_MS);
        });
      }, TARGET_STABILITY_DELAY_MS);
      timeoutHandles.push(stabilityTimeout);
    };

    const scheduleMeasure = (delayMs: number) => {
      const timeout = setTimeout(() => {
        void measureTarget(step.targetId!).then((rect) => {
          if (cancelled) return;
          if (rect) {
            acceptRectIfStable(rect);
            return;
          }
          scheduleMeasure(TARGET_RETRY_INTERVAL_MS);
        });
      }, delayMs);
      timeoutHandles.push(timeout);
    };

    const interaction = InteractionManager.runAfterInteractions(() => {
      const measureDelay =
        step.id === "courses"
          ? COURSES_TARGET_MEASURE_DELAY_MS
          : step.id === "daily-course"
            ? DAILY_COURSE_TARGET_MEASURE_DELAY_MS
            : TARGET_MEASURE_DELAY_MS;
      scheduleMeasure(measureDelay);
    });

    return () => {
      cancelled = true;
      clearScheduledTimeouts();
      interaction.cancel();
    };
  }, [isActive, measureTarget, step]);

  const handleSkip = useCallback(() => {
    trackTourEvent("mobile_onboarding_skipped", step?.id);
    skipTour();
    void onboardingTourApi.complete();
  }, [skipTour, step?.id]);

  const handleNext = useCallback(() => {
    if (step?.requiresPetCreation) {
      waitForRequiredPetCreation();
      router.push("/pets/add");
      return;
    }
    if (stepIndex >= steps.length - 1) {
      trackTourEvent("mobile_onboarding_completed", step?.id);
      completeTour();
      void onboardingTourApi.complete();
      return;
    }
    setCurrentStepId(steps[stepIndex + 1].id);
  }, [completeTour, router, setCurrentStepId, step, stepIndex, steps, waitForRequiredPetCreation]);

  if (!isActive || !step || isAwaitingRequiredPetCreation) return null;

  return (
    <TourOverlay
      step={step}
      stepIndex={stepIndex}
      totalSteps={steps.length}
      targetRect={targetRect}
      secondaryTargetRect={secondaryTargetRect}
      isTargetPending={isTargetPending}
      primaryActionLabel={step.primaryActionLabel}
      allowSkip={step.allowSkip ?? true}
      onNext={handleNext}
      onSkip={handleSkip}
    />
  );
}

export function MobileOnboardingTourProvider({ children }: { children: ReactNode }) {
  return (
    <TourTargetsProvider>
      <View style={{ flex: 1 }}>
        {children}
        <MobileOnboardingTourController />
      </View>
    </TourTargetsProvider>
  );
}
