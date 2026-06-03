import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Text } from "react-native-paper";

import { COLORS, FONTS, SPACING } from "@/shared/config";
import type { RewardedAccessPrompt } from "../lib/rewardedAccessPrompt";

export function RewardedAccessGate({
  title,
  subtitle,
  prompt,
  errorText,
  isBusy = false,
  onPrimaryPress,
  onSubscriptionPress,
}: {
  title: string;
  subtitle: string;
  prompt: RewardedAccessPrompt;
  errorText?: string | null;
  isBusy?: boolean;
  onPrimaryPress: () => void;
  onSubscriptionPress: () => void;
}) {
  const primaryDisabled = isBusy || prompt.mode === "loading";

  return (
    <View style={styles.gate}>
      <View style={styles.header}>
        <MaterialCommunityIcons name="lock-outline" size={22} color={COLORS.primary} />
        <Text style={styles.title}>{title}</Text>
      </View>
      <Text style={styles.subtitle}>{subtitle}</Text>
      <Text style={styles.balance}>{prompt.balanceText}</Text>
      {errorText ? <Text style={styles.error}>{errorText}</Text> : null}
      <View style={styles.actions}>
        <Pressable
          style={[styles.primaryButton, primaryDisabled && styles.disabled]}
          onPress={onPrimaryPress}
          disabled={primaryDisabled}
          accessibilityRole="button"
        >
          {isBusy ? <ActivityIndicator color="#fff" /> : null}
          <Text style={styles.primaryText}>{isBusy ? "Открываем..." : prompt.primaryText}</Text>
        </Pressable>
        <Pressable
          style={styles.secondaryButton}
          onPress={onSubscriptionPress}
          accessibilityRole="button"
        >
          <Text style={styles.secondaryText}>{prompt.subscriptionText}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  gate: {
    alignSelf: "stretch",
    width: "100%",
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "rgba(99, 97, 40, 0.28)",
    backgroundColor: "#FFF9EA",
    padding: SPACING.md,
    gap: 10,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  title: {
    flexShrink: 1,
    fontFamily: FONTS.impact,
    color: "#352E2E",
    fontSize: 20,
    lineHeight: 24,
    textAlign: "center",
  },
  subtitle: {
    fontFamily: FONTS.montserrat,
    color: COLORS.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
  balance: {
    fontFamily: FONTS.montserratMedium,
    color: COLORS.primary,
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
  },
  error: {
    fontFamily: FONTS.montserratMedium,
    color: COLORS.error,
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
  },
  actions: {
    gap: 8,
  },
  primaryButton: {
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: SPACING.md,
  },
  primaryText: {
    fontFamily: FONTS.montserratBold,
    color: "#fff",
    fontSize: 15,
    textAlign: "center",
  },
  secondaryButton: {
    minHeight: 44,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: SPACING.md,
  },
  secondaryText: {
    fontFamily: FONTS.montserratBold,
    color: COLORS.primary,
    fontSize: 15,
    textAlign: "center",
  },
  disabled: {
    opacity: 0.62,
  },
});
