import { useState, useCallback, useMemo } from "react";
import { View, StyleSheet, Pressable, Linking } from "react-native";
import { Text, Surface } from "react-native-paper";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { MarkdownText, VideoPlayer } from "@/shared/components";
import { useVideoUrl } from "@/shared/hooks";
import { getEmbeddedVideoInfo } from "@gafus/core/utils";
import { COLORS, SPACING } from "@/constants";

interface CourseDescriptionProps {
  description: string | null;
  equipment?: string | null;
  trainingLevel?: string | null;
  /** URL видео презентации курса (как на web) */
  videoUrl?: string | null;
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
  videoUrl,
  onShare,
  courseType,
}: CourseDescriptionProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const videoInfo = useMemo(() => (videoUrl ? getEmbeddedVideoInfo(videoUrl) : null), [videoUrl]);
  const { url: playbackUrl, isLoading: isLoadingVideo, error: videoError } = useVideoUrl(
    videoInfo?.isCDN || videoInfo?.isHLS ? videoUrl ?? null : null,
  );

  const handleToggle = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  const getTrainingLevelText = (level: string | null) => {
    if (!level) return "Не указан";
    return LEVEL_LABELS[level] || level;
  };

  const hasContent = !!description || !!videoUrl;
  if (!hasContent) return null;

  return (
    <View style={styles.container}>
      {/* Pressable внутри Surface: на iOS внешняя обёртка + elevation ломала hit-testing */}
      <Surface style={[styles.headerSurface, isExpanded && styles.headerExpanded]} elevation={1}>
        <Pressable
          onPress={handleToggle}
          style={({ pressed }) => [styles.headerPressable, pressed && styles.headerPressablePressed]}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={isExpanded ? "Скрыть описание курса" : "Подробнее описание курса"}
        >
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
        </Pressable>
      </Surface>

      {isExpanded && (
        <View style={styles.content}>
          <Surface style={styles.contentSurface} elevation={1}>
            <View style={styles.markdownContainer}>
              {description ? <MarkdownText text={description} /> : null}

              {videoUrl && videoInfo && (
                <View style={styles.videoSection}>
                  <Text variant="titleSmall" style={styles.videoTitle}>
                    Видео презентация курса:
                  </Text>
                  {(videoInfo.isCDN || videoInfo.isHLS) ? (
                    isLoadingVideo ? (
                      <View style={styles.videoLoading}>
                        <Text style={styles.videoLoadingText}>Загрузка видео...</Text>
                      </View>
                    ) : videoError ? null : playbackUrl ? (
                      <VideoPlayer uri={playbackUrl} />
                    ) : null
                  ) : videoInfo.embedUrl ? (
                    <Pressable
                      style={({ pressed }) => [styles.videoLinkButton, pressed && styles.videoLinkPressed]}
                      onPress={() => videoUrl && Linking.openURL(videoUrl)}
                    >
                      <MaterialCommunityIcons name="play-circle-outline" size={24} color={COLORS.primary} />
                      <Text style={styles.videoLinkText}>Смотреть видео</Text>
                    </Pressable>
                  ) : (
                    <Pressable
                      style={({ pressed }) => [styles.videoLinkButton, pressed && styles.videoLinkPressed]}
                      onPress={() => videoUrl && Linking.openURL(videoUrl)}
                    >
                      <MaterialCommunityIcons name="open-in-new" size={24} color={COLORS.primary} />
                      <Text style={styles.videoLinkText}>Открыть видео</Text>
                    </Pressable>
                  )}
                </View>
              )}

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
  headerSurface: {
    backgroundColor: "#ECE5D2",
    borderWidth: 1,
    borderColor: "#636128",
    borderRadius: 12,
  },
  headerPressable: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: SPACING.md,
  },
  headerPressablePressed: {
    opacity: 0.92,
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
  videoSection: {
    marginTop: SPACING.md,
  },
  videoTitle: {
    fontWeight: "600",
    color: "#352E2E",
    marginBottom: SPACING.sm,
  },
  videoLoading: {
    aspectRatio: 16 / 9,
    backgroundColor: "#e0e0e0",
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  videoLoadingText: {
    fontSize: 14,
    color: "#666",
  },
  videoLinkButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: "#F5F0E8",
    borderWidth: 2,
    borderColor: "#D4C4A8",
    borderRadius: 12,
  },
  videoLinkPressed: {
    opacity: 0.9,
  },
  videoLinkText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#352E2E",
  },
});
