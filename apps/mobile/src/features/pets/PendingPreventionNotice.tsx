import { View } from "react-native";
import { Text } from "react-native-paper";
import type { PendingPreventionPreview } from "@/shared/lib/offline/newOnlyV2PreventionPending";

const LABELS: Record<PendingPreventionPreview["type"], string> = {
  VACCINATION: "Прививка",
  DEWORMING: "Глистогонка",
  TICKS_FLEAS: "Клещи и блохи",
};
/** Local-only projection; NEVER implies server commit or exposes a legacy queue. */
export function PendingPreventionNotice({
  entries,
}: {
  entries: readonly PendingPreventionPreview[];
}) {
  if (entries.length === 0) return null;
  return (
    <View accessibilityLabel="Локальные записи о процедурах">
      <Text>Сохранено только на этом устройстве · не отправлено</Text>
      {entries.map((entry) => (
        <View key={entry.eventId}>
          <Text>{LABELS[entry.type]}</Text>
          <Text>Дата: {new Date(entry.performedAt).toLocaleDateString("ru-RU")}</Text>
        </View>
      ))}
    </View>
  );
}
