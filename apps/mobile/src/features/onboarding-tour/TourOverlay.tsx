import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BORDER_RADIUS, COLORS, FONTS, SPACING } from "@/constants";
import type { MobileOnboardingTourStep } from "./tour-steps";
import type { TourTargetRect } from "./TourTarget";

interface HighlightRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface BackdropPiece {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface TourOverlayProps {
  step: MobileOnboardingTourStep;
  stepIndex: number;
  totalSteps: number;
  targetRect: TourTargetRect | null;
  secondaryTargetRect?: TourTargetRect | null;
  isTargetPending?: boolean;
  primaryActionLabel?: string;
  allowSkip?: boolean;
  onNext: () => void;
  onSkip: () => void;
}

export function TourOverlay({
  step,
  stepIndex,
  totalSteps,
  targetRect,
  secondaryTargetRect = null,
  isTargetPending = false,
  primaryActionLabel,
  allowSkip = true,
  onNext,
  onSkip,
}: TourOverlayProps) {
  const { height, width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [cardHeight, setCardHeight] = useState(0);
  const isLastStep = stepIndex === totalSteps - 1;
  const highlightRects = useMemo(() => {
    return [targetRect, secondaryTargetRect]
      .filter((rect): rect is TourTargetRect => rect != null)
      .map((rect) => {
        const left = Math.max(8, rect.x - 8);
        const top = Math.max(8, rect.y - 8);
        const rectWidth = Math.min(width - left - 8, rect.width + 16);
        const rectHeight = Math.min(height - top - 8, rect.height + 16);
        return { left, top, width: rectWidth, height: rectHeight };
      });
  }, [height, secondaryTargetRect, targetRect, width]);
  const backdropPieces = useMemo(
    () => buildBackdropPieces({ width, height, holes: highlightRects }),
    [height, highlightRects, width],
  );

  const cardStyle = useMemo(() => {
    const cardWidth = Math.min(width - SPACING.md * 2, 360);
    const verticalMargin = SPACING.md;
    const measuredCardHeight = cardHeight || 240;
    const minTop = insets.top + verticalMargin;
    const maxTop = Math.max(minTop, height - insets.bottom - measuredCardHeight - verticalMargin);
    if (!targetRect) {
      return {
        width: cardWidth,
        left: (width - cardWidth) / 2,
        top: Math.min(maxTop, Math.max(minTop, height * 0.32)),
      };
    }

    if (step.id === "courses") {
      const bottomBoundary = secondaryTargetRect?.y ?? height - 86;
      return {
        width: cardWidth,
        left: (width - cardWidth) / 2,
        top: Math.min(
          maxTop,
          Math.max(minTop, bottomBoundary - measuredCardHeight - SPACING.sm),
        ),
      };
    }

    const spaceBelow = height - insets.bottom - (targetRect.y + targetRect.height) - verticalMargin;
    const spaceAbove = targetRect.y - insets.top - verticalMargin;
    const preferredBelowTop = targetRect.y + targetRect.height + SPACING.md;
    const preferredAboveTop = targetRect.y - measuredCardHeight - SPACING.md;

    let top = preferredBelowTop;
    if (spaceBelow < measuredCardHeight && spaceAbove >= measuredCardHeight) {
      top = preferredAboveTop;
    } else if (spaceBelow < measuredCardHeight && spaceAbove < measuredCardHeight) {
      top = maxTop;
    }

    return {
      width: cardWidth,
      left: (width - cardWidth) / 2,
      top: Math.min(maxTop, Math.max(minTop, top)),
    };
  }, [cardHeight, height, insets.bottom, insets.top, secondaryTargetRect?.y, step.id, targetRect, width]);

  if (isTargetPending) {
    return null;
  }

  return (
    <View style={styles.root} pointerEvents="auto">
      {backdropPieces.map((piece, index) => (
        <View
          key={`${piece.left}-${piece.top}-${piece.width}-${piece.height}-${index}`}
          style={[
            styles.backdropPiece,
            {
              left: piece.left,
              top: piece.top,
              width: piece.width,
              height: piece.height,
            },
          ]}
        />
      ))}
      {highlightRects.map((highlightRect, index) => (
        <View
          key={`${highlightRect.left}-${highlightRect.top}-${index}`}
          pointerEvents="none"
          style={[
            styles.highlight,
            {
              left: highlightRect.left,
              top: highlightRect.top,
              width: highlightRect.width,
              height: highlightRect.height,
            },
          ]}
        />
      ))}
      <View
        style={[styles.card, cardStyle, { maxHeight: height - insets.top - insets.bottom - SPACING.md * 2 }]}
        onLayout={(event) => {
          const nextHeight = event.nativeEvent.layout.height;
          if (nextHeight > 0 && Math.abs(nextHeight - cardHeight) > 1) {
            setCardHeight(nextHeight);
          }
        }}
      >
        <Text style={styles.counter}>
          {stepIndex + 1}/{totalSteps}
        </Text>
        <Text style={styles.title}>{step.title}</Text>
        <Text style={styles.text}>{step.text}</Text>
        <View style={styles.actions}>
          {!isLastStep && allowSkip ? (
            <Pressable style={styles.secondaryButton} onPress={onSkip}>
              <Text style={styles.secondaryButtonText}>Пропустить</Text>
            </Pressable>
          ) : null}
          <Pressable style={styles.primaryButton} onPress={onNext}>
            <Text style={styles.primaryButtonText}>
              {primaryActionLabel ?? (isLastStep ? "Готово" : "Далее")}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function buildBackdropPieces({
  width,
  height,
  holes,
}: {
  width: number;
  height: number;
  holes: HighlightRect[];
}): BackdropPiece[] {
  if (holes.length === 0) {
    return [{ left: 0, top: 0, width, height }];
  }

  const yBreaks = Array.from(
    new Set([
      0,
      height,
      ...holes.flatMap((hole) => [Math.max(0, hole.top), Math.min(height, hole.top + hole.height)]),
    ]),
  ).sort((a, b) => a - b);

  const pieces: BackdropPiece[] = [];
  for (let i = 0; i < yBreaks.length - 1; i += 1) {
    const top = yBreaks[i];
    const bottom = yBreaks[i + 1];
    const bandHeight = bottom - top;
    if (bandHeight <= 0) continue;

    const intervals = holes
      .filter((hole) => hole.top < bottom && hole.top + hole.height > top)
      .map((hole) => ({
        left: Math.max(0, hole.left),
        right: Math.min(width, hole.left + hole.width),
      }))
      .filter((interval) => interval.right > interval.left)
      .sort((a, b) => a.left - b.left);

    const merged: { left: number; right: number }[] = [];
    for (const interval of intervals) {
      const last = merged[merged.length - 1];
      if (!last || interval.left > last.right) {
        merged.push({ ...interval });
      } else {
        last.right = Math.max(last.right, interval.right);
      }
    }

    let cursor = 0;
    for (const interval of merged) {
      if (interval.left > cursor) {
        pieces.push({ left: cursor, top, width: interval.left - cursor, height: bandHeight });
      }
      cursor = Math.max(cursor, interval.right);
    }
    if (cursor < width) {
      pieces.push({ left: cursor, top, width: width - cursor, height: bandHeight });
    }
  }

  return pieces;
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
  },
  backdropPiece: {
    position: "absolute",
    backgroundColor: "rgba(0, 0, 0, 0.54)",
  },
  highlight: {
    position: "absolute",
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 3,
    borderColor: COLORS.cardBackground,
    backgroundColor: "transparent",
  },
  card: {
    position: "absolute",
    backgroundColor: COLORS.cardBackground,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  counter: {
    alignSelf: "flex-start",
    color: COLORS.primary,
    fontFamily: FONTS.montserratMedium,
    fontSize: 12,
    fontVariant: ["tabular-nums"],
  },
  title: {
    color: COLORS.text,
    fontFamily: FONTS.impact,
    fontSize: 22,
    lineHeight: 26,
  },
  text: {
    color: COLORS.textSecondary,
    fontFamily: FONTS.montserrat,
    fontSize: 15,
    lineHeight: 22,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: SPACING.sm,
    marginTop: SPACING.xs,
  },
  secondaryButton: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: SPACING.md,
  },
  secondaryButtonText: {
    color: COLORS.textSecondary,
    fontFamily: FONTS.montserratMedium,
    fontSize: 14,
  },
  primaryButton: {
    minHeight: 44,
    justifyContent: "center",
    backgroundColor: COLORS.primary,
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.md,
  },
  primaryButtonText: {
    color: COLORS.onPrimary,
    fontFamily: FONTS.montserratMedium,
    fontSize: 14,
  },
});
