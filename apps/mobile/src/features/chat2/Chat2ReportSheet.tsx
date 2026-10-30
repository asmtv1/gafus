import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { reportClientError } from "@/shared/lib/tracer";
import { chat2 } from "./api";
const olive = "#748650";
/** Only message ID and selected reason are sent; reporter identity comes from Hono JWT. */
export function Chat2ReportSheet({
  id,
  messageId,
  onClose,
  onSuccess,
}: {
  id: string;
  messageId: string | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [reason, setReason] = useState<"SPAM" | "ABUSE" | "OTHER">("SPAM");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function send() {
    if (!messageId || busy) return;
    setBusy(true);
    setError("");
    try {
      await chat2.report(id, messageId, { reason, comment: comment.trim() });
      setComment("");
      setReason("SPAM");
      onSuccess();
      onClose();
    } catch (e) {
      reportClientError(new Error("CHAT2_REPORT_FAILED"), {
        issueKey: "Chat2Report",
        keys: { operation: "send" },
      });
      setError(e instanceof Error ? e.message : "Не удалось отправить жалобу");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal visible={!!messageId} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.cover}>
        <View style={styles.sheet}>
          <View style={styles.heading}>
            <Text style={styles.title}>Пожаловаться</Text>
            <Pressable onPress={onClose} accessibilityLabel="Закрыть жалобу">
              <Text style={styles.close}>×</Text>
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body}>
            <Text style={styles.help}>
              Выберите причину. Жалоба доступна только модераторам чата.
            </Text>
            {(
              [
                ["SPAM", "Спам или реклама"],
                ["ABUSE", "Оскорбления или травля"],
                ["OTHER", "Другое нарушение"],
              ] as const
            ).map(([key, label]) => (
              <Pressable
                key={key}
                style={[styles.choice, reason === key && styles.selected]}
                onPress={() => setReason(key)}
                accessibilityRole="radio"
                accessibilityState={{ selected: reason === key }}
              >
                <Text style={styles.option}>
                  {reason === key ? "●" : "○"} {label}
                </Text>
              </Pressable>
            ))}
            <Text style={styles.caption}>Дополнительное пояснение (необязательно)</Text>
            <TextInput
              style={styles.textarea}
              multiline
              maxLength={500}
              value={comment}
              onChangeText={setComment}
              placeholder="Опишите проблему"
            />
            {!!error && (
              <Text style={styles.error} accessibilityRole="alert">
                {error}
              </Text>
            )}
            <Pressable
              style={[styles.submit, busy && styles.disabled]}
              disabled={busy}
              onPress={() => void send()}
            >
              <Text style={styles.submitText}>{busy ? "Отправляем…" : "Отправить жалобу"}</Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
const styles = StyleSheet.create({
  cover: { flex: 1, justifyContent: "flex-end", backgroundColor: "#0008" },
  sheet: {
    maxHeight: "82%",
    backgroundColor: "#fffcf7",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingTop: 12,
  },
  heading: { flexDirection: "row", alignItems: "center", paddingHorizontal: 18 },
  title: { fontWeight: "700", fontSize: 19, color: "#33442e", flex: 1 },
  close: { fontSize: 26, color: olive, paddingHorizontal: 6 },
  body: { padding: 18, paddingBottom: 38, gap: 9 },
  help: { fontSize: 13, color: "#68735e", marginBottom: 8 },
  choice: {
    padding: 13,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#e3e9d7",
    backgroundColor: "white",
  },
  selected: { borderColor: olive, backgroundColor: "#f0f4e7" },
  option: { fontSize: 14, color: "#506441" },
  caption: { fontSize: 12, color: "#68735e", marginTop: 9 },
  textarea: {
    borderWidth: 1,
    borderColor: "#d8dfcb",
    borderRadius: 11,
    minHeight: 90,
    padding: 11,
    backgroundColor: "white",
    textAlignVertical: "top",
  },
  submit: {
    backgroundColor: olive,
    borderRadius: 11,
    padding: 14,
    alignItems: "center",
    marginTop: 8,
  },
  submitText: { fontSize: 14, fontWeight: "700", color: "white" },
  disabled: { opacity: 0.5 },
  error: { color: "#b23d30", fontSize: 12 },
});
