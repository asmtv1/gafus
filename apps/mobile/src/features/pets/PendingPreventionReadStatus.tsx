/** Local-v2 read visibility only. Never assumes another authEpoch's entries are absent. */
import { Text } from "react-native-paper";
import type { PreventionPendingReadStatus as State } from "./usePreventionOfflineSave";

export function PendingPreventionReadStatus({ status }: { status: State }) {
  if (status === "UNAVAILABLE") {
    return (
      <Text>
        Не удалось проверить записи на устройстве. Они не удалены; откройте раздел повторно после
        восстановления хранилища.
      </Text>
    );
  }
  if (status === "UNVERIFIED") {
    return <Text>Локальные записи доступны только после подтверждения текущего входа.</Text>;
  }
  if (status === "READING" || status === "IDLE") {
    return <Text>Проверяем локальные записи текущей сессии…</Text>;
  }
  return null;
}
