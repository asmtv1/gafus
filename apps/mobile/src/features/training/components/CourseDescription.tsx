import { useState, useCallback } from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { Text, Surface } from "react-native-paper";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { MarkdownText } from "@/shared/components";
import { COLORS, SPACING } from "@/constants";

interface CourseDescriptionProps {
  description: string | null;
  equipment?: string | null;
  trainingLevel?: string | null;
  /** Кнопка «Поделиться» внутри блока описания (как на web) */
  onShare?: () => void;
  courseType?: string;
}

const LEVEL_LABELS: Record<string, string> = {
  BEGINNER: "Начальный",
  INTERMEDIATE: "Средний",
  ADVANCED: "Продвинутый",
  EXPERT: "Экспертный",
};

/**
 * Компонент описания курса с возможностью сворачивания/разворачивания (как на web)
 */
export function CourseDescription({
  description,
  equipment,
  trainingLevel,
  onShare,
  courseType,
}: CourseDescriptionProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleToggle = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  const getTrainingLevelText = (level: string | null) => {
    if (!level) return "Не указан";
    return LEVEL_LABELS[level] || level;
  };

  if (!description) return null;

  return (
    <View style={styles.container}>
      <Pressable onPress={handleToggle}>
        <Surface style={[styles.header, isExpanded && styles.headerExpanded]} elevation={1}>
          <Text variant="titleMedium" style={styles.title}>
            Описание курса
          </Text>
          <View style={styles.expandControl}>
            <Text style={styles.expandText}>{isExpanded ? "Скрыть" : "Подробнее"}</Text>
            <MaterialCommunityIcons
              name="chevron-down"
              size={24}
              color={COLORS.primary}
              style={[styles.expandIcon, isExpanded && styles.expandIconExpanded]}
            />
          </View>
        </Surface>
      </Pressable>

      {isExpanded && (
        <View style={styles.content}>
          <Surface style={styles.contentSurface} elevation={1}>
            <View style={styles.markdownContainer}>
              <MarkdownText text={description} />

              {(equipment || trainingLevel) && (
                <View style={styles.courseInfo}>
                  {trainingLevel && (
                    <View style={styles.infoItem}>
                      <Text style={styles.infoLabel}>Уровень сложности:</Text>
                      <Text style={styles.infoValue}>{getTrainingLevelText(trainingLevel)}</Text>
                    </View>
                  )}
                  {equipment && (
                    <View style={styles.infoItem}>
                      <Text style={styles.infoLabel}>Необходимое оборудование:</Text>
                      <Text style={styles.infoValue}>{equipment}</Text>
                    </View>
                  )}
                </View>
              )}

              {onShare && courseType && (
                <View style={styles.shareButtonContainer}>
                  <Pressable
                    style={({ pressed }) => [styles.shareButton, pressed && styles.shareButtonPressed]}
                    onPress={onShare}
                    accessibilityLabel="Поделиться ссылкой на курс"
                  >
                    <MaterialCommunityIcons
                      name="share-variant"
                      size={20}
                      color={COLORS.text}
                      style={styles.shareIcon}
                    />
                    <Text style={styles.shareButtonText}>Поделиться ссылкой на курс</Text>
                  </Pressable>
                </View>
              )}
            </View>
          </Surface>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: SPACING.md,
    marginHorizontal: SPACING.md,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: SPACING.md,
    backgroundColor: "#ECE5D2",
    borderWidth: 1,
    borderColor: "#636128",
    borderRadius: 12,
  },
  headerExpanded: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  title: {
    fontWeight: "600",
    color: "#352E2E",
    flex: 1,
  },
  expandControl: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs,
  },
  expandText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#636128",
  },
  expandIcon: {
    transform: [{ rotate: "0deg" }],
  },
  expandIconExpanded: {
    transform: [{ rotate: "180deg" }],
  },
  content: {
    // Высота определяется контентом (max-content)
  },
  contentSurface: {
    backgroundColor: "#ECE5D2",
    borderWidth: 1,
    borderColor: "#636128",
    borderTopWidth: 0,
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
  },
  markdownContainer: {
    padding: SPACING.md,
  },
  courseInfo: {
    marginTop: SPACING.md,
    padding: SPACING.md,
    backgroundColor: "#F5F0E8",
    borderWidth: 1,
    borderColor: "#D4C4A8",
    borderRadius: 8,
  },
  infoItem: {
    marginBottom: SPACING.sm,
  },
  infoLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#636128",
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 14,
    color: "#352E2E",
    paddingLeft: SPACING.xs,
  },
  shareButtonContainer: {
    marginTop: SPACING.md,
  },
  shareButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: "#F5F0E8",
    borderWidth: 2,
    borderColor: "#D4C4A8",
    borderRadius: 12,
  },
  shareButtonPressed: {
    opacity: 0.9,
  },
  shareIcon: {
    opacity: 0.9,
  },
  shareButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#352E2E",
  },
});
