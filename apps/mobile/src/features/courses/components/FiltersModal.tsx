import { useState, useEffect } from "react";
import {
  View,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
  Text,
} from "react-native";

import { STEP_STATUS_FILTER_LABELS } from "@gafus/core/utils/training";
import { TrainingStatus } from "@gafus/types";
import {
  type CourseTabType,
  type TrainingLevelType,
  type ProgressFilterType,
  type RatingFilterType,
} from "@/shared/utils/courseFilters";
import { hapticFeedback } from "@/shared/lib/utils/haptics";
import { COLORS, SPACING, FONTS, BORDER_RADIUS } from "@/constants";

const TAB_OPTIONS: { id: CourseTabType; label: string }[] = [
  { id: "all", label: "Все" },
  { id: "free", label: "Бесплатные" },
  { id: "paid", label: "Платные" },
  { id: "private", label: "Приватные" },
];

const LEVEL_OPTIONS: { id: TrainingLevelType; label: string }[] = [
  { id: "ALL", label: "Все уровни" },
  { id: "BEGINNER", label: "Начальный" },
  { id: "INTERMEDIATE", label: "Средний" },
  { id: "ADVANCED", label: "Продвинутый" },
  { id: "EXPERT", label: "Экспертный" },
];

const PROGRESS_OPTIONS: { id: ProgressFilterType; label: string; icon: string }[] = [
  { id: "ALL", label: "Все курсы", icon: "📚" },
  {
    id: TrainingStatus.NOT_STARTED,
    label: STEP_STATUS_FILTER_LABELS[TrainingStatus.NOT_STARTED],
    icon: "⭐",
  },
  {
    id: TrainingStatus.IN_PROGRESS,
    label: STEP_STATUS_FILTER_LABELS[TrainingStatus.IN_PROGRESS],
    icon: "🔥",
  },
  {
    id: TrainingStatus.COMPLETED,
    label: STEP_STATUS_FILTER_LABELS[TrainingStatus.COMPLETED],
    icon: "✅",
  },
  {
    id: TrainingStatus.PAUSED,
    label: STEP_STATUS_FILTER_LABELS[TrainingStatus.PAUSED],
    icon: "⏸",
  },
  {
    id: TrainingStatus.RESET,
    label: STEP_STATUS_FILTER_LABELS[TrainingStatus.RESET],
    icon: "🔄",
  },
];

const RATING_OPTIONS: { id: RatingFilterType; label: string }[] = [
  { id: "ALL", label: "Все курсы" },
  { id: "4+", label: "4+ звезды" },
  { id: "3+", label: "3+ звезды" },
  { id: "ANY", label: "С рейтингом" },
];

export interface FiltersModalProps {
  visible: boolean;
  onClose: () => void;
  activeTab: CourseTabType;
  onTabChange: (tab: CourseTabType) => void;
  activeLevel: TrainingLevelType;
  onLevelChange: (level: TrainingLevelType) => void;
  activeProgress: ProgressFilterType;
  onProgressChange: (progress: ProgressFilterType) => void;
  activeRating: RatingFilterType;
  onRatingChange: (rating: RatingFilterType) => void;
  onApply: () => void;
  onReset: () => void;
  getResultsCount?: (filters: {
    tab: CourseTabType;
    level: TrainingLevelType;
    progress: ProgressFilterType;
    rating: RatingFilterType;
  }) => number;
}

