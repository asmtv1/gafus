/**
 * The original 1.7.2 Premium paywall visual system, copied without restyling.
 * Only presentational elements belong here: store checkout stays native-only,
 * and signed YooKassa OTA content is resolved independently by Metro.
 */
import { appSubscriptionTierIncludesOfflineCourses } from "@gafus/types";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import { COLORS, FONTS, SPACING } from "@/shared/config";
import type { AppSubscriptionPlanOfferDto } from "../api/appSubscriptionApi";

export const PREMIUM_PLAN_BENEFITS = ["Курсы, экзамены и статьи", "Документы и напоминания"] as const;
export const PREMIUM_OFFLINE_BENEFIT = "Скачивание курсов для офлайн-работы";

export function premiumPlanIncludesOffline(plan: AppSubscriptionPlanOfferDto | null): boolean {
  if (!plan) return false;
  return plan.offlineCourseDownloadIncluded ??
    appSubscriptionTierIncludesOfflineCourses(plan.planTier ?? plan.code);
}

export function Premium172BenefitRow({ label, included }: { label: string; included: boolean }) {
  return (
    <View style={premium172Styles.benefitRow}>
      <MaterialCommunityIcons
        name={included ? "check-circle" : "close-circle-outline"}
        size={20}
        color={included ? "#636128" : "#8E6256"}
      />
      <Text style={[premium172Styles.benefitText, !included && premium172Styles.benefitTextUnavailable]}>
        {label}{included ? "" : " — недоступно"}
      </Text>
    </View>
  );
}

