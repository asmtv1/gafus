"use client";

import { trackEvent } from "@gafus/analytics";
import { reportClientError } from "@gafus/error-handling";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import { TourOverlay } from "./TourOverlay";
import {
  getWebOnboardingTourSteps,
  WEB_ONBOARDING_TOUR_VERSION,
  type WebOnboardingTourStepId,
  type WebOnboardingTourTargetId,
} from "./tour-steps";
import { useWebOnboardingTourStore } from "./tour-store";

const AUTOSTART_DELAY_MS = 500;
const TARGET_WAIT_TIMEOUT_MS = 1600;
const TOP_CARD_DEFAULT_TARGET_TOP = 230;
const CONSULTATIONS_TARGET_TOP = 245;
const COURSES_TARGET_TOP = 180;

type WebOnboardingTourEventName =
  | "mobile_onboarding_started"
  | "mobile_onboarding_step_viewed"
  | "mobile_onboarding_skipped"
  | "mobile_onboarding_completed";

function trackTourEvent(eventName: WebOnboardingTourEventName, stepId?: WebOnboardingTourStepId) {
  trackEvent({
    eventName,
    platform: "web",
    pathOrScreen: "/web-onboarding-tour",
    elementId: stepId ? `tour-${stepId}` : "tour",
    version: WEB_ONBOARDING_TOUR_VERSION,
    stepId,
  });
}

function measureTarget(id?: WebOnboardingTourTargetId): DOMRect | null {
  if (!id || typeof document === "undefined") {
    return null;
  }
  const el = document.querySelector<HTMLElement>(`[data-tour-target="${id}"]`);
  if (!el) {
    return null;
  }
  const rect = el.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return null;
  }
  return rect;
}

function getTargetElement(id?: WebOnboardingTourTargetId): HTMLElement | null {
  if (!id || typeof document === "undefined") {
    return null;
  }
  return document.querySelector<HTMLElement>(`[data-tour-target="${id}"]`);
}

function isRectComfortablyVisible(rect: DOMRect): boolean {
  const viewportHeight = window.innerHeight;
  const verticalMargin = 12;

  // Высокие блоки (например, длинная карточка кинолога) физически не помещаются целиком в экран.
  // Для них считаем нормой, когда видна верхняя часть без прилипания к краю.
  if (rect.height >= viewportHeight - verticalMargin * 2) {
    return rect.top >= verticalMargin && rect.top <= Math.round(viewportHeight * 0.35);
  }

  return rect.top >= verticalMargin && rect.bottom <= viewportHeight - verticalMargin;
}

function alignTargetForTopCard(targetEl: HTMLElement, desiredTop = 230) {
  const rect = targetEl.getBoundingClientRect();
  const delta = rect.top - desiredTop;
  if (Math.abs(delta) < 10) return;
  window.scrollTo({ top: Math.max(0, window.scrollY + delta), behavior: "auto" });
}

function setRootScrollTop(top: number) {
  const nextTop = Math.max(0, Math.round(top));
  window.scrollTo({ top: nextTop, behavior: "auto" });
  document.documentElement.scrollTop = nextTop;
  document.body.scrollTop = nextTop;
  document.scrollingElement?.scrollTo({ top: nextTop, behavior: "auto" });
}

function alignCoursesTarget(targetEl: HTMLElement): boolean {
  const rect = targetEl.getBoundingClientRect();
  if (Math.abs(rect.top - COURSES_TARGET_TOP) < 8) return true;

  const absoluteTop = window.scrollY + rect.top;
  setRootScrollTop(absoluteTop - COURSES_TARGET_TOP);

  const nextRect = targetEl.getBoundingClientRect();
  return Math.abs(nextRect.top - COURSES_TARGET_TOP) < 8;
}

