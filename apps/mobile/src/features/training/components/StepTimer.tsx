import { useEffect, useRef, useCallback } from "react";
import { View, StyleSheet } from "react-native";
import { Text, IconButton, ProgressBar } from "react-native-paper";
import * as Haptics from "expo-haptics";
import { useTimerStore } from "@/shared/stores";
import { COLORS, SPACING } from "@/constants";

interface StepTimerProps {
  courseId: string;
  dayOnCourseId: string;
  stepIndex: number;
  totalDuration: number;
  onComplete: () => void;
  onPause: (remainingSec: number) => void;
}

/**
 * Компонент таймера для практических шагов
 */
export function StepTimer({
  courseId,
  dayOnCourseId,
  stepIndex,
  totalDuration,
  onComplete,
  onPause,
}: StepTimerProps) {
  const {
    activeTimer,
    startTimer,
    resumeTimer,
    pauseTimer,
    tick,
    stopTimer,
    isTimerActiveFor,
  } = useTimerStore();

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isActive = isTimerActiveFor(courseId, dayOnCourseId, stepIndex);
  const isRunning = activeTimer?.isRunning ?? false;
  const remainingSec = activeTimer?.remainingSec ?? totalDuration;

  // Форматирование времени
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // Прогресс (0-1)
  const progress = 1 - remainingSec / totalDuration;

  // Запуск интервала
  useEffect(() => {
    if (isActive && isRunning) {
      intervalRef.current = setInterval(() => {
        tick();
      }, 1000);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isActive, isRunning, tick]);

  // Проверка завершения
  useEffect(() => {
    if (isActive && remainingSec <= 0) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      stopTimer();
      onComplete();
    }
  }, [isActive, remainingSec, onComplete, stopTimer]);

  // Старт таймера
  const handleStart = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    startTimer(courseId, dayOnCourseId, stepIndex, totalDuration);
  }, [courseId, dayOnCourseId, stepIndex, totalDuration, startTimer]);

  // Возобновление таймера
  const handleResume = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    resumeTimer(courseId, dayOnCourseId, stepIndex, remainingSec);
  }, [courseId, dayOnCourseId, stepIndex, remainingSec, resumeTimer]);

  // Пауза таймера
  const handlePause = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const remaining = pauseTimer();
    if (remaining !== null) {
      onPause(remaining);
    }
  }, [pauseTimer, onPause]);

  // Если таймер не активен для этого шага — показываем кнопку старта
  if (!isActive) {
    return (
      <View style={styles.container}>
        <View style={styles.timerDisplay}>
          <Text style={styles.timeText}>{formatTime(totalDuration)}</Text>
          <Text style={styles.label}>Нажмите для старта</Text>
        </View>
        <IconButton
          icon="play-circle"
          iconColor={COLORS.primary}
          size={64}
          onPress={handleStart}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Отображение времени */}
      <View style={styles.timerDisplay}>
        <Text style={[styles.timeText, remainingSec <= 10 && styles.timeTextWarning]}>
          {formatTime(remainingSec)}
        </Text>
        <Text style={styles.label}>
          {isRunning ? "Осталось" : "На паузе"}
        </Text>
      </View>

      {/* Прогресс бар */}
      <ProgressBar
        progress={progress}
        color={remainingSec <= 10 ? COLORS.warning : COLORS.primary}
        style={styles.progressBar}
      />

      {/* Кнопки управления */}
      <View style={styles.controls}>
        {isRunning ? (
          <IconButton
            icon="pause-circle"
            iconColor={COLORS.warning}
            size={64}
            onPress={handlePause}
          />
        ) : (
          <IconButton
            icon="play-circle"
            iconColor={COLORS.primary}
            size={64}
            onPress={handleResume}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    padding: SPACING.lg,
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    marginVertical: SPACING.md,
  },
  timerDisplay: {
    alignItems: "center",
    marginBottom: SPACING.md,
  },
  timeText: {
    fontSize: 48,
    fontWeight: "bold",
    color: COLORS.text,
    fontVariant: ["tabular-nums"],
  },
  timeTextWarning: {
    color: COLORS.warning,
  },
  label: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
  },
  progressBar: {
    width: "100%",
    height: 8,
    borderRadius: 4,
    marginBottom: SPACING.md,
  },
  controls: {
    flexDirection: "row",
    justifyContent: "center",
  },
});
