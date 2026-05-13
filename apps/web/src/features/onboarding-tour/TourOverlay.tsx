"use client";

import { useMemo } from "react";

import styles from "./TourOverlay.module.css";
import type {
  WebOnboardingTourCardAnchor,
  WebOnboardingTourCardPlacement,
  WebOnboardingTourStep,
} from "./tour-steps";

interface TourOverlayProps {
  step: WebOnboardingTourStep;
  stepIndex: number;
  totalSteps: number;
  targetRect: DOMRect | null;
  cardPlacement?: WebOnboardingTourCardPlacement;
  cardAnchor?: WebOnboardingTourCardAnchor;
  allowSkip?: boolean;
  onNext: () => void;
  onSkip: () => void;
}

export function TourOverlay({
  step,
  stepIndex,
  totalSteps,
  targetRect,
  cardPlacement,
  cardAnchor,
  allowSkip = true,
  onNext,
  onSkip,
}: TourOverlayProps) {
  const isLastStep = stepIndex === totalSteps - 1;
  const cardWidthExpr = "min(560px, calc(100vw - 24px))";

  const cardStyle = useMemo(() => {
    if (typeof window === "undefined") {
      return { left: "12px", top: "24px" };
    }
    const margin = 12;
    const estimatedCardHeight = 260;
    if (cardAnchor === "center") {
      const centerTop = (window.innerHeight - estimatedCardHeight) / 2;
      return {
        left: `max(${margin}px, calc((100vw - ${cardWidthExpr}) / 2))`,
        top: `${Math.max(margin, centerTop)}px`,
      };
    }
    if (cardAnchor === "viewport") {
      const bottomTop = window.innerHeight - estimatedCardHeight - margin;
      return {
        left: `max(${margin}px, calc((100vw - ${cardWidthExpr}) / 2))`,
        top: `${Math.max(margin, bottomTop)}px`,
      };
    }
    const defaultTop = Math.max(margin, Math.round(window.innerHeight * 0.3));
    if (!targetRect) {
      return {
        left: `max(${margin}px, calc((100vw - ${cardWidthExpr}) / 2))`,
        top: cardPlacement === "above" ? `${margin}px` : `${defaultTop}px`,
      };
    }

    const preferredAboveTop = targetRect.top - estimatedCardHeight - 12;
    const preferredBelowTop = targetRect.bottom + 12;
    const maxTop = window.innerHeight - estimatedCardHeight - margin;

    const shouldPreferAbove = cardPlacement === "above";
    let top = shouldPreferAbove ? preferredAboveTop : preferredBelowTop;

    if (shouldPreferAbove) {
      top = margin;
    } else if (preferredBelowTop > maxTop && preferredAboveTop >= margin) {
      top = preferredAboveTop;
    } else if (preferredBelowTop > maxTop) {
      top = maxTop;
    }

    return {
      left: `max(${margin}px, calc((100vw - ${cardWidthExpr}) / 2))`,
      top: `${Math.max(margin, top)}px`,
    };
  }, [cardAnchor, cardPlacement, targetRect]);

  return (
    <div className={styles.root}>
      <div className={targetRect ? styles.backdropTransparent : styles.backdrop} />
      {targetRect ? (
        <div
          className={styles.highlight}
          style={{
            left: Math.max(8, targetRect.x - 8),
            top: Math.max(8, targetRect.y - 8),
            width: targetRect.width + 16,
            height: targetRect.height + 16,
          }}
        />
      ) : null}
      <div className={styles.card} style={cardStyle}>
        <div className={styles.counter}>
          {stepIndex + 1}/{totalSteps}
        </div>
        <div className={styles.title}>{step.title}</div>
        <div className={styles.text}>{step.text}</div>
        <div className={styles.actions}>
          {!isLastStep && allowSkip ? (
            <button className={styles.skip} type="button" onClick={onSkip}>
              Пропустить
            </button>
          ) : null}
          <button className={styles.next} type="button" onClick={onNext}>
            {step.primaryActionLabel ?? (isLastStep ? "Готово" : "Далее")}
          </button>
        </div>
      </div>
    </div>
  );
}
