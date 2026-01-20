import { View, StyleSheet, Pressable } from "react-native";
import { Text, Surface, Divider } from "react-native-paper";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import Animated, {
  useAnimatedStyle,
  withTiming,
  useSharedValue,
} from "react-native-reanimated";
import { useEffect } from "react";

import { StepTimer } from "./StepTimer";
import { Button } from "@/shared/components/ui";
import { VideoPlayer } from "@/shared/components";
import type { UserStep } from "@/shared/lib/api";
import type { LocalStepState } from "@/shared/stores";
import { COLORS, SPACING } from "@/constants";

interface AccordionStepProps {
  step: UserStep;
  index: number;
  isOpen: boolean;
  localState: LocalStepState | null;
  courseId: string;
  dayOnCourseId: string;
  onToggle: () => void;
  onStart: () => void;
  onPause: (remainingSec: number) => void;
  onResume: () => void;
  onComplete: () => void;
}

/**
 * Компонент аккордеона для шага тренировки
 */
export function AccordionStep({
  step,
  index,
  isOpen,
  localState,
  courseId,
  dayOnCourseId,
  onToggle,
  onStart,
  onPause,
  onResume,
  onComplete,
}: AccordionStepProps) {
  const status = localState?.status || step.status;
  const isCompleted = status === "COMPLETED";
  const isInProgress = status === "IN_PROGRESS";
  const isPaused = status === "PAUSED";
  const isTheory = step.step.type === "THEORY";
  const isPractice = step.step.type === "PRACTICE";

  // Анимация высоты контента
  const heightAnim = useSharedValue(0);

  useEffect(() => {
    heightAnim.value = withTiming(isOpen ? 1 : 0, { duration: 200 });
  }, [isOpen, heightAnim]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: heightAnim.value,
    maxHeight: heightAnim.value * 500, // Достаточная максимальная высота
  }));

  // Иконка статуса
  const getStatusIcon = () => {
    if (isCompleted) {
      return <MaterialCommunityIcons name="check-circle" size={24} color={COLORS.success} />;
    }
    if (isInProgress) {
      return <MaterialCommunityIcons name="play-circle" size={24} color={COLORS.primary} />;
    }
    if (isPaused) {
      return <MaterialCommunityIcons name="pause-circle" size={24} color={COLORS.warning} />;
    }
    return <MaterialCommunityIcons name="circle-outline" size={24} color={COLORS.disabled} />;
  };

  // Иконка типа шага
  const getTypeIcon = () => {
    if (isTheory) return "book-open-variant";
    if (isPractice) return "timer";
    return "file-document";
  };

  return (
    <Surface style={[styles.container, isCompleted && styles.completedContainer]} elevation={1}>
      {/* Заголовок (всегда видимый) */}
      <Pressable onPress={onToggle} style={styles.header}>
        <View style={styles.stepNumber}>
          <Text style={styles.stepNumberText}>{index + 1}</Text>
        </View>

        <View style={styles.headerContent}>
          <Text variant="titleSmall" numberOfLines={2} style={styles.title}>
            {step.step.title}
          </Text>
          <View style={styles.meta}>
            <MaterialCommunityIcons
              name={getTypeIcon()}
              size={14}
              color={COLORS.textSecondary}
            />
            <Text style={styles.metaText}>
              {isTheory ? "Теория" : isPractice ? "Практика" : "Материал"}
            </Text>
            {step.step.durationSec && (
              <>
                <Text style={styles.metaDot}>•</Text>
                <Text style={styles.metaText}>
                  {Math.ceil(step.step.durationSec / 60)} мин
                </Text>
              </>
            )}
          </View>
        </View>

        <View style={styles.headerRight}>
          {getStatusIcon()}
          <MaterialCommunityIcons
            name={isOpen ? "chevron-up" : "chevron-down"}
            size={24}
            color={COLORS.textSecondary}
          />
        </View>
      </Pressable>

      {/* Контент (раскрывающийся) */}
      <Animated.View style={[styles.content, animatedStyle]}>
        {isOpen && (
          <>
            <Divider style={styles.divider} />

            {/* Видео для теоретических шагов */}
            {isTheory && step.step.videoUrl && (
              <View style={styles.videoContainer}>
                <VideoPlayer
                  uri={step.step.videoUrl}
                  onComplete={onComplete}
                />
              </View>
            )}

            {/* Описание */}
            {step.step.description && (
              <Text style={styles.description}>{step.step.description}</Text>
            )}

            {/* Практический шаг с таймером */}
            {isPractice && step.step.durationSec && !isCompleted && (
              <StepTimer
                courseId={courseId}
                dayOnCourseId={dayOnCourseId}
                stepIndex={index}
                totalDuration={localState?.remainingSec || step.step.durationSec}
                onComplete={onComplete}
                onPause={onPause}
              />
            )}

            {/* Кнопки действий */}
            <View style={styles.actions}>
              {isCompleted ? (
                <View style={styles.completedBadge}>
                  <MaterialCommunityIcons name="check" size={16} color={COLORS.success} />
                  <Text style={styles.completedText}>Выполнено</Text>
                </View>
              ) : isTheory ? (
                <Button
                  label="Прочитано"
                  onPress={onComplete}
                  icon="check"
                />
              ) : !isInProgress && !isPaused ? (
                <Button
                  label="Начать"
                  onPress={onStart}
                  icon="play"
                />
              ) : null}
            </View>
          </>
        )}
      </Animated.View>
    </Surface>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    marginBottom: SPACING.sm,
    overflow: "hidden",
  },
  completedContainer: {
    backgroundColor: "#F5FFF5",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    padding: SPACING.md,
  },
  stepNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.primary + "15",
    justifyContent: "center",
    alignItems: "center",
    marginRight: SPACING.sm,
  },
  stepNumberText: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.primary,
  },
  headerContent: {
    flex: 1,
  },
  title: {
    fontWeight: "600",
    marginBottom: 2,
  },
  meta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  metaText: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  metaDot: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs,
  },
  content: {
    overflow: "hidden",
  },
  divider: {
    marginHorizontal: SPACING.md,
  },
  description: {
    padding: SPACING.md,
    paddingTop: SPACING.sm,
    color: COLORS.textSecondary,
    lineHeight: 20,
  },
  actions: {
    padding: SPACING.md,
    paddingTop: 0,
  },
  completedBadge: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.xs,
    padding: SPACING.sm,
    backgroundColor: COLORS.success + "15",
    borderRadius: 8,
  },
  completedText: {
    color: COLORS.success,
    fontWeight: "600",
  },
  videoContainer: {
    padding: SPACING.md,
    paddingTop: SPACING.sm,
  },
});
