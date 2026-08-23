import { StyleSheet, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Text } from "react-native-paper";

import { COLORS, FONTS, SPACING } from "@/shared/config";
import { Button } from "@/shared/components/ui";
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
            <Button
              label={prompt.subscriptionText ?? ""}
              height={52}
              fontFamily={FONTS.montserratBold}
              fontSize={16}
              lineHeight={21}
              horizontalPadding={SPACING.md}
              verticalPadding={0}
              borderRadius={16}
              onPress={onSubscriptionPress}
              disabled={isBusy}
              accessibilityRole="button"
              accessibilityState={{ disabled: isBusy }}
            />
            {showRewardedButton ? (
              <>
                <Button
                  label={isBusy ? "Открываем..." : prompt.primaryText}
                  variant="outline"
                  height={48}
                  fontFamily={FONTS.montserratBold}
                  fontSize={14}
                  lineHeight={19}
                  horizontalPadding={SPACING.md}
                  verticalPadding={0}
                  borderRadius={16}
                  loading={isBusy}
                  icon={isBusy ? undefined : "play-circle-outline"}
                  onPress={onPrimaryPress}
                  disabled={primaryDisabled}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: primaryDisabled }}
                />
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
            <Button
              label={isBusy ? "Открываем..." : prompt.primaryText}
              height={52}
              fontFamily={FONTS.montserratBold}
              fontSize={16}
              lineHeight={21}
              horizontalPadding={SPACING.md}
              verticalPadding={0}
              borderRadius={16}
              loading={isBusy}
              onPress={onPrimaryPress}
              disabled={primaryDisabled}
              accessibilityRole="button"
              accessibilityState={{ disabled: primaryDisabled }}
            />
            {prompt.rewardedNotice ? (
              <Text style={styles.notice} selectable accessibilityLiveRegion="polite">
                {prompt.rewardedNotice}
              </Text>
            ) : null}
            {prompt.subscriptionText ? (
              <Button
                label={prompt.subscriptionText}
                variant="outline"
                height={48}
                fontFamily={FONTS.montserratBold}
                fontSize={14}
                lineHeight={19}
                horizontalPadding={SPACING.md}
                verticalPadding={0}
                borderRadius={16}
                onPress={onSubscriptionPress}
                accessibilityRole="button"
                accessibilityState={{ disabled: false }}
              />
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
});
