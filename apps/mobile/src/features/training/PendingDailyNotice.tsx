import { View } from "react-native";
import { Text } from "react-native-paper";
import type { PendingTimer } from "@/shared/lib/offline/newOnlyV2TimerPending";
import type { DailyReadStatus } from "./useDailyCompletionLifecycle";
/** Visible only for the verified current schedule/epoch. No server ACK is implied. */
export function PendingDailyNotice({
  rows,
  status,
}: {
  rows: readonly PendingTimer[];
  status: DailyReadStatus;
}) {
  if (status === "UNVERIFIED")
    return <Text>Локальные записи задания дня доступны после подтверждения входа.</Text>;
  if (status === "UNAVAILABLE")
    return (
      <Text>
        Не удалось проверить сохранённые записи задания дня. Результат может быть неопределённым.
      </Text>
    );
  if (status === "READING") return <Text>Проверяем записи текущей сессии…</Text>;
  if (!rows.length)
    return (
      <Text>
        Нет записей в текущей сессии. Локальные записи предыдущего входа могут храниться отдельно;
        они не перенесены автоматически.
      </Text>
    );
  return (
    <View>
      <Text>Изменения задания дня сохранены только на устройстве · не отправлены</Text>
      {rows.map((item) => (
        <Text key={item.eventId}>
          Шаг {item.stepIndex + 1}:{" "}
          {item.status === "COMPLETED"
            ? "Завершён локально"
            : item.status === "PAUSED"
              ? "Пауза"
              : item.status === "RESET"
                ? "Сброшен"
                : "В процессе"}
        </Text>
      ))}
    </View>
  );
}
