/** AccordionStep visual tokens/status palette and Native style sheet.
 * Extracted verbatim from the connected component; no change in visual behavior.
 * Owns no timers, network, auth or React state. */
import { StyleSheet } from "react-native";
import type { ComponentProps } from "react";
import type { MaterialCommunityIcons } from "@expo/vector-icons";
import { COLORS, FONTS, SPACING } from "@/shared/config";

type StepStatusIcon = ComponentProps<typeof MaterialCommunityIcons>["name"];

/** Спокойные оттенки поверхности и системные иконки для состояний шага. */
export const STEP_STATUS_CONFIG: Record<
  string,
  {
    icon: StepStatusIcon;
    backgroundColor: string;
    statusBackgroundColor: string;
    foregroundColor: string;
  }
> = {
  NOT_STARTED: {
    icon: "clock-outline",
    backgroundColor: "#FFFDF5",
    statusBackgroundColor: "rgba(99, 97, 40, 0.08)",
    foregroundColor: "#636128",
  },
  IN_PROGRESS: {
    icon: "progress-clock",
    backgroundColor: "#F3F5E8",
    statusBackgroundColor: "rgba(99, 97, 40, 0.12)",
    foregroundColor: "#636128",
  },
  COMPLETED: {
    icon: "check-circle-outline",
    backgroundColor: "#EFF3DF",
    statusBackgroundColor: "rgba(78, 97, 31, 0.13)",
    foregroundColor: "#4E611F",
  },
  PAUSED: {
    icon: "pause-circle-outline",
    backgroundColor: COLORS.cardBackground,
    statusBackgroundColor: "rgba(143, 102, 38, 0.11)",
    foregroundColor: "#795A28",
  },
  RESET: {
    icon: "restart",
    backgroundColor: "#F5F2EC",
    statusBackgroundColor: "rgba(83, 76, 68, 0.09)",
    foregroundColor: "#5F5750",
  },
};

// Цвета как в web Day.module.css
export const WEB = {
  stepBorder: "#636128",
  stepTitleText: "#352e2e",
  stepBg: "#fff8e5",
  timerCardBg: "#fffdf3",
  timerCardBorder: "#d5d0bb",
  completedBadgeBg: "#b6c582",
  completedBadgeText: "#155724",
  circleBtnBorder: "#b6c582",
  estimatedBadgeBg: "#e0e7ff",
  estimatedBadgeText: "#1e3a8a",
};

