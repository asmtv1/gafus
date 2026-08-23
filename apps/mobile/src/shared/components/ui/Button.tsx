import { useState } from "react";
import {
  Platform,
  StyleSheet,
  View,
  type DimensionValue,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { Button as PaperButton, type ButtonProps as PaperButtonProps } from "react-native-paper";
import * as Haptics from "expo-haptics";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import Svg, { Defs, LinearGradient as SvgLinearGradient, Rect, Stop } from "react-native-svg";
import { COLORS, FONTS, SPACING } from "@/shared/config";

interface ButtonProps extends Omit<PaperButtonProps, "children" | "style"> {
  label: string;
  haptic?: boolean;
  variant?: "primary" | "secondary" | "selected" | "outline" | "danger";
  size?: "regular" | "large";
  /**
   * Размеры задаются только для композиционных исключений. Обычная кнопка
   * остаётся полноширинной, чтобы формы и основной CTA были единообразными.
   */
  width?: DimensionValue;
  flex?: number;
  height?: number;
  fullWidth?: boolean;
  fontSize?: number;
  lineHeight?: number;
  /** null сохраняет системный шрифт конкретной платформы. */
  fontFamily?: string | null;
  fontWeight?: TextStyle["fontWeight"];
  horizontalPadding?: number;
  verticalPadding?: number;
  borderRadius?: number;
  iconPosition?: "left" | "right";
  /** По умолчанию включён для фирменной оливковой primary-кнопки. */
  gradient?: boolean;
  /** Небольшой физический отклик при касании для переключателей и компактных действий. */
  animatedPress?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * Кнопка с haptic feedback (стиль как в веб)
 * Обёртка над React Native Paper Button
 */
export function Button({
  label,
  haptic = true,
  onPress,
  style,
  variant = "primary",
  size = "regular",
  width,
  flex,
  height,
  fullWidth = true,
  fontSize,
  lineHeight,
  fontFamily,
  fontWeight,
  horizontalPadding,
  verticalPadding,
  borderRadius,
  iconPosition = "left",
  gradient,
  animatedPress = false,
  contentStyle,
  labelStyle,
  buttonColor,
  textColor,
  ...paperProps
}: ButtonProps) {
  const [isPressed, setIsPressed] = useState(false);
  const pressProgress = useSharedValue(0);

  const handlePress = async (e: Parameters<NonNullable<PaperButtonProps["onPress"]>>[0]) => {
    if (haptic) {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onPress?.(e);
  };

  const isPrimary = variant === "primary";
  const isSecondary = variant === "secondary";
  const isSelected = variant === "selected";
  const isDanger = variant === "danger";
  const pressTravel = isSelected ? 1 : 3;
  const pressScale = isSelected ? 0.994 : 0.99;
  const pressMotionStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: animatedPress ? pressProgress.value * pressTravel : 0 },
      { scale: animatedPress ? 1 - pressProgress.value * (1 - pressScale) : 1 },
    ],
  }));
  const usesDepthGradient =
    gradient ??
    ((isPrimary && (buttonColor === undefined || buttonColor === COLORS.primary)) ||
      (isSecondary && buttonColor === undefined));
  const depthColors = isSecondary
    ? ["#E8B1A8", "#DE988F", "#D7837B", "#D0716B", "#C7615D"]
    : ["#96914D", "#817D40", "#666429", "#59581F", "#4A4917"];
  const resolvedBorderRadius = borderRadius ?? (size === "large" ? 22 : 18);

  const handlePressIn = (event: Parameters<NonNullable<PaperButtonProps["onPressIn"]>>[0]) => {
    setIsPressed(true);
    if (animatedPress) {
      pressProgress.value = withTiming(1, {
        duration: 160,
        easing: Easing.inOut(Easing.quad),
      });
    }
    paperProps.onPressIn?.(event);
  };

  const handlePressOut = (event: Parameters<NonNullable<PaperButtonProps["onPressOut"]>>[0]) => {
    setIsPressed(false);
    if (animatedPress) {
      pressProgress.value = withTiming(0, {
        duration: 120,
        easing: Easing.out(Easing.cubic),
      });
    }
    paperProps.onPressOut?.(event);
  };

  const renderPaperButton = (
    onGradient = false,
    interactionProps?: Partial<Pick<PaperButtonProps, "onPressIn" | "onPressOut">>,
    hostedByAnimatedShell = false,
  ) => (
    <PaperButton
      {...paperProps}
      {...interactionProps}
      mode={
        onGradient
          ? "text"
          : isPrimary || isSecondary || isSelected || isDanger
            ? "contained"
            : "outlined"
      }
      onPress={handlePress}
      style={[
        styles.button,
        onGradient && styles.buttonOnGradient,
        !onGradient && (hostedByAnimatedShell || fullWidth ? styles.fullWidth : styles.fitContent),
        !onGradient &&
          (isPrimary
            ? styles.primaryButton
            : isSecondary
              ? styles.secondaryButton
              : isSelected
                ? styles.selectedButton
                : isDanger
                  ? styles.dangerButton
                  : styles.outlineButton),
        !onGradient && size === "large" && styles.largeButton,
        !onGradient && isSelected && isPressed && styles.selectedButtonPressed,
        !onGradient && !hostedByAnimatedShell && width !== undefined && { width },
        !onGradient && !hostedByAnimatedShell && flex !== undefined && { flex },
        { borderRadius: resolvedBorderRadius },
        !onGradient && !hostedByAnimatedShell && style,
      ]}
      contentStyle={[
        styles.content,
        size === "large" && styles.largeContent,
        height !== undefined && { minHeight: height },
        horizontalPadding !== undefined && { paddingHorizontal: horizontalPadding },
        verticalPadding !== undefined && { paddingVertical: verticalPadding },
        iconPosition === "right" && styles.iconRight,
        contentStyle,
      ]}
      labelStyle={[
        styles.label,
        isPrimary || isDanger
          ? styles.primaryLabel
          : isSecondary
            ? styles.secondaryLabel
            : styles.outlineLabel,
        size === "large" && styles.largeLabel,
        fontSize !== undefined && { fontSize },
        lineHeight !== undefined && { lineHeight },
        fontFamily !== undefined && {
          fontFamily:
            fontFamily ??
            Platform.select({ ios: "System", android: "sans-serif", default: "System" }),
        },
        fontWeight !== undefined && { fontWeight },
        styles.centeredLabel,
        labelStyle,
      ]}
      buttonColor={
        onGradient
          ? "transparent"
          : (buttonColor ??
            (isPrimary
              ? COLORS.primary
              : isSecondary
                ? "#D7837B"
                : isSelected
                  ? "#E9E2CF"
                  : isDanger
                    ? "#A83C24"
                    : "#FFF8E5"))
      }
      textColor={
        textColor ??
        (isPrimary || isDanger
          ? "#F6F0DF"
          : isSecondary
            ? "#241010"
            : isSelected
              ? COLORS.primaryDark
              : COLORS.primary)
      }
    >
      {label}
    </PaperButton>
  );

  if (usesDepthGradient) {
    return (
      <Animated.View
        style={[
          styles.gradientShell,
          isPressed && styles.gradientShellPressed,
          pressMotionStyle,
          fullWidth ? styles.fullWidth : styles.fitContent,
          width !== undefined && { width },
          flex !== undefined && { flex },
          { borderRadius: resolvedBorderRadius },
          paperProps.disabled && styles.gradientDisabled,
          style,
        ]}
      >
        <View
          style={[
            styles.gradientSurface,
            isSecondary && styles.secondaryGradientSurface,
            isPressed && styles.gradientSurfacePressed,
            { borderRadius: resolvedBorderRadius },
          ]}
        >
          <Svg
            pointerEvents="none"
            width="100%"
            height="100%"
            preserveAspectRatio="none"
            style={styles.gradientArtwork}
          >
            <Defs>
              <SvgLinearGradient id="buttonDepth" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={depthColors[0]} />
                <Stop offset="0.18" stopColor={depthColors[1]} />
                <Stop offset="0.56" stopColor={depthColors[2]} />
                <Stop offset="0.84" stopColor={depthColors[3]} />
                <Stop offset="1" stopColor={depthColors[4]} />
              </SvgLinearGradient>
            </Defs>
            <Rect width="100%" height="100%" rx={resolvedBorderRadius} fill="url(#buttonDepth)" />
          </Svg>
          {renderPaperButton(true, { onPressIn: handlePressIn, onPressOut: handlePressOut })}
        </View>
      </Animated.View>
    );
  }

  if (isSelected) {
    return (
      <Animated.View
        style={[
          fullWidth ? styles.fullWidth : styles.fitContent,
          width !== undefined && { width },
          flex !== undefined && { flex },
          style,
          pressMotionStyle,
        ]}
      >
        {renderPaperButton(false, { onPressIn: handlePressIn, onPressOut: handlePressOut }, true)}
      </Animated.View>
    );
  }

  return renderPaperButton();
}

