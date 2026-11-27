import { useSyncExternalStore } from "react";
import { Pressable, Text, TextInput, View, Alert } from "react-native";
import { type Chat2Draft } from "@gafus/core-client/chat2/draft";
import { styles } from "./chat2RoomStyles";
/** The history FlatList and mounted media players do not subscribe to draft
 * keystrokes. The native input keeps its own external-store subscription. */
export function Chat2RoomComposer({
  draftState, editing, pending, uploading, mediaCount, hasUnpreparedMedia, onPick, onSend,
}: {
  draftState: Chat2Draft; editing: boolean; pending: boolean; uploading: boolean;
  mediaCount: number; hasUnpreparedMedia: boolean;
  onPick: (kind: "image" | "video" | "pdf") => void; onSend: () => void;
}) {
  const text = useSyncExternalStore(draftState.subscribe, draftState.getSnapshot, draftState.getSnapshot);
  return (
  <View style={styles.composer}>
    {!editing && (
      <Pressable
        accessibilityLabel="Прикрепить фото, видео или PDF"
        onPress={() =>
          Alert.alert("Вложение", "", [
            { text: "Фото", onPress: () => onPick("image") },
            { text: "Видео MP4", onPress: () => onPick("video") },
            { text: "PDF", onPress: () => onPick("pdf") },
            { text: "Отмена", style: "cancel" },
          ])
        }
      >
        <Text style={styles.attach}>📎</Text>
      </Pressable>
    )}
    <TextInput
      multiline
      maxLength={8000}
      value={text}
      onChangeText={draftState.set}
      placeholder="Напишите сообщение…"
      placeholderTextColor="#000000"
      style={styles.input}
      accessibilityLabel="Текст сообщения"
    />
    <Pressable
      style={[
        styles.send,
        ((!text.trim() && !mediaCount) ||
          pending ||
          uploading ||
          hasUnpreparedMedia) &&
          styles.disabled,
      ]}
      onPress={onSend}
      disabled={
        (!text.trim() && !mediaCount) ||
        pending ||
        uploading ||
        hasUnpreparedMedia
      }
      accessibilityLabel="Отправить сообщение"
    >
      <Text style={styles.sendText}>{pending ? "…" : "➤"}</Text>
    </Pressable>
  </View>
  );
}