export const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderColor: "rgba(99, 97, 40, 0.12)",
    borderTopColor: "rgba(255, 255, 255, 0.96)",
    borderRadius: 20,
    borderCurve: "continuous",
    paddingVertical: 12,
    paddingHorizontal: 18,
    marginBottom: SPACING.md,
    boxShadow: "0 7px 14px rgba(53, 52, 16, 0.20)",
    elevation: 7,
  },
  containerOpen: {
    boxShadow: "0 9px 18px rgba(53, 52, 16, 0.24)",
    elevation: 9,
  },
  surfaceContent: {
    overflow: "hidden",
    width: "100%",
    borderRadius: 15,
    borderCurve: "continuous",
  },
  header: {
    flexDirection: "column",
    gap: 7,
    width: "100%",
    paddingVertical: 3,
    paddingHorizontal: 2,
    borderRadius: 14,
  },
  headerPressed: {
    backgroundColor: "rgba(99, 97, 40, 0.07)",
  },
  stepTitleLine: {
    fontSize: 15,
    color: WEB.stepTitleText,
    fontFamily: FONTS.montserratMedium,
    lineHeight: 21,
    width: "100%",
    textAlign: "center",
  },
  headerRowExpand: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    marginTop: 3,
  },
  expandControl: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 0,
    minHeight: 34,
    paddingLeft: 8,
    paddingRight: 11,
    borderRadius: 17,
    backgroundColor: "rgba(99, 97, 40, 0.08)",
  },
  expandText: {
    fontSize: 13,
    color: WEB.stepBorder,
    fontFamily: FONTS.montserratMedium,
    marginLeft: 2,
  },
  stepStatusConfig: {
    flexShrink: 0,
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 11,
    borderRadius: 17,
  },
  stepStatusText: {
    fontSize: 13,
    fontFamily: FONTS.montserratMedium,
    lineHeight: 18,
  },
  content: {
    overflow: "hidden",
  },
  /** Без вложенного ScrollView — иначе при тапах по кнопкам шага родительский ScrollView экрана дёргается на несколько px */
  stepContentInner: {
    paddingBottom: 0,
    alignSelf: "stretch",
    width: "100%",
    maxWidth: "100%",
  },
  divider: {
    marginHorizontal: SPACING.md,
  },
  accessGateWrap: {
    marginTop: SPACING.md,
    alignSelf: "stretch",
    width: "100%",
  },
  descriptionSection: {
    marginTop: SPACING.md,
    paddingHorizontal: 0,
    alignSelf: "stretch",
    width: "100%",
    maxWidth: "100%",
  },
  descriptionSectionTitle: {
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: 6,
    fontSize: 14,
  },
  descriptionSectionContent: {
    backgroundColor: WEB.timerCardBg,
    borderWidth: 2,
    borderColor: WEB.timerCardBorder,
    borderRadius: 12,
    padding: 12,
    paddingHorizontal: 14,
    alignSelf: "stretch",
    width: "100%",
    maxWidth: "100%",
  },
  imagesSection: {
    marginTop: SPACING.md,
    alignSelf: "stretch",
  },
  stepTrainerImage: {
    width: "100%",
    aspectRatio: 16 / 9,
    marginBottom: SPACING.sm,
    borderRadius: 12,
    backgroundColor: "#f0f0f0",
    alignSelf: "center",
  },
  imageViewerRoot: {
    flex: 1,
    backgroundColor: "#000",
  },
  imageViewerHeader: {
    position: "absolute",
    top: 0,
    right: 0,
    left: 0,
    zIndex: 10,
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "flex-start",
  },
  imageViewerPage: {
    backgroundColor: "#000",
    justifyContent: "center",
  },
  /** Паритет с web .stepInfo + StepDiaryBlock */
  diaryStepInfo: {
    marginTop: SPACING.md,
    gap: 12,
    marginBottom: 16,
  },
  diarySectionTitle: {
    fontWeight: "700",
    color: WEB.stepTitleText,
    marginBottom: 6,
    fontSize: 15,
  },
  diaryTextarea: {
    width: "100%",
    minHeight: 120,
    padding: 12,
    borderWidth: 2,
    borderColor: WEB.timerCardBorder,
    borderRadius: 8,
    fontSize: 16,
    textAlignVertical: "top",
    color: COLORS.text,
    backgroundColor: "#fff",
  },
  diaryError: {
    color: "#b71c1c",
    fontSize: 14,
  },
  diarySaveAction: {
    marginTop: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  diaryEntriesList: {
    gap: 12,
  },
  diaryEntryItem: {
    padding: 12,
    backgroundColor: WEB.timerCardBg,
    borderWidth: 1,
    borderColor: WEB.timerCardBorder,
    borderRadius: 8,
  },
  diaryEntryTitle: {
    fontWeight: "700",
    color: WEB.stepTitleText,
    fontSize: 15,
  },
  diaryEntryDate: {
    fontSize: 13,
    color: "#666",
    marginTop: 4,
  },
  diaryEntryContent: {
    marginTop: 8,
    fontSize: 15,
    color: WEB.stepTitleText,
  },
  actions: {
    padding: SPACING.md,
    paddingTop: 0,
  },
  completeAction: {
    marginTop: SPACING.md,
    alignItems: "center",
    justifyContent: "center",
  },
  completeButtonLayout: {
    alignSelf: "center",
  },
  completedBadge: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
    backgroundColor: WEB.completedBadgeBg,
    marginTop: SPACING.sm,
    alignSelf: "center",
  },
  completedBadgeCheck: {
    fontSize: 18,
    fontWeight: "bold",
    color: WEB.completedBadgeText,
    width: 24,
    textAlign: "center",
  },
  completedBadgeText: {
    color: WEB.completedBadgeText,
    fontSize: 15,
    fontWeight: "600",
  },
  completedText: {
    color: COLORS.success,
    fontWeight: "600",
  },
  videoContainer: {
    paddingVertical: SPACING.sm,
    paddingHorizontal: 0,
  },
  videoCover: {
    aspectRatio: 16 / 9,
    backgroundColor: "#1a1a1a",
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  videoCoverText: {
    marginTop: SPACING.sm,
    fontSize: 16,
    color: "#fff",
  },
  embedWebViewWrap: {
    width: "100%",
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#000",
  },
  embedWebView: {
    width: "100%",
    backgroundColor: "#000",
  },
  infoCard: {
    padding: 14,
    paddingHorizontal: 0,
    backgroundColor: WEB.timerCardBg,
    borderWidth: 2,
    borderColor: WEB.timerCardBorder,
    borderRadius: 12,
    marginTop: 10,
    alignItems: "center",
  },
  infoCardTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  infoCardText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: "center",
  },
  estimatedTimeBadge: {
    marginTop: 8,
    alignSelf: "center",
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: WEB.estimatedBadgeBg,
  },
  estimatedTimeBadgeText: {
    fontSize: 13,
    fontWeight: "500",
    color: WEB.estimatedBadgeText,
  },
  timerCard: {
    padding: 14,
    paddingHorizontal: 16,
    marginTop: 10,
    backgroundColor: WEB.timerCardBg,
    borderWidth: 2,
    borderColor: WEB.timerCardBorder,
    borderRadius: 12,
    alignItems: "center",
  },
  timerHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  timerHeaderText: {
    fontSize: 14,
    color: COLORS.text,
    fontWeight: "600",
  },
  timerControls: {
    alignItems: "center",
  },
  timerDisplay: {
    fontSize: 48,
    fontWeight: "600",
    color: COLORS.text,
    fontVariant: ["tabular-nums"],
    marginVertical: 8,
    fontFamily: "monospace",
  },
  timerButtons: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.sm,
    paddingVertical: 8,
  },
  circleBtn: {
    width: 55,
    height: 55,
    borderRadius: 28,
    borderWidth: 4,
    borderColor: WEB.circleBtnBorder,
    backgroundColor: "transparent",
  },
  circleBtnReset: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 4,
    borderColor: WEB.circleBtnBorder,
    backgroundColor: "transparent",
  },
  videoLoadingContainer: {
    aspectRatio: 16 / 9,
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    padding: SPACING.lg,
  },
  videoLoadingText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: "center",
  },
  videoRetryButtonLayout: {
    marginTop: SPACING.sm,
  },
});