const styles = StyleSheet.create({
  button: {
    borderRadius: 18,
  },
  fullWidth: { alignSelf: "stretch" },
  fitContent: { alignSelf: "flex-start" },
  gradientShell: {
    boxShadow: "0 7px 12px rgba(53, 52, 16, 0.30)",
    elevation: 7,
  },
  gradientShellPressed: {
    boxShadow: "0 2px 4px rgba(53, 52, 16, 0.20)",
    elevation: 2,
  },
  gradientSurface: {
    overflow: "hidden",
    backgroundColor: COLORS.primary,
  },
  secondaryGradientSurface: {
    backgroundColor: "#D7837B",
  },
  gradientSurfacePressed: {
    opacity: 0.94,
  },
  gradientArtwork: {
    ...StyleSheet.absoluteFillObject,
  },
  buttonOnGradient: {
    alignSelf: "stretch",
    backgroundColor: "transparent",
  },
  gradientDisabled: {
    opacity: 0.56,
  },
  primaryButton: {
    shadowColor: "#4A4A1E",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 3,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: "rgba(99, 35, 35, 0.24)",
    backgroundColor: "#D7837B",
    boxShadow: "0 5px 10px rgba(123, 53, 49, 0.28)",
  },
  selectedButton: {
    backgroundColor: "#E9E2CF",
    boxShadow: "inset 0 2px 5px rgba(74, 74, 30, 0.22), 0 1px 2px rgba(74, 74, 30, 0.10)",
    elevation: 1,
    transform: [{ translateY: 3 }],
  },
  selectedButtonPressed: {
    backgroundColor: "#E3DCC8",
    boxShadow: "inset 0 3px 6px rgba(74, 74, 30, 0.24), 0 1px 1px rgba(74, 74, 30, 0.08)",
    elevation: 0,
  },
  dangerButton: {
    shadowColor: "#6E2417",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 8,
    elevation: 3,
  },
  outlineButton: {
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    backgroundColor: "#FFF8E5",
  },
  content: {
    minHeight: 52,
    paddingHorizontal: SPACING.md,
    paddingVertical: 9,
  },
  largeContent: {
    minHeight: 60,
    paddingVertical: 12,
  },
  label: {
    fontFamily: FONTS.montserratBold,
    fontSize: 16,
    lineHeight: 21,
  },
  centeredLabel: {
    marginVertical: 0,
    textAlign: "center",
  },
  iconRight: {
    flexDirection: "row-reverse",
  },
  primaryLabel: {
    color: "#F6F0DF",
  },
  secondaryLabel: {
    color: "#241010",
  },
  outlineLabel: {
    color: COLORS.primary,
  },
  largeButton: { borderRadius: 22 },
  largeLabel: { fontSize: 18, lineHeight: 24 },
});
