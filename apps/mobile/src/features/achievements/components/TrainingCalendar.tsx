import { useMemo } from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { Text, Surface } from "react-native-paper";
import { COLORS, SPACING } from "@/constants";

interface TrainingCalendarProps {
  trainingDates: string[];
  month?: Date;
  onDayPress?: (date: string) => void;
}

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const MONTHS = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"
];

/**
 * Календарь тренировок
 * Отображает дни с тренировками
 */
export function TrainingCalendar({
  trainingDates,
  month = new Date(),
  onDayPress,
}: TrainingCalendarProps) {
  // Преобразуем даты в Set для быстрого поиска
  const trainingDatesSet = useMemo(
    () => new Set(trainingDates),
    [trainingDates]
  );

  // Генерируем дни месяца
  const calendarDays = useMemo(() => {
    const year = month.getFullYear();
    const monthIndex = month.getMonth();

    // Первый день месяца
    const firstDay = new Date(year, monthIndex, 1);
    // Последний день месяца
    const lastDay = new Date(year, monthIndex + 1, 0);

    // День недели первого дня (0 = Вс, корректируем на Пн = 0)
    let startDayOfWeek = firstDay.getDay() - 1;
    if (startDayOfWeek < 0) startDayOfWeek = 6;

    const days: Array<{ date: string; day: number; isCurrentMonth: boolean; isTraining: boolean; isToday: boolean }> = [];

    // Дни предыдущего месяца
    const prevMonth = new Date(year, monthIndex, 0);
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      const day = prevMonth.getDate() - i;
      const date = formatDate(new Date(year, monthIndex - 1, day));
      days.push({
        date,
        day,
        isCurrentMonth: false,
        isTraining: trainingDatesSet.has(date),
        isToday: false,
      });
    }

    // Дни текущего месяца
    const today = formatDate(new Date());
    for (let day = 1; day <= lastDay.getDate(); day++) {
      const date = formatDate(new Date(year, monthIndex, day));
      days.push({
        date,
        day,
        isCurrentMonth: true,
        isTraining: trainingDatesSet.has(date),
        isToday: date === today,
      });
    }

    // Дни следующего месяца (заполняем до 42 дней = 6 недель)
    const remainingDays = 42 - days.length;
    for (let day = 1; day <= remainingDays; day++) {
      const date = formatDate(new Date(year, monthIndex + 1, day));
      days.push({
        date,
        day,
        isCurrentMonth: false,
        isTraining: trainingDatesSet.has(date),
        isToday: false,
      });
    }

    return days;
  }, [month, trainingDatesSet]);

  const monthName = MONTHS[month.getMonth()];
  const year = month.getFullYear();

  return (
    <Surface style={styles.container} elevation={1}>
      {/* Заголовок */}
      <View style={styles.header}>
        <Text variant="titleMedium" style={styles.monthTitle}>
          {monthName} {year}
        </Text>
      </View>

      {/* Дни недели */}
      <View style={styles.weekdaysRow}>
        {WEEKDAYS.map((day) => (
          <Text key={day} style={styles.weekdayText}>
            {day}
          </Text>
        ))}
      </View>

      {/* Дни месяца */}
      <View style={styles.daysGrid}>
        {calendarDays.map((dayInfo, index) => (
          <Pressable
            key={index}
            style={[
              styles.dayCell,
              !dayInfo.isCurrentMonth && styles.dayCellOtherMonth,
              dayInfo.isToday && styles.dayCellToday,
              dayInfo.isTraining && styles.dayCellTraining,
            ]}
            onPress={() => dayInfo.isTraining && onDayPress?.(dayInfo.date)}
          >
            <Text
              style={[
                styles.dayText,
                !dayInfo.isCurrentMonth && styles.dayTextOtherMonth,
                dayInfo.isToday && styles.dayTextToday,
                dayInfo.isTraining && styles.dayTextTraining,
              ]}
            >
              {dayInfo.day}
            </Text>
            {dayInfo.isTraining && <View style={styles.trainingDot} />}
          </Pressable>
        ))}
      </View>

      {/* Легенда */}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: COLORS.success }]} />
          <Text style={styles.legendText}>Тренировка</Text>
        </View>
      </View>
    </Surface>
  );
}

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    padding: SPACING.md,
  },
  header: {
    alignItems: "center",
    marginBottom: SPACING.md,
  },
  monthTitle: {
    fontWeight: "600",
  },
  weekdaysRow: {
    flexDirection: "row",
    marginBottom: SPACING.sm,
  },
  weekdayText: {
    flex: 1,
    textAlign: "center",
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: "500",
  },
  daysGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  dayCell: {
    width: "14.28%",
    aspectRatio: 1,
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  dayCellOtherMonth: {
    opacity: 0.3,
  },
  dayCellToday: {
    backgroundColor: COLORS.primary + "20",
    borderRadius: 20,
  },
  dayCellTraining: {
    backgroundColor: COLORS.success + "20",
    borderRadius: 20,
  },
  dayText: {
    fontSize: 14,
    color: COLORS.text,
  },
  dayTextOtherMonth: {
    color: COLORS.disabled,
  },
  dayTextToday: {
    fontWeight: "bold",
    color: COLORS.primary,
  },
  dayTextTraining: {
    fontWeight: "bold",
    color: COLORS.success,
  },
  trainingDot: {
    position: "absolute",
    bottom: 4,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.success,
  },
  legend: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: SPACING.md,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
});
