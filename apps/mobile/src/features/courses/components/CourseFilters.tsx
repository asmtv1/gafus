import { useState } from "react";
import { View, StyleSheet, Pressable, Text, Modal } from "react-native";

import { MaterialCommunityIcons } from "@expo/vector-icons";

import { STEP_STATUS_FILTER_LABELS } from "@gafus/core/utils/training";
import type {
  CourseTabType,
  TrainingLevelType,
  ProgressFilterType,
  RatingFilterType,
  SortingType,
} from "@/shared/utils/courseFilters";
import { COLORS, SPACING, FONTS, BORDER_RADIUS } from "@/constants";
import { FiltersModal } from "./FiltersModal";

/** Цвет надписей на оливковом (как на web: светлый контраст) */
const LABEL_ON_PRIMARY = "#ECE5D2";

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
  ...STEP_STATUS_FILTER_LABELS,
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

  return (
    <View style={styles.container}>
      <View style={styles.controlsRow}>
        <Pressable
          style={styles.sortButton}
          onPress={() => setSortModalVisible(true)}
        >
          <MaterialCommunityIcons
            name="swap-vertical"
            size={20}
            color={LABEL_ON_PRIMARY}
          />
          <Text style={styles.sortButtonText}>Сортировка</Text>
          <MaterialCommunityIcons
            name="chevron-down"
            size={18}
            color={LABEL_ON_PRIMARY}
          />
        </Pressable>

        <Pressable
          style={styles.filterButton}
          onPress={() => setFiltersModalVisible(true)}
        >
          <MaterialCommunityIcons
            name="tune-variant"
            size={20}
            color={LABEL_ON_PRIMARY}
          />
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
              <Pressable
                style={styles.chipRemove}
                onPress={chip.onClear}
                accessibilityLabel={`Сбросить: ${chip.label}`}
              >
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
    paddingHorizontal: SPACING.sm,
    marginBottom: 20,
    gap: 12,
    maxWidth: 600,
    alignSelf: "center",
    width: "100%",
  },
  controlsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  sortButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: COLORS.primary,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 0,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 2,
    minWidth: 0,
  },
  sortButtonText: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
    color: LABEL_ON_PRIMARY,
    fontFamily: FONTS.montserrat,
  },
  filterButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: COLORS.primary,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 0,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 2,
    minWidth: 0,
  },
  filterButtonText: {
    fontSize: 12,
    fontWeight: "600",
    color: LABEL_ON_PRIMARY,
    fontFamily: FONTS.montserrat,
  },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: COLORS.text,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
    marginLeft: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#fff",
    fontFamily: FONTS.montserrat,
  },
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 10,
    marginTop: 12,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: COLORS.primary,
    borderRadius: BORDER_RADIUS.lg,
    paddingLeft: 16,
    paddingRight: 10,
    paddingVertical: 10,
    borderWidth: 0,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 2,
  },
  chipLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: LABEL_ON_PRIMARY,
    fontFamily: FONTS.montserrat,
    maxWidth: 160,
  },
  chipRemove: {
    width: 24,
    height: 24,
    minWidth: 24,
    minHeight: 24,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  chipRemoveText: {
    fontSize: 18,
    color: LABEL_ON_PRIMARY,
    fontFamily: FONTS.montserrat,
    lineHeight: 20,
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
