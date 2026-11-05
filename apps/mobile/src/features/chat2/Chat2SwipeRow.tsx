import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import ReanimatedSwipeable from "react-native-gesture-handler/ReanimatedSwipeable";
import type { Conversation } from "./api";

/** The right-side actions stay behind the row until an explicit left swipe. */
export function Chat2SwipeRow({ room, children, busy, onRead, onMute }: {
  room: Conversation;
  children: ReactNode;
  busy: boolean;
  onRead: () => void;
  onMute: () => void;
}) {
  return <ReanimatedSwipeable friction={1.8} rightThreshold={55}
    overshootRight={false} enabled={!busy}
    renderRightActions={(_progress, _translation, methods) => (
      <View style={styles.actions}>
        {room.unreadCount > 0 && <Pressable accessibilityRole="button"
          accessibilityLabel="Отметить чат прочитанным" disabled={busy}
          style={[styles.action, styles.read]} onPress={() => { methods.close(); onRead(); }}>
          <Text style={styles.actionText}>Прочитано</Text>
        </Pressable>}
        <Pressable accessibilityRole="button"
          accessibilityLabel={room.muted ? "Включить уведомления чата" : "Отключить уведомления чата"}
          disabled={busy} style={[styles.action, styles.mute]}
          onPress={() => { methods.close(); onMute(); }}>
          <Text style={styles.actionText}>{room.muted ? "Со звуком" : "Без звука"}</Text>
        </Pressable>
      </View>
    )}>
    {children}
  </ReanimatedSwipeable>;
}
const styles = StyleSheet.create({
  actions: { flexDirection: "row", alignItems: "stretch", gap: 5, paddingLeft: 6 },
  action: { minWidth: 94, paddingHorizontal: 8, borderRadius: 14,
    alignItems: "center", justifyContent: "center" },
  read: { backgroundColor: "#566d46" },
  mute: { backgroundColor: "#617383" },
  actionText: { color: "#fff", fontWeight: "600", fontSize: 12 },
});
