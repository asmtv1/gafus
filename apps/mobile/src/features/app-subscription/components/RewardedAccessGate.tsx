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
  const primaryDisabled =
    isBusy || prompt.mode === "loading" || prompt.rewardedActionDisabled;
  const showSubscriptionFirst = Boolean(prompt.subscriptionText);
  const showRewardedButton =
    prompt.mode === "standard-paywall" && prompt.rewardedActionVisible;

  return (
    <View style={styles.gate}>
      <View style={styles.header}>
        <View style={styles.headerIcon}>
          <MaterialCommunityIcons name="lock-open-outline" size={21} color={COLORS.primary} />
        </View>
        <Text style={styles.title}>{title}</Text>
      </View>
      <Text style={styles.subtitle}>{subtitle}</Text>
      {errorText ? <Text style={styles.error}>{errorText}</Text> : null}
      <View style={styles.actions}>
        {showSubscriptionFirst ? (
          <>
            <Pressable
              style={[styles.primaryButton, isBusy && styles.disabled]}
              onPress={onSubscriptionPress}
              disabled={isBusy}
              accessibilityRole="button"
              accessibilityState={{ disabled: isBusy }}
            >
              <Text style={styles.primaryText}>{prompt.subscriptionText}</Text>
            </Pressable>
            {showRewardedButton ? (
              <>
                <Pressable
                  style={[styles.secondaryButton, primaryDisabled && styles.disabled]}
                  onPress={onPrimaryPress}
                  disabled={primaryDisabled}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: primaryDisabled }}
                >
                  {isBusy ? <ActivityIndicator color={COLORS.primary} /> : null}
                  {!isBusy ? (
                    <MaterialCommunityIcons
                      name="play-circle-outline"
                      size={20}
                      color={COLORS.primary}
                    />
                  ) : null}
                  <Text style={styles.secondaryText}>
                    {isBusy ? "Открываем..." : prompt.primaryText}
                  </Text>
                </Pressable>
                {prompt.rewardedNotice ? (
                  <Text style={styles.notice} selectable accessibilityLiveRegion="polite">
                    {prompt.rewardedNotice}
                  </Text>
                ) : null}
              </>
            ) : null}
          </>
        ) : (
          <>
            <Pressable
              style={[styles.primaryButton, primaryDisabled && styles.disabled]}
              onPress={onPrimaryPress}
              disabled={primaryDisabled}
              accessibilityRole="button"
              accessibilityState={{ disabled: primaryDisabled }}
            >
              {isBusy ? <ActivityIndicator color="#fff" /> : null}
              <Text style={styles.primaryText}>{isBusy ? "Открываем..." : prompt.primaryText}</Text>
            </Pressable>
            {prompt.rewardedNotice ? (
              <Text style={styles.notice} selectable accessibilityLiveRegion="polite">
                {prompt.rewardedNotice}
              </Text>
            ) : null}
            {prompt.subscriptionText ? (
              <Pressable
                style={styles.secondaryButton}
                onPress={onSubscriptionPress}
                accessibilityRole="button"
                accessibilityState={{ disabled: false }}
              >
                <Text style={styles.secondaryText}>{prompt.subscriptionText}</Text>
              </Pressable>
            ) : null}
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  gate: {
    alignSelf: "stretch",
    width: "100%",
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: "rgba(99, 97, 40, 0.28)",
    backgroundColor: "#FFF9EA",
    padding: SPACING.md,
    gap: 11,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  headerIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(99, 97, 40, 0.1)",
  },
  title: {
    flexShrink: 1,
    fontFamily: FONTS.impact,
    color: "#352E2E",
    fontSize: 22,
    lineHeight: 26,
    textAlign: "center",
  },
  subtitle: {
    fontFamily: FONTS.montserratMedium,
    color: "#4E4743",
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
  error: {
    fontFamily: FONTS.montserratMedium,
    color: COLORS.error,
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
  },
  notice: {
    fontFamily: FONTS.montserratMedium,
    color: "#4E4743",
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
    paddingHorizontal: SPACING.xs,
  },
  actions: {
    gap: 9,
  },
  primaryButton: {
    minHeight: 52,
    borderRadius: 16,
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
    fontSize: 16,
    lineHeight: 21,
    textAlign: "center",
  },
  secondaryButton: {
    minHeight: 48,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 7,
    paddingHorizontal: SPACING.md,
  },
  secondaryText: {
    fontFamily: FONTS.montserratBold,
    color: COLORS.primary,
    fontSize: 14,
    lineHeight: 19,
    textAlign: "center",
  },
  disabled: {
    opacity: 0.62,
  },
});
