import { useState } from "react";
import { View, StyleSheet, Pressable, Text, Modal } from "react-native";

import type {
  CourseTabType,
  TrainingLevelType,
  ProgressFilterType,
  RatingFilterType,
  SortingType,
} from "@/shared/utils/courseFilters";
import { COLORS, SPACING, FONTS, BORDER_RADIUS } from "@/constants";
import { FiltersModal } from "./FiltersModal";

const SORT_OPTIONS: { id: SortingType; label: string }[] = [
  { id: "newest", label: "Новые → Старые" },
  { id: "rating", label: "По рейтингу" },
  { id: "name", label: "По названию (А → Я)" },
  { id: "progress", label: "По прогрессу" },
];

const TAB_LABELS: Record<CourseTabType, string> = {
  all: "Все",
  free: "Бесплатные",
  paid: "Платные",
  private: "Приватные",
};

const LEVEL_LABELS: Record<TrainingLevelType, string> = {
  ALL: "Все уровни",
  BEGINNER: "Начальный",
  INTERMEDIATE: "Средний",
  ADVANCED: "Продвинутый",
  EXPERT: "Экспертный",
};

const PROGRESS_LABELS: Record<ProgressFilterType, string> = {
  ALL: "Все курсы",
  NOT_STARTED: "Не начатые",
  IN_PROGRESS: "В процессе",
  COMPLETED: "Завершённые",
  PAUSED: "На паузе",
};

const RATING_LABELS: Record<RatingFilterType, string> = {
  ALL: "Все курсы",
  "4+": "4+ звезды",
  "3+": "3+ звезды",
  ANY: "С рейтингом",
};

export interface CourseFiltersProps {
  activeTab: CourseTabType;
  onTabChange: (tab: CourseTabType) => void;
  activeLevel: TrainingLevelType;
  onLevelChange: (level: TrainingLevelType) => void;
  activeProgress: ProgressFilterType;
  onProgressChange: (progress: ProgressFilterType) => void;
  activeRating: RatingFilterType;
  onRatingChange: (rating: RatingFilterType) => void;
  activeSorting: SortingType;
  onSortingChange: (sorting: SortingType) => void;
  onResetFilters?: () => void;
  getResultsCount?: (filters: {
    tab: CourseTabType;
    level: TrainingLevelType;
    progress: ProgressFilterType;
    rating: RatingFilterType;
  }) => number;
}