export function WebOnboardingTourProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const { status } = useSession();
  const {
    hasSeenV1,
    hasServerStateLoaded,
    currentStepId,
    isActive,
    isAwaitingRequiredPetCreation,
    setServerState,
    startTour,
    setCurrentStepId,
    waitForRequiredPetCreation,
    completeRequiredPetCreation,
    cancelRequiredPetCreationWait,
    completeTour,
    skipTour,
    closeTour,
  } = useWebOnboardingTourStore();

  const [hasPets, setHasPets] = useState(false);
  const steps = useMemo(() => getWebOnboardingTourSteps({ hasPets }), [hasPets]);
  const stepIndex = Math.max(
    0,
    steps.findIndex((step) => step.id === currentStepId),
  );
  const step = steps[stepIndex] ?? steps[0];
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [hasAlignedCoursesStep, setHasAlignedCoursesStep] = useState(false);

  useEffect(() => {
    setHasAlignedCoursesStep(false);
  }, [step?.id, pathname]);

  useEffect(() => {
    if (!isActive || step?.id !== "courses" || hasAlignedCoursesStep) return;
    const targetEl = getTargetElement("courses-first-card");
    if (!targetEl) return;
    alignCoursesTarget(targetEl);
    setHasAlignedCoursesStep(true);
  }, [hasAlignedCoursesStep, isActive, step?.id]);

  useEffect(() => {
    if (status !== "authenticated") return;
    let cancelled = false;
    const loadPets = async () => {
      try {
        const response = await fetch("/api/v1/pets", {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
        });
        const json = await response.json();
        if (!cancelled) {
          const pets = Array.isArray(json?.data) ? json.data : [];
          setHasPets(pets.length > 0);
        }
      } catch {
        reportClientError(new Error("Не удалось загрузить список питомцев"), {
          issueKey: "WebOnboardingTourProvider",
          severity: "warning",
          keys: { operation: "load_pets" },
        });
        if (!cancelled) {
          setHasPets(false);
        }
      }
    };
    void loadPets();
    return () => {
      cancelled = true;
    };
  }, [pathname, status, isActive]);

  useEffect(() => {
    if (status !== "authenticated") {
      return;
    }

    let cancelled = false;
    const loadStatus = async () => {
      try {
        const response = await fetch("/api/v1/user/onboarding-tour", {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
        });
        const json = await response.json();
        if (!cancelled) {
          setServerState(Boolean(json?.success && json?.data?.hasSeenV1));
        }
      } catch {
        reportClientError(new Error("Не удалось загрузить статус экскурсии"), {
          issueKey: "WebOnboardingTourProvider",
          severity: "warning",
          keys: { operation: "load_status" },
        });
        if (!cancelled) {
          setServerState(false);
        }
      }
    };
    void loadStatus();

    return () => {
      cancelled = true;
    };
  }, [setServerState, status]);

  useEffect(() => {
    if (status === "unauthenticated") {
      closeTour();
      return;
    }
    if (status !== "authenticated" || !hasServerStateLoaded || hasSeenV1 || isActive) {
      return;
    }
    const timer = setTimeout(() => {
      startTour();
      trackTourEvent("mobile_onboarding_started");
    }, AUTOSTART_DELAY_MS);
    return () => clearTimeout(timer);
  }, [closeTour, hasSeenV1, hasServerStateLoaded, isActive, startTour, status]);

  useEffect(() => {
    if (!isActive || !step) {
      return;
    }
    trackTourEvent("mobile_onboarding_step_viewed", step.id);
  }, [isActive, step]);

  useEffect(() => {
    if (!isActive || !step?.route || pathname === step.route) {
      return;
    }
    if (currentStepId === "add-pet" && pathname === "/profile/addPet") {
      return;
    }
    router.push(step.route);
  }, [currentStepId, isActive, pathname, router, step]);

  useEffect(() => {
    if (
      isActive &&
      !isAwaitingRequiredPetCreation &&
      currentStepId === "add-pet" &&
      pathname === "/profile/addPet" &&
      !hasPets
    ) {
      waitForRequiredPetCreation();
      return;
    }

    if (
      isActive &&
      isAwaitingRequiredPetCreation &&
      currentStepId === "add-pet" &&
      hasPets
    ) {
      completeRequiredPetCreation();
      return;
    }

    if (
      isActive &&
      isAwaitingRequiredPetCreation &&
      currentStepId === "add-pet" &&
      pathname !== "/profile/addPet" &&
      !hasPets
    ) {
      cancelRequiredPetCreationWait();
    }
  }, [
    cancelRequiredPetCreationWait,
    completeRequiredPetCreation,
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
      return;
    }

    let cancelled = false;
    const startedAt = Date.now();
    let lastRect: DOMRect | null = null;

    const tick = () => {
      if (cancelled) return;
      const targetEl = getTargetElement(step.targetId);
      if (targetEl) {
        const elRect = targetEl.getBoundingClientRect();
        const isTallTarget = elRect.height >= window.innerHeight - 24;
        if (step.id === "courses") {
          // Step 8 is aligned once on entry to avoid layout jumping while the overlay measures.
        } else if (step.cardPlacement === "above") {
          const desiredTop =
            step.id === "consultations" ? CONSULTATIONS_TARGET_TOP : TOP_CARD_DEFAULT_TARGET_TOP;
          alignTargetForTopCard(targetEl, desiredTop);
        } else if (!isRectComfortablyVisible(elRect)) {
          targetEl.scrollIntoView({
            behavior: "auto",
            block: isTallTarget ? "start" : "center",
            inline: "nearest",
          });
        }
      }
      const rect = measureTarget(step.targetId);
      if (rect) {
        lastRect = rect;
        setTargetRect(rect);
        if (step.id === "courses") {
          return;
        }
        if (isRectComfortablyVisible(rect)) {
          return;
        }
      }
      if (Date.now() - startedAt >= TARGET_WAIT_TIMEOUT_MS) {
        setTargetRect(lastRect);
        return;
      }
      window.requestAnimationFrame(tick);
    };

    setTargetRect(null);
    tick();

    return () => {
      cancelled = true;
    };
  }, [isActive, step]);

  const handleNext = useCallback(() => {
    if (step?.requiresPetCreation) {
      waitForRequiredPetCreation();
      router.push("/profile/addPet");
      return;
    }
    if (stepIndex >= steps.length - 1) {
      trackTourEvent("mobile_onboarding_completed", step?.id);
      completeTour();
      void fetch("/api/v1/user/onboarding-tour/complete", {
        method: "POST",
        credentials: "same-origin",
      });
      router.push("/subscription?required=1&reason=onboarding");
      return;
    }
    setCurrentStepId(steps[stepIndex + 1].id);
  }, [completeTour, router, setCurrentStepId, step, stepIndex, steps, waitForRequiredPetCreation]);

  const handleSkip = useCallback(() => {
    trackTourEvent("mobile_onboarding_skipped", step?.id);
    skipTour();
    void fetch("/api/v1/user/onboarding-tour/complete", {
      method: "POST",
      credentials: "same-origin",
    });
    router.push("/subscription?required=1&reason=onboarding");
  }, [router, skipTour, step?.id]);

  return (
    <>
      {children}
      {isActive && step && !isAwaitingRequiredPetCreation ? (
        <TourOverlay
          step={step}
          stepIndex={stepIndex}
          totalSteps={steps.length}
          targetRect={targetRect}
          cardPlacement={step.cardPlacement}
          cardAnchor={step.cardAnchor}
          allowSkip={step.allowSkip ?? true}
          onNext={handleNext}
          onSkip={handleSkip}
        />
      ) : null}
    </>
  );
}