export function FiltersModal({
  visible,
  onClose,
  activeTab,
  onTabChange,
  activeLevel,
  onLevelChange,
  activeProgress,
  onProgressChange,
  activeRating,
  onRatingChange,
  onApply,
  onReset,
  getResultsCount,
}: FiltersModalProps) {
  const [localTab, setLocalTab] = useState(activeTab);
  const [localLevel, setLocalLevel] = useState(activeLevel);
  const [localProgress, setLocalProgress] = useState(activeProgress);
  const [localRating, setLocalRating] = useState(activeRating);

  useEffect(() => {
    if (visible) {
      setLocalTab(activeTab);
      setLocalLevel(activeLevel);
      setLocalProgress(activeProgress);
      setLocalRating(activeRating);
    }
  }, [visible, activeTab, activeLevel, activeProgress, activeRating]);

  const previewCount =
    getResultsCount?.({
      tab: localTab,
      level: localLevel,
      progress: localProgress,
      rating: localRating,
    }) ?? 0;

  const activeCount = [
    localTab !== "all",
    localLevel !== "ALL",
    localProgress !== "ALL",
    localRating !== "ALL",
  ].filter(Boolean).length;

  const handleApply = () => {
    onTabChange(localTab);
    onLevelChange(localLevel);
    onProgressChange(localProgress);
    onRatingChange(localRating);
    onApply();
    onClose();
  };

  const handleReset = () => {
    setLocalTab("all");
    setLocalLevel("ALL");
    setLocalProgress("ALL");
    setLocalRating("ALL");
    onReset();
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.drawer} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            <Text style={styles.title}>Фильтры</Text>
            <Pressable
              style={styles.closeButton}
              onPress={() => {
                void hapticFeedback.light();
                onClose();
              }}
            >
              <Text style={styles.closeButtonText}>✕</Text>
            </Pressable>
          </View>

          <ScrollView
            style={styles.content}
            contentContainerStyle={styles.contentInner}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Тип курса</Text>
              <View style={styles.optionsGrid}>
                {TAB_OPTIONS.map((opt) => (
                  <Pressable
                    key={opt.id}
                    style={[
                      styles.optionButton,
                      localTab === opt.id && styles.optionButtonActive,
                    ]}
                    onPress={() => {
                      void hapticFeedback.selection();
                      setLocalTab(opt.id);
                    }}
                  >
                    <Text
                      style={[
                        styles.optionButtonText,
                        localTab === opt.id && styles.optionButtonTextActive,
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Уровень сложности</Text>
              <View style={styles.optionsGrid}>
                {LEVEL_OPTIONS.map((opt) => (
                  <Pressable
                    key={opt.id}
                    style={[
                      styles.optionButton,
                      localLevel === opt.id && styles.optionButtonActive,
                    ]}
                    onPress={() => {
                      void hapticFeedback.selection();
                      setLocalLevel(opt.id);
                    }}
                  >
                    <Text
                      style={[
                        styles.optionButtonText,
                        localLevel === opt.id && styles.optionButtonTextActive,
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Прогресс обучения</Text>
              <View style={styles.optionsGrid}>
                {PROGRESS_OPTIONS.map((opt) => (
                  <Pressable
                    key={opt.id}
                    style={[
                      styles.optionButton,
                      localProgress === opt.id && styles.optionButtonActive,
                    ]}
                    onPress={() => {
                      void hapticFeedback.selection();
                      setLocalProgress(opt.id);
                    }}
                  >
                    <Text style={styles.optionEmoji}>{opt.icon}</Text>
                    <Text
                      style={[
                        styles.optionButtonText,
                        localProgress === opt.id && styles.optionButtonTextActive,
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Рейтинг</Text>
              <View style={styles.optionsGrid}>
                {RATING_OPTIONS.map((opt) => (
                  <Pressable
                    key={opt.id}
                    style={[
                      styles.optionButton,
                      localRating === opt.id && styles.optionButtonActive,
                    ]}
                    onPress={() => {
                      void hapticFeedback.selection();
                      setLocalRating(opt.id);
                    }}
                  >
                    <Text
                      style={[
                        styles.optionButtonText,
                        localRating === opt.id && styles.optionButtonTextActive,
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </ScrollView>

          <View style={styles.footer}>
            {activeCount > 0 && (
              <Pressable
                style={styles.resetButton}
                onPress={() => {
                  void hapticFeedback.light();
                  handleReset();
                }}
              >
                <Text style={styles.resetButtonText}>Сбросить</Text>
              </Pressable>
            )}
            <Pressable
              style={styles.applyButton}
              onPress={() => {
                void hapticFeedback.light();
                handleApply();
              }}
            >
              <Text style={styles.applyButtonText}>
                Показать {previewCount > 0 && `(${previewCount})`}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  drawer: {
    backgroundColor: COLORS.background,
    borderTopLeftRadius: BORDER_RADIUS.xl,
    borderTopRightRadius: BORDER_RADIUS.xl,
    maxHeight: "85%",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    borderBottomWidth: 2,
    borderBottomColor: COLORS.borderLight,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: COLORS.text,
    fontFamily: FONTS.montserratBold,
  },
  closeButton: {
    padding: SPACING.sm,
  },
  closeButtonText: {
    fontSize: 20,
    color: COLORS.textSecondary,
  },
  content: {
    maxHeight: 400,
  },
  contentInner: {
    padding: SPACING.lg,
  },
  section: {
    marginBottom: SPACING.lg,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: COLORS.text,
    marginBottom: SPACING.sm,
    fontFamily: FONTS.montserrat,
  },
  optionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SPACING.sm,
  },
  optionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs,
    paddingVertical: 12,
    paddingHorizontal: SPACING.md,
    backgroundColor: COLORS.cardBackground,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 2,
    borderColor: COLORS.borderLight,
  },
  optionButtonActive: {
    backgroundColor: "#FFF8E5",
    borderColor: COLORS.primary,
    borderWidth: 3,
  },
  optionButtonText: {
    fontSize: 14,
    fontWeight: "500",
    color: COLORS.text,
  },
  optionButtonTextActive: {
    fontWeight: "600",
    color: COLORS.primary,
  },
  optionEmoji: {
    fontSize: 16,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    padding: SPACING.lg,
    borderTopWidth: 2,
    borderTopColor: COLORS.borderLight,
  },
  resetButton: {
    paddingVertical: 12,
    paddingHorizontal: SPACING.md,
    backgroundColor: COLORS.cardBackground,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 2,
    borderColor: COLORS.borderLight,
  },
  resetButtonText: {
    fontSize: 14,
    fontWeight: "500",
    color: COLORS.text,
  },
  applyButton: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: SPACING.lg,
    backgroundColor: "#FFF8E5",
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 3,
    borderColor: COLORS.primary,
    alignItems: "center",
  },
  applyButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: COLORS.text,
  },
});
