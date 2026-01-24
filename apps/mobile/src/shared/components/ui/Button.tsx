import { StyleSheet } from "react-native";
import { Button as PaperButton, type ButtonProps as PaperButtonProps } from "react-native-paper";
import * as Haptics from "expo-haptics";
import { BORDER_RADIUS, COLORS } from "@/constants";

interface ButtonProps extends Omit<PaperButtonProps, "children"> {
  label: string;
  haptic?: boolean;
  variant?: "primary" | "outline";
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
  ...props
}: ButtonProps) {
  const handlePress = async (e: Parameters<NonNullable<PaperButtonProps["onPress"]>>[0]) => {
    if (haptic) {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onPress?.(e);
  };

  const isPrimary = variant === "primary";

  return (
    <PaperButton
      mode={isPrimary ? "contained" : "outlined"}
      onPress={handlePress}
      style={[styles.button, isPrimary ? styles.primaryButton : styles.outlineButton, style]}
      contentStyle={styles.content}
      labelStyle={[styles.label, isPrimary ? styles.primaryLabel : styles.outlineLabel]}
      buttonColor={isPrimary ? COLORS.primary : COLORS.cardBackground}
      textColor={isPrimary ? COLORS.cardBackground : COLORS.primary}
      {...props}
    >
      {label}
    </PaperButton>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: BORDER_RADIUS.sm,
  },
  primaryButton: {
    borderWidth: 2,
    borderColor: COLORS.cardBackground,
  },
  outlineButton: {
    borderWidth: 2,
    borderColor: COLORS.primary,
    backgroundColor: COLORS.cardBackground,
  },
  content: {
    paddingVertical: 6,
  },
  label: {
    fontSize: 18,
    fontWeight: "400",
  },
  primaryLabel: {
    color: COLORS.cardBackground,
  },
  outlineLabel: {
    color: COLORS.primary,
  },
});