export const premium172Styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F6F0DF" },
  content: { flexGrow: 1, paddingHorizontal: 18, paddingBottom: 24 },
  contentInner: { width: "100%", maxWidth: 640, alignSelf: "center", gap: 14 },
  backRow: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start" },
  backText: { color: COLORS.primary, fontFamily: FONTS.montserratMedium, fontSize: 18 },
  header: { alignItems: "center", paddingVertical: 4 },
  brand: { color: "#C9A646", fontFamily: FONTS.impact, fontSize: 28, lineHeight: 33 },
  providerSection: { gap: 10 },
  sectionTitle: {
    color: "#352E2E",
    fontFamily: FONTS.montserratBold,
    fontSize: 21,
    lineHeight: 27,
  },
  plansList: { gap: 16 },
  planCard: {
    borderRadius: 24,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: "rgba(99, 97, 40, 0.10)",
    borderTopColor: "rgba(255, 255, 255, 0.96)",
    backgroundColor: "#FFFDF5",
    padding: 18,
    gap: 14,
    boxShadow: "0 8px 14px rgba(53, 52, 16, 0.24)",
    elevation: 7,
  },
  planCardSelected: {
    borderWidth: 2,
    borderColor: "#636128",
    borderTopColor: "#D6AF43",
    backgroundColor: "#F0F3DF",
    boxShadow: "0 10px 18px rgba(53, 52, 16, 0.30)",
    elevation: 9,
  },
  planCardPressed: {
    opacity: 0.98,
    transform: [{ translateY: 4 }, { scale: 0.99 }],
    boxShadow: "0 2px 4px rgba(53, 52, 16, 0.18)",
    elevation: 2,
  },
  planTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    flexWrap: "wrap",
    gap: 12,
  },
  planTitleBlock: { flex: 1, gap: 2 },
  planPriceBlock: { alignItems: "flex-end", alignSelf: "stretch", gap: 5 },
  cardTitle: { color: "#352E2E", fontFamily: FONTS.montserratBold, fontSize: 21, lineHeight: 26 },
  cardSubtitle: { color: "#756D65", fontFamily: FONTS.montserrat, fontSize: 13, lineHeight: 18 },
  planPrice: {
    color: "#352E2E",
    fontFamily: FONTS.impact,
    fontSize: 30,
    lineHeight: 35,
    fontVariant: ["tabular-nums"],
  },
  badgeChip: {
    alignSelf: "flex-end",
    minHeight: 30,
    borderRadius: 15,
    paddingHorizontal: 12,
    justifyContent: "center",
    boxShadow: "0 2px 5px rgba(53, 46, 46, 0.14)",
    elevation: 2,
  },
  badgeTry: { borderWidth: 1.5, borderColor: "#636128", backgroundColor: "#FFFDF5" },
  badgePopular: { backgroundColor: "#636128" },
  badgeSavings: { backgroundColor: "#D6AF43" },
  badgeChipText: {
    color: "#FFF9EA",
    fontFamily: FONTS.montserratBold,
    fontSize: 11,
    lineHeight: 15,
  },
  badgeTryText: { color: "#636128" },
  badgeSavingsText: { color: "#352E2E" },
  savingsText: { color: "#636128", fontFamily: FONTS.montserratBold, fontSize: 13, lineHeight: 18 },
  selectedRow: {
    alignSelf: "flex-start",
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderRadius: 19,
    paddingHorizontal: 9,
    backgroundColor: "rgba(99, 97, 40, 0.04)",
  },
  selectedRowActive: {
    backgroundColor: "rgba(99, 97, 40, 0.12)",
    boxShadow: "inset 0 1px 2px rgba(99, 97, 40, 0.10)",
  },
  selectionIconSurface: {
    width: 25,
    height: 25,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
    backgroundColor: "#FFFDF5",
    boxShadow: "0 1px 2px rgba(76, 73, 31, 0.10)",
  },
  selectionIconSurfaceActive: { backgroundColor: "#F6F0DF" },
  selectedLabel: { color: "#636128", fontFamily: FONTS.montserratMedium, fontSize: 13 },
  benefits: { borderTopColor: "rgba(99, 97, 40, 0.14)", borderTopWidth: 1, paddingTop: 13, gap: 9 },
  benefitRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  benefitText: { color: "#352E2E", fontFamily: FONTS.montserrat, fontSize: 13, lineHeight: 19 },
  benefitTextUnavailable: { color: "#8E6256" },
  appleCard: {
    borderRadius: 22,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: "rgba(99, 97, 40, 0.22)",
    backgroundColor: "#FFFDF5",
    padding: 18,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    boxShadow: "0 5px 12px rgba(53, 46, 46, 0.10)",
  },
  applePrice: { color: "#352E2E", fontFamily: FONTS.impact, fontSize: 20, textAlign: "right" },
  appleBenefits: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(99, 97, 40, 0.14)",
    backgroundColor: "rgba(255, 253, 245, 0.72)",
    padding: 14,
    gap: 9,
  },
  providerCaption: {
    color: "#5F5750",
    fontFamily: FONTS.montserrat,
    fontSize: 11,
    lineHeight: 16,
    textAlign: "center",
  },
  promoCard: {
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: "rgba(99, 97, 40, 0.42)",
    backgroundColor: "#FFF9EA",
    padding: SPACING.md,
    gap: 10,
  },
  promoCardApplied: { borderColor: "#636128", backgroundColor: "#EDF0DB" },
  promoHeadingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  promoTitle: { color: COLORS.text, fontFamily: FONTS.montserratBold, fontSize: 17 },
  promoChip: {
    minHeight: 30,
    borderRadius: 15,
    paddingHorizontal: 10,
    justifyContent: "center",
    backgroundColor: "#636128",
  },
  promoChipText: { color: "#F6F0DF", fontFamily: FONTS.montserratBold, fontSize: 13 },
  promoInput: { minHeight: 56, fontFamily: FONTS.montserratMedium, backgroundColor: "#FFFDF5" },
  promoPriceBlock: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(99, 97, 40, 0.34)",
    paddingTop: 10,
    gap: 4,
  },
  promoChargeLabel: { color: "#636128", fontFamily: FONTS.impact, fontSize: 22, lineHeight: 27 },
  promoPriceRow: { flexDirection: "row", alignItems: "baseline", flexWrap: "wrap", gap: 8 },
  promoOriginalPrice: {
    color: COLORS.textSecondary,
    fontFamily: FONTS.montserratMedium,
    fontSize: 15,
    lineHeight: 22,
    textDecorationLine: "line-through",
    fontVariant: ["tabular-nums"],
  },
  promoDiscountedPrice: {
    color: "#636128",
    fontFamily: FONTS.impact,
    fontSize: 26,
    lineHeight: 31,
    fontVariant: ["tabular-nums"],
  },
  promoRenewal: {
    color: COLORS.textSecondary,
    fontFamily: FONTS.montserratMedium,
    fontSize: 12,
    lineHeight: 18,
  },
  promoFirstPaymentNotice: {
    color: "#352E2E",
    fontFamily: FONTS.montserratBold,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 4,
  },
  promoMessage: {
    color: COLORS.textSecondary,
    fontFamily: FONTS.montserratMedium,
    fontSize: 12,
    lineHeight: 17,
  },
  promoErrorMessage: { color: "#9B2F1C" },
  sbpIcon: { width: 20, height: 25 },
  legalText: { color: "#5F5750", fontFamily: FONTS.montserrat, fontSize: 11, lineHeight: 16 },
  legalLink: { color: COLORS.primary, textDecorationLine: "underline" },
  pendingText: {
    borderRadius: 14,
    backgroundColor: "#E8F1DD",
    padding: SPACING.sm,
    color: COLORS.primary,
    fontFamily: FONTS.montserrat,
    lineHeight: 20,
  },
  muted: { color: COLORS.textSecondary, fontFamily: FONTS.montserrat, fontSize: 13 },
  errorText: { color: "#9B2F1C", fontFamily: FONTS.montserrat, fontSize: 12, lineHeight: 17 },
  bottomSpacer: { height: 8 },
});