export function CourseFilters({
  activeTab,
  onTabChange,
  activeLevel,
  onLevelChange,
  activeProgress,
  onProgressChange,
  activeRating,
  onRatingChange,
  activeSorting,
  onSortingChange,
  onResetFilters,
  getResultsCount,
}: CourseFiltersProps) {
  const [sortModalVisible, setSortModalVisible] = useState(false);
  const [filtersModalVisible, setFiltersModalVisible] = useState(false);

  const activeFiltersCount = [
    activeTab !== "all",
    activeLevel !== "ALL",
    activeProgress !== "ALL",
    activeRating !== "ALL",
  ].filter(Boolean).length;

  const handleResetAll = () => {
    onTabChange("all");
    onLevelChange("ALL");
    onProgressChange("ALL");
    onRatingChange("ALL");
    onResetFilters?.();
  };

  const chips: { id: string; label: string; onClear: () => void }[] = [];
  if (activeTab !== "all") {
    chips.push({ id: "tab", label: TAB_LABELS[activeTab], onClear: () => onTabChange("all") });
  }
  if (activeLevel !== "ALL") {
    chips.push({
      id: "level",
      label: LEVEL_LABELS[activeLevel],
      onClear: () => onLevelChange("ALL"),
    });
  }
  if (activeProgress !== "ALL") {
    chips.push({
      id: "progress",
      label: PROGRESS_LABELS[activeProgress],
      onClear: () => onProgressChange("ALL"),
    });
  }
  if (activeRating !== "ALL") {
    chips.push({
      id: "rating",
      label: RATING_LABELS[activeRating],
      onClear: () => onRatingChange("ALL"),
    });
  }

  const sortLabel = SORT_OPTIONS.find((o) => o.id === activeSorting)?.label ?? "Сортировка";

  return (
    <View style={styles.container}>
      <View style={styles.controlsRow}>
        <Pressable
          style={styles.sortButton}
          onPress={() => setSortModalVisible(true)}
        >
          <Text style={styles.sortIcon}>⇅</Text>
          <Text style={styles.sortButtonText}>{sortLabel}</Text>
        </Pressable>

        <Pressable
          style={styles.filterButton}
          onPress={() => setFiltersModalVisible(true)}
        >
          <Text style={styles.filterIcon}>☰</Text>
          <Text style={styles.filterButtonText}>Фильтры</Text>
          {activeFiltersCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{activeFiltersCount}</Text>
            </View>
          )}
        </Pressable>
      </View>

      {chips.length > 0 && (
        <View style={styles.chipsRow}>
          {chips.map((chip) => (
            <View key={chip.id} style={styles.chip}>
              <Text style={styles.chipLabel} numberOfLines={1}>
                {chip.label}
              </Text>
              <Pressable style={styles.chipRemove} onPress={chip.onClear}>
                <Text style={styles.chipRemoveText}>×</Text>
              </Pressable>
            </View>
          ))}
        </View>
      )}

      <Modal
        visible={sortModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setSortModalVisible(false)}
      >
        <Pressable
          style={styles.sortOverlay}
          onPress={() => setSortModalVisible(false)}
        >
          <View style={styles.sortMenu}>
            {SORT_OPTIONS.map((opt) => (
              <Pressable
                key={opt.id}
                style={[
                  styles.sortOption,
                  activeSorting === opt.id && styles.sortOptionActive,
                ]}
                onPress={() => {
                  onSortingChange(opt.id);
                  setSortModalVisible(false);
                }}
              >
                <Text
                  style={[
                    styles.sortOptionText,
                    activeSorting === opt.id && styles.sortOptionTextActive,
                  ]}
                >
                  {opt.label}
                </Text>
                {activeSorting === opt.id && (
                  <Text style={styles.sortCheck}>✓</Text>
                )}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>

      <FiltersModal
        visible={filtersModalVisible}
        onClose={() => setFiltersModalVisible(false)}
        activeTab={activeTab}
        onTabChange={onTabChange}
        activeLevel={activeLevel}
        onLevelChange={onLevelChange}
        activeProgress={activeProgress}
        onProgressChange={onProgressChange}
        activeRating={activeRating}
        onRatingChange={onRatingChange}
        onApply={() => {}}
        onReset={handleResetAll}
        getResultsCount={getResultsCount}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.sm,
    maxWidth: 600,
    alignSelf: "center",
    width: "100%",
  },
  controlsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: SPACING.sm,
  },
  sortButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    paddingVertical: 12,
    paddingHorizontal: SPACING.md,
    backgroundColor: COLORS.cardBackground,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 2,
    borderColor: COLORS.borderLight,
  },
  sortIcon: {
    fontSize: 18,
    color: COLORS.textSecondary,
  },
  sortButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.text,
    fontFamily: FONTS.montserrat,
    flex: 1,
  },
  filterButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    paddingVertical: 12,
    paddingHorizontal: SPACING.md,
    backgroundColor: COLORS.cardBackground,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 2,
    borderColor: COLORS.borderLight,
  },
  filterIcon: {
    fontSize: 18,
    color: COLORS.textSecondary,
  },
  filterButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.text,
    fontFamily: FONTS.montserrat,
  },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: COLORS.secondary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#fff",
  },
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.cardBackground,
    borderRadius: BORDER_RADIUS.lg,
    paddingLeft: SPACING.sm + 2,
    paddingRight: SPACING.xs,
    paddingVertical: 8,
    borderWidth: 2,
    borderColor: COLORS.borderLight,
  },
  chipLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: COLORS.text,
    maxWidth: 120,
  },
  chipRemove: {
    padding: 4,
    marginLeft: 4,
  },
  chipRemoveText: {
    fontSize: 18,
    color: COLORS.textSecondary,
  },
  sortOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
    padding: SPACING.lg,
  },
  sortMenu: {
    backgroundColor: COLORS.cardBackground,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 2,
    borderColor: COLORS.borderLight,
    minWidth: 260,
  },
  sortOption: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  sortOptionActive: {
    backgroundColor: "#FFF8E5",
  },
  sortOptionText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "500",
    color: COLORS.text,
  },
  sortOptionTextActive: {
    fontWeight: "600",
    color: COLORS.primary,
  },
  sortCheck: {
    fontSize: 16,
    color: COLORS.primary,
    fontWeight: "700",
  },
});
