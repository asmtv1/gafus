/** Phase1 local-only pending practice, never a server acknowledgement. */
import { View } from "react-native";
import { Text } from "react-native-paper";
import type { LocalPracticePending } from "@/shared/lib/offline/newOnlyV2PracticePending";
import type { PracticeReadStatus } from "./usePracticePendingScreen";
export function PendingPracticeNotice({
  entries,
  status,
}: {
  entries: readonly LocalPracticePending[];
  status: PracticeReadStatus;
}) {
  if (status === "UNVERIFIED")
    return <Text>Локальные изменения практики доступны после подтверждения входа.</Text>;
  if (status === "UNAVAILABLE")
    return (
      <Text>
        Не удалось проверить локальные записи практики. Результат неизвестен; записи не удалены.
      </Text>
    );
  if (status === "READING") return <Text>Проверяем локальные записи практики…</Text>;
  if (!entries.length) return null;
  return (
    <View>
      <Text>Практика сохранена только на устройстве · не отправлена</Text>
      <Text>{entries.map((item) => `Шаг ${item.stepIndex + 1}`).join(", ")}</Text>
    </View>
  );
}
